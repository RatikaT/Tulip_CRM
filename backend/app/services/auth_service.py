"""
Authentication Service - JWT and Password Handling
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
import bcrypt
from app.config import settings
from app.models.user import User
import logging

logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    # Encode password to bytes, truncate to 72 bytes (bcrypt limit)
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    try:
        password_bytes = plain_password.encode('utf-8')[:72]
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token

    Args:
        data: Payload data (usually contains user info)
        expires_delta: Token expiration time

    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=settings.JWT_EXPIRATION_HOURS)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )

    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decode and verify a JWT access token

    Args:
        token: JWT token string

    Returns:
        Decoded payload dict or None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except JWTError as e:
        logger.error(f"JWT decode error: {e}")
        return None


async def authenticate_user(email: str, password: str) -> Optional[User]:
    """
    Authenticate a user by email and password

    Args:
        email: User email
        password: Plain text password

    Returns:
        User object if authenticated, None otherwise
    """
    user = await User.find_one(User.email == email)

    if not user:
        logger.warning(f"Authentication failed: User not found - {email}")
        return None

    if not user.is_active:
        logger.warning(f"Authentication failed: User inactive - {email}")
        return None

    if not verify_password(password, user.password_hash):
        logger.warning(f"Authentication failed: Invalid password - {email}")
        return None

    # Update last login
    user.last_login = datetime.utcnow()
    user.login_count += 1
    await user.save()

    logger.info(f"User authenticated successfully: {email}")
    return user


async def create_default_admin():
    """Create default admin user if it doesn't exist"""
    existing_admin = await User.find_one(User.email == settings.DEFAULT_ADMIN_EMAIL)

    if not existing_admin:
        admin = User(
            username="admin",
            email=settings.DEFAULT_ADMIN_EMAIL,
            full_name=settings.DEFAULT_ADMIN_NAME,
            password_hash=hash_password(settings.DEFAULT_ADMIN_PASSWORD),
            role="admin",
            is_active=True,
            crm_types=["tulip"],
            created_by="system"
        )
        await admin.insert()
        logger.info(f"Default admin user created: {settings.DEFAULT_ADMIN_EMAIL}")
    else:
        logger.info("Default admin user already exists")


async def create_default_super_admin():
    """Create default super admin user if it doesn't exist"""
    existing_super_admin = await User.find_one(User.email == settings.DEFAULT_SUPER_ADMIN_EMAIL)

    if not existing_super_admin:
        super_admin = User(
            username="superadmin",
            email=settings.DEFAULT_SUPER_ADMIN_EMAIL,
            full_name=settings.DEFAULT_SUPER_ADMIN_NAME,
            password_hash=hash_password(settings.DEFAULT_SUPER_ADMIN_PASSWORD),
            role="super_admin",
            is_active=True,
            crm_types=["tulip", "health_compass"],
            created_by="system"
        )
        await super_admin.insert()
        logger.info(f"Default super admin user created: {settings.DEFAULT_SUPER_ADMIN_EMAIL}")
    else:
        logger.info("Default super admin user already exists")
