from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# PostgreSQL connection string (service name = db from docker-compose)
SQLALCHEMY_DATABASE_URL = "postgresql://Dhriti_ai:Dhriti_ai123@db:5432/Dhriti_ai_db"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Yeh Base ko export karega jise models aur main.py use karenge
Base = declarative_base()


# Dependency: get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_startup_migrations() -> None:
    """Apply lightweight schema adjustments so boot succeeds without manual SQL."""

    statements = [
        "CREATE EXTENSION IF NOT EXISTS pgcrypto",
        """
        CREATE TABLE IF NOT EXISTS import_batch (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          original_file TEXT,
          status        TEXT NOT NULL CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')) DEFAULT 'PENDING',
          row_count     INT NOT NULL DEFAULT 0,
          error_message TEXT,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          excel_schema  JSONB
        )
        """,
        "ALTER TABLE import_batch ADD COLUMN IF NOT EXISTS excel_schema JSONB",
        """
        CREATE TABLE IF NOT EXISTS task (
          id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          batch_id         UUID REFERENCES import_batch(id) ON DELETE SET NULL,
          external_task_id TEXT,
          task_name        TEXT NOT NULL,
          file_name        TEXT,
          s3_url           TEXT,
          status           TEXT NOT NULL CHECK (status IN ('NEW','ASSIGNED','IN_PROGRESS','SUBMITTED','REVIEWED','REJECTED','DONE')) DEFAULT 'NEW',
          priority         INT NOT NULL DEFAULT 5,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          payload          JSONB
        )
        """,
        "ALTER TABLE task ADD COLUMN IF NOT EXISTS payload JSONB",
        "CREATE INDEX IF NOT EXISTS idx_task_batch ON task (batch_id)",
        "CREATE INDEX IF NOT EXISTS idx_task_status ON task (status)",
        """
        CREATE TABLE IF NOT EXISTS task_question (
          id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id        UUID NOT NULL REFERENCES task(id) ON DELETE CASCADE,
          question_text  TEXT NOT NULL,
          question_order INT NOT NULL DEFAULT 0
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_question_task ON task_question (task_id, question_order)",
        """
        CREATE TABLE IF NOT EXISTS task_option (
          id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          question_id  UUID NOT NULL REFERENCES task_question(id) ON DELETE CASCADE,
          option_text  TEXT NOT NULL,
          option_order INT NOT NULL DEFAULT 0
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_option_question ON task_option (question_id, option_order)",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS data_category VARCHAR(255)",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type VARCHAR(255)",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS task_type VARCHAR(255)",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_time_minutes INTEGER",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS max_users_per_task INTEGER",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS association VARCHAR(255)",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS auto_submit_task BOOLEAN DEFAULT FALSE",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS allow_reviewer_edit BOOLEAN DEFAULT TRUE",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS allow_reviewer_push_back BOOLEAN DEFAULT TRUE",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS allow_reviewer_feedback BOOLEAN DEFAULT TRUE",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS reviewer_screen_mode VARCHAR(50) DEFAULT 'full'",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS reviewer_guidelines TEXT",
        """
        CREATE TABLE IF NOT EXISTS task_template (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          batch_id   UUID REFERENCES import_batch(id) ON DELETE SET NULL,
          name       TEXT NOT NULL,
          layout     JSONB NOT NULL,
          rules      JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_task_template_batch ON task_template (batch_id)",
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
