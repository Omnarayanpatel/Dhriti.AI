from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models.project_task  # noqa: F401
import app.models.audit  # noqa: F401
import app.models.task_import  # noqa: F401
import app.models.project_template  # noqa: F401
from app.database import Base, engine, run_startup_migrations
from app.routes import auth, batches, dashboard, protected, task_ingest, tasks, template_builder, users

app = FastAPI()

# CORS (React frontend ke liye)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # production me specific domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)
run_startup_migrations()


@app.get("/")
def home():
    return {"msg": "Accun AI Backend Running ✅"}


app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(protected.router)
app.include_router(batches.router)
app.include_router(task_ingest.router)
app.include_router(tasks.router)
app.include_router(template_builder.router)
app.include_router(users.router)
