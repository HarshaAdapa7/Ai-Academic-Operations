import asyncio
from app.core.database import async_session_maker
from app.models.user import User
from sqlalchemy.future import select

async def main():
    async with async_session_maker() as db:
        users = (await db.execute(select(User))).scalars().all()
        for u in users:
            print(f"Email: {u.email} | Role: {u.role}")

if __name__ == "__main__":
    asyncio.run(main())
