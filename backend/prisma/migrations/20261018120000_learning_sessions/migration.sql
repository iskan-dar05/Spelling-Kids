CREATE TYPE "LearningSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

CREATE TABLE "learning_sessions" (
    "id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "status" "LearningSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "retry_missed_only" BOOLEAN NOT NULL DEFAULT false,
    "current_exercise_id" TEXT,
    "served_exercise_ids" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "exercise_attempts" ADD COLUMN "session_id" TEXT;
ALTER TABLE "exercise_attempts" ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "rewards" ADD COLUMN "source_attempt_id" TEXT;

CREATE INDEX "learning_sessions_child_id_category_id_status_idx"
    ON "learning_sessions"("child_id", "category_id", "status");
CREATE INDEX "exercise_attempts_session_id_created_at_idx"
    ON "exercise_attempts"("session_id", "created_at");
CREATE UNIQUE INDEX "exercise_attempts_child_id_idempotency_key_key"
    ON "exercise_attempts"("child_id", "idempotency_key");
CREATE UNIQUE INDEX "rewards_source_attempt_id_key"
    ON "rewards"("source_attempt_id");

ALTER TABLE "learning_sessions"
    ADD CONSTRAINT "learning_sessions_child_id_fkey"
    FOREIGN KEY ("child_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_sessions"
    ADD CONSTRAINT "learning_sessions_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_sessions"
    ADD CONSTRAINT "learning_sessions_current_exercise_id_fkey"
    FOREIGN KEY ("current_exercise_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exercise_attempts"
    ADD CONSTRAINT "exercise_attempts_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "learning_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rewards"
    ADD CONSTRAINT "rewards_source_attempt_id_fkey"
    FOREIGN KEY ("source_attempt_id") REFERENCES "exercise_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;