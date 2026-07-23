import asyncio
import os
import sys

# Add backend directory to sys.path so we can import app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.config import settings
from app.api.auth import send_otp_email

async def main():
    print("Testing SMTP Configuration...")
    print(f"Host: {settings.SMTP_HOST}")
    print(f"Port: {settings.SMTP_PORT}")
    print(f"User: {settings.SMTP_USER}")
    print(f"From: {settings.SMTP_FROM_EMAIL}")
    
    # We will temporarily enable logger printing to console
    import logging
    logging.basicConfig(level=logging.INFO)
    
    try:
        await send_otp_email("harshaadapa23@gmail.com", "999999")
        print("SMTP Test execution completed.")
    except Exception as e:
        print(f"Fatal error during test: {e}")

if __name__ == "__main__":
    asyncio.run(main())
