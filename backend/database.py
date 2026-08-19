import os
from typing import AsyncGenerator, Any
from urllib.parse import urlparse, urlunparse, quote

from dotenv import load_dotenv

import sqlalchemy
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool

load_dotenv()

raw_db_url = os.getenv("DATABASE_URL", "").strip()


def _encode_url_password(url: str) -> str:
    try:
        parsed = urlparse(url)
        if parsed.password and ";" in parsed.password:
            safe_password = quote(parsed.password, safe="")
            userinfo = f"{parsed.username}:{safe_password}"
            netloc = f"{userinfo}@{parsed.hostname}"
            if parsed.port:
                netloc = f"{netloc}:{parsed.port}"
            fixed = urlunparse(parsed._replace(netloc=netloc))
            return fixed
    except Exception:
        pass
    return url


def get_async_db_url(url: str) -> str:
    if not url:
        return "sqlite+aiosqlite:///./rescura_sync.db"
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return _encode_url_password(url)


ASYNC_DATABASE_URL = get_async_db_url(raw_db_url)
SQLITE_DATABASE_URL = "sqlite+aiosqlite:///./rescura_sync.db"

if ASYNC_DATABASE_URL.startswith("sqlite"):
    engine_kwargs: dict[str, Any] = {"poolclass": NullPool}
    _connect_args: dict[str, Any] = {}
else:
    engine_kwargs = {
        "pool_size": 10,
        "max_overflow": 20,
        "pool_timeout": 10.0,
        "pool_pre_ping": True,
    }
    _connect_args = {"command_timeout": 8, "timeout": 8}

engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
    future=True,
    connect_args=_connect_args,
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
        print(f"[Database Warning] Primary database connection failed ({type(err).__name__}). Falling back to local SQLite.")
        fb_kwargs: dict[str, Any] = {"poolclass": NullPool}
        engine = create_async_engine(SQLITE_DATABASE_URL, echo=False, future=True, **fb_kwargs)
        AsyncSessionLocal = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False
        )
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
