import asyncio
import os
import sys
import datetime

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.core.database import async_session_maker
from app.models.user import PasswordReset
from sqlalchemy import select

async def main():
    async with async_session_maker() as session:
        result = await session.execute(select(PasswordReset).order_by(PasswordReset.created_at.desc()))
        resets = result.scalars().all()
        print("\n================ PASSWORD RESETS ================")
        for r in resets:
            print(f"Email: {r.email} | OTP: {r.otp_code} | Verified: {r.is_verified} | Created: {r.created_at} | Expires: {r.expires_at}")
        
        print(f"Current Server UTC: {datetime.datetime.utcnow()}")
        print("================================================\n")

if __name__ == "__main__":
    asyncio.run(main())
