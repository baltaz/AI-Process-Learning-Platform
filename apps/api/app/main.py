from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth, trainings, uploads, search, assignments, tasks, incidents, dashboard

app = FastAPI(title="AI Mini-Training API", version="0.1.0", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def strip_trailing_slash(request: Request, call_next):
    path = request.scope["path"]
    if path != "/" and path.endswith("/"):
        request.scope["path"] = path.rstrip("/")
    return await call_next(request)

app.include_router(auth.router)
app.include_router(search.router)
app.include_router(trainings.router)
app.include_router(uploads.router)
app.include_router(assignments.router)
app.include_router(tasks.router)
app.include_router(incidents.router)
app.include_router(dashboard.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
