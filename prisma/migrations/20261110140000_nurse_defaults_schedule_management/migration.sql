ALTER TABLE "Nurse"
ADD COLUMN "defaultShiftId" UUID;

UPDATE "Nurse"
SET "defaultShiftId" = (
  SELECT "id"
  FROM "ShiftTemplate"
  WHERE "isDefault" = true AND "isActive" = true
  LIMIT 1
);

ALTER TABLE "Nurse"
ADD CONSTRAINT "Nurse_defaultShiftId_fkey"
FOREIGN KEY ("defaultShiftId") REFERENCES "ShiftTemplate"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Nurse_defaultShiftId_idx" ON "Nurse"("defaultShiftId");

ALTER TABLE "MonthlySchedule"
ADD COLUMN "archivedAt" TIMESTAMPTZ(6),
ADD COLUMN "archivedById" UUID;

ALTER TABLE "MonthlySchedule"
ADD CONSTRAINT "MonthlySchedule_archivedById_fkey"
FOREIGN KEY ("archivedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MonthlySchedule_archivedAt_year_month_idx"
ON "MonthlySchedule"("archivedAt", "year", "month");

CREATE TABLE "ScheduleCleanupAudit" (
  "id" UUID NOT NULL,
  "actorId" UUID,
  "action" VARCHAR(40) NOT NULL,
  "affectedMonth" VARCHAR(80) NOT NULL,
  "startDate" DATE,
  "endDate" DATE,
  "details" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduleCleanupAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduleCleanupAudit_createdAt_idx"
ON "ScheduleCleanupAudit"("createdAt");
CREATE INDEX "ScheduleCleanupAudit_actorId_createdAt_idx"
ON "ScheduleCleanupAudit"("actorId", "createdAt");
CREATE INDEX "ScheduleCleanupAudit_action_createdAt_idx"
ON "ScheduleCleanupAudit"("action", "createdAt");

ALTER TABLE "ScheduleCleanupAudit"
ADD CONSTRAINT "ScheduleCleanupAudit_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
