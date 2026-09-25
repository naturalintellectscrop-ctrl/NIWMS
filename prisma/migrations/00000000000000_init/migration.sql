-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'employee',
    "status" TEXT NOT NULL DEFAULT 'active',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordChangedAt" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "reportData" TEXT NOT NULL,
    "totalReports" INTEGER NOT NULL,
    "totalActivities" INTEGER NOT NULL,
    "submissionRate" DOUBLE PRECISION NOT NULL,
    "categoryBreakdown" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "achievements" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "generatedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "originalCreatedAt" TIMESTAMP(3),
    "lastRegeneratedAt" TIMESTAMP(3),
    "regeneratedBy" TEXT,
    "regenerationCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "activityText" TEXT NOT NULL,
    "location" TEXT,
    "timeIn" TEXT,
    "timeOut" TEXT,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "html" TEXT,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "provider" TEXT NOT NULL DEFAULT 'outbox',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "organizationType" TEXT NOT NULL DEFAULT 'STANDARD',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Kampala',
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "graceStartedAt" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "retentionEndsAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deletionScheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportDeadline" TEXT NOT NULL DEFAULT '16:00',
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPrice" INTEGER NOT NULL DEFAULT 0,
    "maxEmployees" INTEGER,
    "entitlements" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "provider" TEXT,
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "organization_type" TEXT NOT NULL DEFAULT 'SAAS',
    "status" TEXT NOT NULL DEFAULT 'trial',
    "billing_mode" TEXT NOT NULL DEFAULT 'standard',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Kampala',
    "report_deadline" TEXT NOT NULL DEFAULT '16:00',
    "reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "trial_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trial_ends_at" TIMESTAMP(3) NOT NULL DEFAULT now() + interval '14 days',
    "grace_ends_at" TIMESTAMP(3),
    "banned_at" TIMESTAMP(3),
    "banned_reason" TEXT,
    "deletion_requested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_price_cents" INTEGER NOT NULL DEFAULT 0,
    "annual_price_cents" INTEGER NOT NULL DEFAULT 0,
    "max_members" INTEGER,
    "max_reports_per_month" INTEGER,
    "features" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "billing_interval" TEXT NOT NULL DEFAULT 'monthly',
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "provider_customer_id" TEXT,
    "provider_subscription_id" TEXT,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "organization_id" UUID,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'nylonpay',
    "reference" TEXT NOT NULL,
    "provider_transaction_id" TEXT,
    "provider_invoice_id" TEXT,
    "invoice_number" TEXT,
    "checkout_url" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'initial',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "billing_interval" TEXT NOT NULL,
    "amount_ugx" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "description" TEXT NOT NULL DEFAULT '',
    "customer_name" TEXT,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "mode" TEXT,
    "failure_reason" TEXT,
    "failure_code" TEXT,
    "initiated_by_user_id" TEXT,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" INET,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" TEXT,
    "event_type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting_departments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reporting_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting_positions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reporting_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting_employees" (
    "id" UUID NOT NULL,
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

-- CreateTable
CREATE TABLE "reporting_daily_reports" (
    "id" UUID NOT NULL,
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

-- CreateTable
CREATE TABLE "reporting_monthly_reports" (
    "id" UUID NOT NULL,
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

-- CreateTable
CREATE TABLE "reporting_report_comments" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reporting_report_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting_notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reporting_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_requests" (
    "id" TEXT NOT NULL,
    "organization_name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "notes" TEXT,
    "provisioned_org_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "MonthlyReport_userId_idx" ON "MonthlyReport"("userId");

-- CreateIndex
CREATE INDEX "MonthlyReport_month_idx" ON "MonthlyReport"("month");

-- CreateIndex
CREATE INDEX "MonthlyReport_status_idx" ON "MonthlyReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReport_userId_month_key" ON "MonthlyReport"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_userId_key" ON "EmployeeProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_employeeId_key" ON "EmployeeProfile"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_userId_date_key" ON "DailyReport"("userId", "date");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_createdAt_idx" ON "EmailMessage"("createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_category_idx" ON "EmailMessage"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSettings_organizationId_key" ON "OrganizationSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_key_key" ON "Plan"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_providerSubscriptionId_idx" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_action_idx" ON "AuditEvent"("organizationId", "action");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_memberships_user_id_status_idx" ON "organization_memberships"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_key" ON "organization_memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organization_id_key" ON "subscriptions"("organization_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE INDEX "billing_events_organization_id_created_at_idx" ON "billing_events"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_provider_provider_event_id_key" ON "billing_events"("provider", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_organization_id_created_at_idx" ON "payments"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_status_updated_at_idx" ON "payments"("status", "updated_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "usage_events_organization_id_occurred_at_idx" ON "usage_events"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "deletion_requests_status_scheduled_for_idx" ON "deletion_requests"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "reporting_departments_organization_id_name_idx" ON "reporting_departments"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "reporting_departments_organization_id_code_key" ON "reporting_departments"("organization_id", "code");

-- CreateIndex
CREATE INDEX "reporting_positions_organization_id_name_idx" ON "reporting_positions"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "reporting_positions_organization_id_code_key" ON "reporting_positions"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "reporting_employees_membership_id_key" ON "reporting_employees"("membership_id");

-- CreateIndex
CREATE INDEX "reporting_employees_organization_id_status_idx" ON "reporting_employees"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reporting_employees_organization_id_employee_code_key" ON "reporting_employees"("organization_id", "employee_code");

-- CreateIndex
CREATE INDEX "reporting_daily_reports_organization_id_report_date_idx" ON "reporting_daily_reports"("organization_id", "report_date");

-- CreateIndex
CREATE UNIQUE INDEX "reporting_daily_reports_employee_id_report_date_key" ON "reporting_daily_reports"("employee_id", "report_date");

-- CreateIndex
CREATE INDEX "reporting_monthly_reports_organization_id_month_idx" ON "reporting_monthly_reports"("organization_id", "month");

-- CreateIndex
CREATE INDEX "reporting_monthly_reports_organization_id_status_idx" ON "reporting_monthly_reports"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reporting_monthly_reports_employee_id_month_key" ON "reporting_monthly_reports"("employee_id", "month");

-- CreateIndex
CREATE INDEX "reporting_report_comments_report_id_created_at_idx" ON "reporting_report_comments"("report_id", "created_at");

-- CreateIndex
CREATE INDEX "reporting_notifications_organization_id_created_at_idx" ON "reporting_notifications"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "reporting_notifications_employee_id_read_idx" ON "reporting_notifications"("employee_id", "read");

-- CreateIndex
CREATE INDEX "trial_requests_status_created_at_idx" ON "trial_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "trial_requests_contact_email_idx" ON "trial_requests"("contact_email");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyReport" ADD CONSTRAINT "MonthlyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetRequest" ADD CONSTRAINT "PasswordResetRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_departments" ADD CONSTRAINT "reporting_departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_positions" ADD CONSTRAINT "reporting_positions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_positions" ADD CONSTRAINT "reporting_positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "reporting_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_employees" ADD CONSTRAINT "reporting_employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_employees" ADD CONSTRAINT "reporting_employees_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_employees" ADD CONSTRAINT "reporting_employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "reporting_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_employees" ADD CONSTRAINT "reporting_employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "reporting_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_daily_reports" ADD CONSTRAINT "reporting_daily_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_daily_reports" ADD CONSTRAINT "reporting_daily_reports_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "reporting_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_monthly_reports" ADD CONSTRAINT "reporting_monthly_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_monthly_reports" ADD CONSTRAINT "reporting_monthly_reports_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "reporting_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_report_comments" ADD CONSTRAINT "reporting_report_comments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reporting_monthly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_notifications" ADD CONSTRAINT "reporting_notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_notifications" ADD CONSTRAINT "reporting_notifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "reporting_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

