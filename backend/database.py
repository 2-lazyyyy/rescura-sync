import os
from typing import AsyncGenerator
from dotenv import load_dotenv

import sqlalchemy
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

raw_db_url = os.getenv("DATABASE_URL", "").strip()

if not raw_db_url:
    # Default fallback to SQLite if DATABASE_URL is left blank in .env
    ASYNC_DATABASE_URL = "sqlite+aiosqlite:///./rescura_sync.db"
    SYNC_DATABASE_URL = "sqlite:///./rescura_sync.db"
else:
    ASYNC_DATABASE_URL = raw_db_url
    SYNC_DATABASE_URL = raw_db_url

if ASYNC_DATABASE_URL.startswith("postgresql://"):
    ASYNC_DATABASE_URL = ASYNC_DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif ASYNC_DATABASE_URL.startswith("postgres://"):
    ASYNC_DATABASE_URL = ASYNC_DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)

# Async Engine for FastAPI async session dependencies
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
    future=True
)

# Async SessionLocal
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Standard SessionLocal alias for backwards compatibility
SessionLocal = AsyncSessionLocal

Base = declarative_base()


async def init_db_schema():
    """
    Creates database tables and safely executes column migrations for new schema additions.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Safely add latitude and longitude to historical_rescue_ops if missing
        try:
            await conn.execute(sqlalchemy.text("ALTER TABLE historical_rescue_ops ADD COLUMN latitude FLOAT"))
        except Exception:
            pass
        try:
            await conn.execute(sqlalchemy.text("ALTER TABLE historical_rescue_ops ADD COLUMN longitude FLOAT"))
        except Exception:
            pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

