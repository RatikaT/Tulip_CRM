"""
CRM - FastAPI Application Entry Point
"""
import logging
import traceback
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import connect_to_database, close_database_connection
from app.services.auth_service import create_default_admin, create_default_super_admin
from app.routers import auth, leads, users, dashboard, knowledge_base, custom_fields, enrollments

# Configure logging (console only for cloud compatibility)
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper()),
    format='%(asctime)s | %(levelname)s | %(name)s | %(message)s',
    handlers=[logging.StreamHandler()]
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    # Startup
    logger.info("Starting CRM API...")
    await connect_to_database()
    await create_default_admin()
    await create_default_super_admin()
    logger.info("CRM API started successfully")

    yield

    # Shutdown
    logger.info("Shutting down Tulip CRM API...")
    await close_database_connection()
    logger.info("Tulip CRM API shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="Tulip CRM API",
    description="Lead Management System for Tulip Healthcare",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan
)

# CORS Configuration
allowed_origins = [
    settings.FRONTEND_URL,
    "http://localhost:5173",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://localhost:3000",
]
# Filter out empty strings
allowed_origins = [origin for origin in allowed_origins if origin]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Logging Middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests and their responses for debugging"""
    # Skip logging for health checks and docs to reduce noise
    skip_paths = ["/health", "/api/docs", "/api/redoc", "/openapi.json"]
    if any(request.url.path.startswith(path) for path in skip_paths):
        return await call_next(request)

    # Generate request ID for tracing
    request_id = f"{time.time():.0f}"

    # Log incoming request
    logger.info(f"[{request_id}] REQUEST: {request.method} {request.url.path}")
    if request.query_params:
        logger.debug(f"[{request_id}] Query params: {dict(request.query_params)}")

    # Process request and measure time
    start_time = time.time()
    try:
        response = await call_next(request)
        duration = time.time() - start_time

        # Log response
        status_emoji = "✓" if response.status_code < 400 else "✗"
        logger.info(f"[{request_id}] RESPONSE: {status_emoji} {request.method} {request.url.path} - {response.status_code} ({duration:.3f}s)")

        return response
    except Exception as e:
        duration = time.time() - start_time
        logger.error(f"[{request_id}] EXCEPTION: {request.method} {request.url.path} - {str(e)} ({duration:.3f}s)")
        raise


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions and log them"""
    logger.error(f"Unhandled exception: {exc}")
    logger.error(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )


# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(leads.router, prefix="/api/leads", tags=["Leads"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(knowledge_base.router, prefix="/api/knowledge-base", tags=["Knowledge Base"])
app.include_router(custom_fields.router, prefix="/api/custom-fields", tags=["Custom Fields"])
app.include_router(enrollments.router, prefix="/api/enrollments", tags=["Enrollments"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Tulip CRM API",
        "version": "1.0.0",
        "docs": "/api/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "environment": settings.ENVIRONMENT}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == "development"
    )
