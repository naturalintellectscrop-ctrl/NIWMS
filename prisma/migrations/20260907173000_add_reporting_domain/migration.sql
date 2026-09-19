CREATE TABLE "reporting_departments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reporting_departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reporting_positions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "department_id" UUID,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reporting_positions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reporting_employees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "employee_code" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "department_id" UUID,
  "position_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reporting_employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reporting_daily_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "report_date" TEXT NOT NULL,
  "activity_text" TEXT NOT NULL,
  "location" TEXT,
  "time_in" TEXT,
  "time_out" TEXT,
  "comments" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reporting_daily_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reporting_monthly_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "month" TEXT NOT NULL,
  "report_data" JSONB NOT NULL,
  "total_reports" INTEGER NOT NULL,
  "total_activities" INTEGER NOT NULL,
  "submission_rate" DOUBLE PRECISION NOT NULL,
  "category_breakdown" JSONB NOT NULL,
  "summary" TEXT NOT NULL,
  "achievements" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "generated_by_user_id" TEXT,
  "approved_by_user_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "original_created_at" TIMESTAMP(3),
  "last_regenerated_at" TIMESTAMP(3),
  "regenerated_by_user_id" TEXT,
  "regeneration_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reporting_monthly_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reporting_report_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "report_id" UUID NOT NULL,
  "author_user_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reporting_report_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reporting_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "employee_id" UUID,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'info',
  "read" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reporting_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reporting_departments_organization_id_code_key" ON "reporting_departments"("organization_id", "code");
CREATE INDEX "reporting_departments_organization_id_name_idx" ON "reporting_departments"("organization_id", "name");
CREATE UNIQUE INDEX "reporting_positions_organization_id_code_key" ON "reporting_positions"("organization_id", "code");
CREATE INDEX "reporting_positions_organization_id_name_idx" ON "reporting_positions"("organization_id", "name");
CREATE UNIQUE INDEX "reporting_employees_membership_id_key" ON "reporting_employees"("membership_id");
CREATE UNIQUE INDEX "reporting_employees_organization_id_employee_code_key" ON "reporting_employees"("organization_id", "employee_code");
CREATE INDEX "reporting_employees_organization_id_status_idx" ON "reporting_employees"("organization_id", "status");
CREATE UNIQUE INDEX "reporting_daily_reports_employee_id_report_date_key" ON "reporting_daily_reports"("employee_id", "report_date");
CREATE INDEX "reporting_daily_reports_organization_id_report_date_idx" ON "reporting_daily_reports"("organization_id", "report_date");
CREATE UNIQUE INDEX "reporting_monthly_reports_employee_id_month_key" ON "reporting_monthly_reports"("employee_id", "month");
CREATE INDEX "reporting_monthly_reports_organization_id_month_idx" ON "reporting_monthly_reports"("organization_id", "month");
CREATE INDEX "reporting_monthly_reports_organization_id_status_idx" ON "reporting_monthly_reports"("organization_id", "status");
CREATE INDEX "reporting_report_comments_report_id_created_at_idx" ON "reporting_report_comments"("report_id", "created_at");
CREATE INDEX "reporting_notifications_organization_id_created_at_idx" ON "reporting_notifications"("organization_id", "created_at");
CREATE INDEX "reporting_notifications_employee_id_read_idx" ON "reporting_notifications"("employee_id", "read");

ALTER TABLE "reporting_departments" ADD CONSTRAINT "reporting_departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reporting_positions" ADD CONSTRAINT "reporting_positions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reporting_positions" ADD CONSTRAINT "reporting_positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "reporting_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reporting_employees" ADD CONSTRAINT "reporting_employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reporting_employees" ADD CONSTRAINT "reporting_employees_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reporting_employees" ADD CONSTRAINT "reporting_employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "reporting_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reporting_employees" ADD CONSTRAINT "reporting_employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "reporting_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reporting_daily_reports" ADD CONSTRAINT "reporting_daily_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reporting_daily_reports" ADD CONSTRAINT "reporting_daily_reports_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "reporting_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reporting_monthly_reports" ADD CONSTRAINT "reporting_monthly_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reporting_monthly_reports" ADD CONSTRAINT "reporting_monthly_reports_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "reporting_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reporting_report_comments" ADD CONSTRAINT "reporting_report_comments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reporting_monthly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reporting_notifications" ADD CONSTRAINT "reporting_notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reporting_notifications" ADD CONSTRAINT "reporting_notifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "reporting_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
