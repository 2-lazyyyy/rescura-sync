import os
from typing import AsyncGenerator
from dotenv import load_dotenv

import sqlalchemy
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

load_dotenv()

raw_db_url = os.getenv("DATABASE_URL", "").strip()

def get_async_db_url(url: str) -> str:
    if not url:
        return "sqlite+aiosqlite:///./rescura_sync.db"
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url

from sqlalchemy.pool import NullPool

ASYNC_DATABASE_URL = get_async_db_url(raw_db_url)
SQLITE_DATABASE_URL = "sqlite+aiosqlite:///./rescura_sync.db"

from typing import Any

if ASYNC_DATABASE_URL.startswith("sqlite"):
    engine_kwargs: dict[str, Any] = {"poolclass": NullPool}
else:
    engine_kwargs = {"pool_size": 25, "max_overflow": 50, "pool_timeout": 30.0}

engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
    future=True,
    **engine_kwargs
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

SessionLocal = AsyncSessionLocal

Base = declarative_base()


async def init_db_schema():
    """
    Creates database tables and safely executes column migrations.
    Falls back to local SQLite database if remote PostgreSQL fails or connection is rejected.
    """
    global engine, AsyncSessionLocal, SessionLocal
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            try:
                await conn.execute(sqlalchemy.text("ALTER TABLE historical_rescue_ops ADD COLUMN latitude FLOAT"))
            except Exception:
                pass
            try:
                await conn.execute(sqlalchemy.text("ALTER TABLE historical_rescue_ops ADD COLUMN longitude FLOAT"))
            except Exception:
                pass
    except Exception as err:
        print(f"[Database Warning] Primary database connection failed ({err}). Falling back to local SQLite.")
        if SQLITE_DATABASE_URL.startswith("sqlite"):
            fb_kwargs = {"poolclass": NullPool}
        else:
            fb_kwargs = {"pool_size": 25, "max_overflow": 50, "pool_timeout": 30.0}
        engine = create_async_engine(SQLITE_DATABASE_URL, echo=False, future=True, **fb_kwargs)
        AsyncSessionLocal.configure(bind=engine)
        SessionLocal = AsyncSessionLocal
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
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


