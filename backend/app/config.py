"""
Application configuration using Pydantic Settings
"""
import os
from functools import lru_cache
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # MongoDB
    MONGODB_URI: str = "mongodb://localhost:27017/tulip_crm"

    # JWT
    JWT_SECRET_KEY: str = "your-super-secret-key-min-32-characters-long-change-this"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24

    # Gemini AI
    GEMINI_API_KEY: Optional[str] = None

    # Application
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_URL: str = "http://localhost:8000"
    LOG_LEVEL: str = "DEBUG"

    # Default Admin (Tulip specific) - REQUIRED in .env
    DEFAULT_ADMIN_EMAIL: str = "admin@tulip.com"
    DEFAULT_ADMIN_PASSWORD: str  # No default - must be set in .env
    DEFAULT_ADMIN_NAME: str = "Admin User"

    # Super Admin (CRM-wide access) - REQUIRED in .env
    DEFAULT_SUPER_ADMIN_EMAIL: str = "superadmin@crm.com"
    DEFAULT_SUPER_ADMIN_PASSWORD: str  # No default - must be set in .env
    DEFAULT_SUPER_ADMIN_NAME: str = "Super Admin"

    # Pagination
    DEFAULT_PAGE_SIZE: int = 50
    MAX_PAGE_SIZE: int = 100

    # LeadID
    LEAD_ID_PREFIX: str = "Tulip"

    # Knowledge Base
    KB_UPLOADS_DIR: str = "uploads/knowledge-base"
    KB_MAX_FILE_SIZE_MB: int = 50
    KB_CHUNK_SIZE: int = 500
    KB_CHUNK_OVERLAP: int = 50
    KB_TOP_K_RESULTS: int = 5

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


settings = get_settings()
