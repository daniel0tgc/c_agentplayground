import asyncio
import logging
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from .config import settings

logger = logging.getLogger(__name__)

_db_url = settings.DATABASE_URL
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif _db_url.startswith("postgresql://") and "+asyncpg" not in _db_url:
    _db_url = _db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# SSL rules:
# - localhost / 127.0.0.1  → no SSL (local dev)
# - *.railway.internal      → no SSL (Railway private network, SSL not supported)
# - everything else         → require SSL (Railway public proxy, cloud DBs, etc.)
_no_ssl_hosts = ("localhost", "127.0.0.1", ".railway.internal")
_use_ssl = not any(h in _db_url for h in _no_ssl_hosts)

# Log the effective connection config at startup (mask password)
import re as _re
_masked = _re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", _db_url)
logger.warning("DB connect → %s  ssl=%s", _masked, _use_ssl)

engine = create_async_engine(
    _db_url,
    echo=False,
    connect_args={"ssl": "require"} if _use_ssl else {},
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


db_ready: bool = False


async def init_db():
    """Create all tables on startup, retrying up to 6 times with 5-second gaps.

    Does NOT raise on failure — the app will start regardless so that Railway's
    health check can pass. DB-dependent endpoints will return errors until the
    database becomes reachable.
    """
    global db_ready
    from . import models  # noqa: F401 — ensure models are imported before create_all
    last_err: Exception | None = None
    for attempt in range(1, 7):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Database initialised successfully.")
            db_ready = True
            return
        except Exception as exc:
            last_err = exc
            logger.warning("DB not ready (attempt %d/6): %s", attempt, exc)
            if attempt < 6:
                await asyncio.sleep(5)
    logger.critical(
        "Database unreachable after 6 attempts (%s). "
        "App will start but all DB-dependent endpoints will fail until "
        "DATABASE_URL is correct and the Postgres service is reachable.",
        last_err,
    )
