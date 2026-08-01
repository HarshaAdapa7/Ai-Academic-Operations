import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, Text, JSON
from app.core.database import Base
import enum

class NotificationCategory(str, enum.Enum):
    LEAVE_OPERATIONS = "LEAVE_OPERATIONS"
    TIMETABLE_CHANGE = "TIMETABLE_CHANGE"
    EXAM_DUTY = "EXAM_DUTY"
    DAILY_SCHEDULE = "DAILY_SCHEDULE"
    AI_ALERT = "AI_ALERT"
    DATA_IMPORT = "DATA_IMPORT"
    SYSTEM = "SYSTEM"

class NotificationPriority(str, enum.Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    URGENT = "URGENT"

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String(36), nullable=True, index=True)
    target_role = Column(String(20), nullable=True, index=True)  # ADMIN, DEAN, HOD, FACULTY, ALL
    department_id = Column(String(36), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    category = Column(String(50), default=NotificationCategory.SYSTEM, nullable=False)
    priority = Column(String(20), default=NotificationPriority.NORMAL, nullable=False)
    action_url = Column(String(255), nullable=True)
    action_payload = Column(JSON, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
