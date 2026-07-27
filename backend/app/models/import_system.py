import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base

class ImportHistory(Base):
    """
    Audit log table for all department-level data imports.
    Stores metadata, file info, total records, success/failure counts, and detailed validation errors.
    """
    __tablename__ = "import_history"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    department_id = Column(String(36), ForeignKey("departments.id", ondelete="CASCADE"), nullable=False, index=True)
    uploaded_by_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(50), default="CSV", nullable=False) # CSV, XLSX, XLS, JSON
    upload_time = Column(DateTime, default=datetime.utcnow, nullable=False)
    total_records = Column(Integer, default=0, nullable=False)
    successful_records = Column(Integer, default=0, nullable=False)
    failed_records = Column(Integer, default=0, nullable=False)
    warning_records = Column(Integer, default=0, nullable=False)
    missing_fields_count = Column(Integer, default=0, nullable=False)
    import_status = Column(String(50), default="STAGED", nullable=False, index=True) # STAGED, VALIDATED, CONFIRMED, FAILED, CANCELLED
    validation_errors = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    department = relationship("Department", lazy="selectin")
    uploaded_by = relationship("User", lazy="selectin")
    staging_records = relationship("ImportStagingRecord", back_populates="import_history", cascade="all, delete-orphan", lazy="selectin")

class ImportStagingRecord(Base):
    """
    Staging table for department data records prior to production commit.
    Allows HOD/Coordinator to inspect, validate, edit missing fields, and confirm commit.
    """
    __tablename__ = "department_import_staging"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    import_history_id = Column(String(36), ForeignKey("import_history.id", ondelete="CASCADE"), nullable=False, index=True)
    department_id = Column(String(36), ForeignKey("departments.id", ondelete="CASCADE"), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False, index=True) # FACULTY, SUBJECT, SECTION, CLASSROOM, STUDENT, PREFERENCE
    row_number = Column(Integer, nullable=False)
    raw_data = Column(JSON, nullable=False)
    validation_status = Column(String(50), default="VALID", nullable=False, index=True) # VALID, INVALID, WARNING, MISSING_DATA
    missing_fields_list = Column(JSON, nullable=True)
    error_messages = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    import_history = relationship("ImportHistory", back_populates="staging_records", lazy="selectin")
