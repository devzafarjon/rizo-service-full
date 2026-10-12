-- Automatic jobs (deadline watch, owner reports, payroll statements): run log and calculated pay statements.
CREATE TABLE "auto_job_runs" (
    "id" TEXT NOT NULL,
    "job_key" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'auto',
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "summary" JSONB,
    "error" TEXT,
    "ran_by_name" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    CONSTRAINT "auto_job_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "auto_job_runs_job_key_started_at_idx" ON "auto_job_runs"("job_key", "started_at");

CREATE TABLE "payroll_statements" (
    "id" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'auto',
    "jobs" INTEGER NOT NULL,
    "jobs_total" DECIMAL(14,2) NOT NULL,
    "adjustments_total" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_statements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payroll_statements_staff_user_id_period_from_period_to_key" ON "payroll_statements"("staff_user_id", "period_from", "period_to");
CREATE INDEX "payroll_statements_period_to_idx" ON "payroll_statements"("period_to");
ALTER TABLE "payroll_statements" ADD CONSTRAINT "payroll_statements_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
