import logging
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import ExpiredSignatureError, JWTError, jwt
from jose.exceptions import JWTClaimsError

from app.core.config import settings

logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRATION_MINUTES)
    payload = {"sub": subject, "exp": expire}
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    logger.info("Token created for subject=%s, expires=%s", subject, expire.isoformat())
    return token


def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            logger.warning("Token decoded but 'sub' claim is missing. Payload keys: %s", list(payload.keys()))
        return sub
    except ExpiredSignatureError:
        logger.warning("Token rejected: expired. Token (first 20 chars): %s...", token[:20])
        return None
    except JWTClaimsError as e:
        logger.warning("Token rejected: claims error — %s", e)
        return None
    except JWTError as e:
        logger.warning("Token rejected: %s — %s", type(e).__name__, e)
        return None
