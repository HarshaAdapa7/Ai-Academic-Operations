import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, update, delete, or_

from app.models.notification import Notification, NotificationCategory, NotificationPriority
from app.models.user import User, UserRole
from app.models.faculty import FacultyProfile, Department
from app.models.leave import LeaveRequest, SubstitutionProposal
from app.core.ws_manager import ws_manager

logger = logging.getLogger("notification-service")

async def create_notification(
    db: AsyncSession,
    title: str,
    message: str,
    category: str = NotificationCategory.SYSTEM,
    priority: str = NotificationPriority.NORMAL,
    user_id: Optional[str] = None,
    target_role: Optional[str] = None,
    department_id: Optional[str] = None,
    action_url: Optional[str] = None,
    action_payload: Optional[dict] = None
) -> Notification:
    notif = Notification(
        user_id=user_id,
        target_role=target_role.upper() if target_role else None,
        department_id=department_id,
        title=title,
        message=message,
        category=category,
        priority=priority,
        action_url=action_url,
        action_payload=action_payload,
        created_at=datetime.utcnow()
    )
    db.add(notif)
    await db.commit()
    await db.refresh(notif)

    payload = {
        "type": "NEW_NOTIFICATION",
        "notification": {
            "id": notif.id,
            "title": notif.title,
            "message": notif.message,
            "category": notif.category,
            "priority": notif.priority,
            "action_url": notif.action_url,
            "action_payload": notif.action_payload,
            "is_read": notif.is_read,
            "created_at": notif.created_at.isoformat()
        }
    }

    if user_id:
        await ws_manager.send_personal_message(payload, user_id)
    elif target_role:
        await ws_manager.broadcast_to_role(payload, target_role)
    elif department_id:
        await ws_manager.broadcast_to_department(payload, department_id)
    else:
        await ws_manager.broadcast_to_role(payload, "ALL")

    return notif

async def get_user_notifications(
    db: AsyncSession,
    user: User,
    unread_only: bool = False,
    category: Optional[str] = None,
    limit: int = 50
) -> List[Notification]:
    stmt = select(Notification)

    from app.api.deps import get_user_department_id
    user_dept_id = await get_user_department_id(user, db)

    conditions = [
        Notification.user_id == user.id,
        Notification.target_role == "ALL"
    ]
    if user.role:
        role_str = user.role.value if hasattr(user.role, "value") else str(user.role).upper()
        conditions.append(Notification.target_role == role_str)
    if user_dept_id:
        conditions.append(Notification.department_id == user_dept_id)

    stmt = stmt.where(or_(*conditions))

    if unread_only:
        stmt = stmt.where(Notification.is_read == False)

    if category and category.upper() != "ALL":
        stmt = stmt.where(Notification.category == category.upper())

    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
    res = await db.execute(stmt)
    return res.scalars().all()

async def get_unread_count(db: AsyncSession, user: User) -> int:
    from app.api.deps import get_user_department_id
    user_dept_id = await get_user_department_id(user, db)

    role_str = user.role.value if hasattr(user.role, "value") else str(user.role).upper()
    conditions = [
        Notification.user_id == user.id,
        Notification.target_role == "ALL",
        Notification.target_role == role_str
    ]
    if user_dept_id:
        conditions.append(Notification.department_id == user_dept_id)

    stmt = select(func.count(Notification.id)).where(
        Notification.is_read == False,
        or_(*conditions)
    )
    res = await db.execute(stmt)
    return res.scalar() or 0

async def mark_notifications_read(db: AsyncSession, notification_ids: List[str]):
    stmt = update(Notification).where(Notification.id.in_(notification_ids)).values(
        is_read=True,
        read_at=datetime.utcnow()
    )
    await db.execute(stmt)
    await db.commit()

async def mark_all_notifications_read(db: AsyncSession, user: User):
    from app.api.deps import get_user_department_id
    user_dept_id = await get_user_department_id(user, db)
    role_str = user.role.value if hasattr(user.role, "value") else str(user.role).upper()

    conditions = [
        Notification.user_id == user.id,
        Notification.target_role == "ALL",
        Notification.target_role == role_str
    ]
    if user_dept_id:
        conditions.append(Notification.department_id == user_dept_id)

    stmt = update(Notification).where(
        Notification.is_read == False,
        or_(*conditions)
    ).values(is_read=True, read_at=datetime.utcnow())

    await db.execute(stmt)
    await db.commit()

async def get_department_leave_counts(db: AsyncSession, target_date: Optional[datetime] = None) -> List[Dict[str, Any]]:
    check_date = (target_date or datetime.utcnow()).date()
    depts = (await db.execute(select(Department).order_by(Department.code.asc()))).scalars().all()
    
    leaves_stmt = select(LeaveRequest).where(
        LeaveRequest.status.in_(["APPROVED", "Approved"])
    )
    leaves_res = await db.execute(leaves_stmt)
    active_leaves = leaves_res.scalars().all()

    todays_leaves = [
        l for l in active_leaves 
        if l.start_date.date() <= check_date <= l.end_date.date()
    ]

    faculty_ids = [l.faculty_id for l in todays_leaves if l.faculty_id]
    dept_leave_counts = {d.id: 0 for d in depts}

    if faculty_ids:
        prof_res = await db.execute(select(FacultyProfile).where(FacultyProfile.id.in_(faculty_ids)))
        profs = prof_res.scalars().all()
        for p in profs:
            if p.department_id in dept_leave_counts:
                dept_leave_counts[p.department_id] += 1

    result = []
    for d in depts:
        result.append({
            "department_id": d.id,
            "department_code": d.code,
            "department_name": d.name,
            "absent_faculty_count": dept_leave_counts[d.id]
        })
    return result
