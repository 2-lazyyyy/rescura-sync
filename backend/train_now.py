import asyncio
from database import engine, get_db
from sqlalchemy.ext.asyncio import AsyncSession
from ml_model import train_rescue_model

async def main():
    async with AsyncSession(engine) as db:
        print("Training ML Model...")
        result = await train_rescue_model(db)
        print("Training Completed:")
        print(result)

if __name__ == "__main__":
    asyncio.run(main())
