import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import init_db, get_db_connection
from .routers import skills, search, collections, goals, comparator
from .scraper.seed_data import seed_data

app = FastAPI(
    title="Skills Discovery API",
    description="Discover, search, and manage AI skills, MCP servers, and developer tools",
    version="1.0.0",
)

# CORS — allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(skills.router, prefix="/api/skills", tags=["skills"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(collections.router, prefix="/api/collections", tags=["collections"])
app.include_router(goals.router, prefix="/api/goals", tags=["goals"])
app.include_router(comparator.router, prefix="/api/comparator", tags=["comparator"])


@app.on_event("startup")
async def startup_event():
    """Initialize DB and seed data on startup."""
    await init_db()
    db = await get_db_connection()
    try:
        await seed_data(db)
    finally:
        await db.close()


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


# Serve frontend static files if built
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
