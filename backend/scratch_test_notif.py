import asyncio
from app.core.database import async_session_maker, engine, Base
from app.models.notification import Notification
from app.services.notification_service import create_notification

async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async with async_session_maker() as db:
        notif = await create_notification(
            db=db,
            title="System Bootstrapped - Universal Notification Center Active",
            message="Universal real-time notification drawer and automated daily faculty schedule email dispatcher are now live for local intranet.",
            category="SYSTEM",
            priority="HIGH",
            target_role="ALL"
        )
        print(f"Created Notification ID: {notif.id} | Title: {notif.title}")

if __name__ == "__main__":
    asyncio.run(main())
