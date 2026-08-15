import logging
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.notification import Notification
from app.api.deps import get_current_user, get_optional_current_user, get_user_department_id
from app.core.ws_manager import ws_manager
from app.services.notification_service import (
    get_user_notifications, get_unread_count, mark_notifications_read,
    mark_all_notifications_read, get_department_leave_counts, create_notification
)
from app.services.daily_schedule_dispatcher import dispatch_daily_faculty_schedules

logger = logging.getLogger("notifications-api")

router = APIRouter()

class MarkReadInput(BaseModel):
    notification_ids: List[str]

@router.get("")
@router.get("/")
async def list_notifications(
    category: Optional[str] = Query(None),
    unread_only: bool = Query(False),
    limit: int = Query(50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    notifs = await get_user_notifications(db, current_user, unread_only=unread_only, category=category, limit=limit)
    return [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "category": n.category,
            "priority": n.priority,
            "action_url": n.action_url,
            "action_payload": n.action_payload,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None
        }
        for n in notifs
    ]

@router.get("/unread-count")
async def fetch_unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    count = await get_unread_count(db, current_user)
    return {"unread_count": count}

@router.get("/dept-leave-counts")
async def fetch_department_leave_counts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.ADMIN, "DEAN", UserRole.HOD, "HOD"]:
        raise HTTPException(status_code=403, detail="Not authorized to view department leave metrics.")
    counts = await get_department_leave_counts(db)
    return counts

@router.post("/mark-read")
async def mark_read(
    input_data: MarkReadInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await mark_notifications_read(db, input_data.notification_ids)
    return {"message": "Notifications marked as read."}

@router.post("/mark-all-read")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await mark_all_notifications_read(db, current_user)
    return {"message": "All notifications marked as read."}

@router.post("/dispatch-daily-emails")
async def trigger_daily_schedule_emails(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.ADMIN, "DEAN", UserRole.HOD, "HOD"]:
        raise HTTPException(status_code=403, detail="Not authorized to trigger daily email dispatch.")
    res = await dispatch_daily_faculty_schedules()
    return res

@router.delete("/{id}")
async def delete_notification_entry(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Notification).where(Notification.id == id)
    res = await db.execute(stmt)
    notif = res.scalars().first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")
    await db.delete(notif)
    await db.commit()
    return {"message": "Notification deleted successfully."}

@router.websocket("/ws/notifications")
@router.websocket("/ws")
@router.websocket("/notifications")
@router.websocket("")
async def websocket_notifications_endpoint(
    websocket: WebSocket,
    user_id: Optional[str] = Query(None),
    role: Optional[str] = Query("FACULTY"),
    department_id: Optional[str] = Query(None)
):
    target_user_id = user_id or "anonymous"
    await ws_manager.connect(websocket, target_user_id, role=role or "FACULTY", department_id=department_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, target_user_id)
    except Exception as e:
        logger.warning(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket, target_user_id)
