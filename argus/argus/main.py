"""Uvicorn entrypoint for the FastAPI app."""
from __future__ import annotations

import uvicorn
from .api import build_app
from .settings import settings


from fastapi.middleware.cors import CORSMiddleware

app = build_app()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8088"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def serve() -> None:
    uvicorn.run(
        "argus.main:app",
        host=settings.argus_host,
        port=settings.argus_port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    serve()
