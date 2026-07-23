import uvicorn
import traceback
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import engine, Base
from app.models.user import User, PasswordReset
from app.models.faculty import Department, Subject, FacultyProfile, FacultyAvailability
from app.models.leave import FacultyLeaveBalance, LeaveRequest, SubstitutionProposal
from app.models.classroom import Classroom, SeatingPlan, SeatingAssignment
from app.models.timetable import SchedulingRule, SubjectSchedulingRule, TimetableEntry, ExamTimetableEntry
from app.models.ai import AIConversation, AIMessage, AcademicPolicy

from app.api.auth import router as auth_router
from app.api.faculty import router as faculty_router
from app.api.leave import router as leave_router
from app.api.classroom import router as classroom_router
from app.api.timetable import router as timetable_router
from app.api.ai import router as ai_router

# Trigger live uvicorn reload - active
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Startup Academic Scheduling & Faculty Operations Platform - Backend API",
    version="1.0.0",
)

# Set CORS origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(faculty_router, prefix=settings.API_V1_STR, tags=["Faculty Management"])
app.include_router(leave_router, prefix=settings.API_V1_STR, tags=["Leave & Substitutions"])
app.include_router(classroom_router, prefix=settings.API_V1_STR, tags=["Classrooms & Seating"])
app.include_router(timetable_router, prefix=settings.API_V1_STR, tags=["Timetable Operations"])
app.include_router(ai_router, prefix=settings.API_V1_STR, tags=["AI Decision Center"])

from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    """HTTPException handler to return CORS-compliant error responses."""
    origin = request.headers.get("origin") or "http://localhost:5173"
    headers = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*"
    }
    if exc.headers:
        headers.update(exc.headers)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    """Validation exception handler to log request payloads and validation errors to stdout."""
    body = await request.body()
    print(f"--- Request Validation Error ---")
    print(f"URL: {request.url}")
    print(f"Errors: {exc.errors()}")
    print(f"Body: {body.decode('utf-8', errors='ignore')}")
    print(f"--------------------------------")
    origin = request.headers.get("origin") or "http://localhost:5173"
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*"
        }
    )

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler to print stack trace and return CORS-compliant error responses."""
    tb = traceback.format_exc()
    print(f"--- Global Unhandled Exception ---\n{tb}\n---------------------------------")
    origin = request.headers.get("origin") or "http://localhost:5173"
    return JSONResponse(
        status_code=500,
        content={"detail": f"{str(exc)}\n{tb}"},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*"
        }
    )

@app.on_event("startup")
async def on_startup():
    """Lifecycle hook to bootstrap database tables and missing columns dynamically on server start."""
    try:
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            
            alter_statements = [
                "ALTER TABLE subjects ADD COLUMN subject_type VARCHAR(50) DEFAULT 'THEORY';",
                "ALTER TABLE subjects ADD COLUMN is_parallel_lab BOOLEAN DEFAULT FALSE;",
                "ALTER TABLE subjects ADD COLUMN parallel_subject_id VARCHAR(36);",
                "ALTER TABLE subjects ADD COLUMN academic_year INTEGER DEFAULT 1;",
                "ALTER TABLE faculty_profiles ADD COLUMN is_hod BOOLEAN DEFAULT FALSE;",
                "ALTER TABLE faculty_profiles ADD COLUMN is_dean BOOLEAN DEFAULT FALSE;",
                "ALTER TABLE timetable_entries ADD COLUMN academic_year INTEGER DEFAULT 1;",
                "ALTER TABLE timetable_entries ADD COLUMN lab_batch VARCHAR(50) DEFAULT 'ALL';",
                "ALTER TABLE scheduling_rules ADD COLUMN lunch_slot INTEGER DEFAULT 5;",
                "ALTER TABLE scheduling_rules ADD COLUMN activity_blocks VARCHAR(500) DEFAULT 'Saturday-5,Saturday-6';"
            ]
            for stmt in alter_statements:
                try:
                    await conn.execute(text(stmt))
                except Exception:
                    pass
        print("Database tables and dynamic columns initialized successfully.")
    except Exception as e:
        print(f"Warning: Database initialization exception on startup ({e}). Retrying on demand.")

@app.get("/")
def read_root():
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "docs_url": "/docs"
    }

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
