import pytest
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select

from app.core.database import Base
from app.core.security import verify_password
from app.models.user import User, PasswordReset, UserRole
from app.schemas.user import UserCreate
from app.api.auth import signup, login
from app.core.config import settings

# Test database engine (SQLite in memory for isolation)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(scope="function")
async def db_session():
    # Setup in-memory SQLite database
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async_session = sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False
    )
    
    async with async_session() as session:
        yield session
        await session.rollback()
        
    await engine.dispose()

@pytest.mark.asyncio
async def test_signup_first_user_is_admin(db_session):
    # Register the first user
    user_in = UserCreate(
        email="admin@university.edu",
        password="securepassword123",
        full_name="System Administrator",
        role="FACULTY" # Requesting faculty, but should bootstrap to ADMIN
    )
    
    user = await signup(user_in, db_session)
    assert user.email == "admin@university.edu"
    assert user.role == UserRole.ADMIN
    assert verify_password("securepassword123", user.password_hash)

@pytest.mark.asyncio
async def test_signup_secondary_user_role(db_session):
    # Register first user (Admin)
    admin_in = UserCreate(
        email="admin@university.edu",
        password="securepassword123",
        full_name="System Administrator",
        role="ADMIN"
    )
    await signup(admin_in, db_session)
    
    # Register second user (Faculty)
    faculty_in = UserCreate(
        email="faculty@university.edu",
        password="securepassword123",
        full_name="Professor John",
        role="FACULTY"
    )
    user = await signup(faculty_in, db_session)
    assert user.email == "faculty@university.edu"
    assert user.role == UserRole.FACULTY

@pytest.mark.asyncio
async def test_login_success(db_session):
    # Bootstrap system by registering an admin first
    admin_in = UserCreate(
        email="admin@university.edu",
        password="adminpassword",
        full_name="System Admin",
        role="ADMIN"
    )
    await signup(admin_in, db_session)

    # Signup Alice as a Faculty
    user_in = UserCreate(
        email="prof@university.edu",
        password="mysecretpassword",
        full_name="Prof. Alice",
        role="FACULTY"
    )
    await signup(user_in, db_session)
    
    # Attempt login
    login_data = UserCreate(
        email="prof@university.edu",
        password="mysecretpassword",
        full_name="", # Ignored
        role=""       # Ignored
    )
    token_response = await login(login_data, db_session)
    
    assert token_response["access_token"] is not None
    assert token_response["token_type"] == "bearer"
    assert token_response["role"] == UserRole.FACULTY
    assert token_response["full_name"] == "Prof. Alice"
