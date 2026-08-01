import asyncio
from sqlalchemy import text
from app.core.database import engine, async_session_maker
from app.services.notification_service import create_notification

async def create_table_and_notif():
    create_sql = """
    CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        target_role VARCHAR(20),
        department_id VARCHAR(36),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        category VARCHAR(50) NOT NULL,
        priority VARCHAR(20) NOT NULL,
        action_url VARCHAR(255),
        action_payload JSON,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        read_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """
    async with engine.begin() as conn:
        await conn.execute(text(create_sql))
    print("Table 'notifications' verified/created.")

    async with async_session_maker() as db:
        notif = await create_notification(
            db=db,
            title="System Bootstrapped - Universal Notification Center Active",
            message="Universal real-time notification drawer and automated daily faculty schedule email dispatcher are now live for local intranet.",
            category="SYSTEM",
            priority="HIGH",
            target_role="ALL"
        )
        print(f"Test Notification Created: {notif.id} | {notif.title}")

if __name__ == "__main__":
    asyncio.run(create_table_and_notif())
