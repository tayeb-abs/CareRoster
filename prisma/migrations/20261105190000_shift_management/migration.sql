-- Administrator-managed shift templates and immutable schedule snapshots.
ALTER TABLE "Schedule"
ADD COLUMN "isShiftManual" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ShiftTemplate" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "color" VARCHAR(7),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShiftTemplate_time_format_check" CHECK (
      "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    ),
    CONSTRAINT "ShiftTemplate_color_check" CHECK ("color" IS NULL OR "color" ~ '^#[0-9a-fA-F]{6}$'),
    CONSTRAINT "ShiftTemplate_default_active_check" CHECK (NOT "isDefault" OR "isActive")
);

CREATE TABLE "ScheduleShift" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "shiftTemplateId" UUID NOT NULL,
    "shiftName" VARCHAR(120) NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "color" VARCHAR(7),
    "totalHours" DECIMAL(5,2) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleShift_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduleShift_time_format_check" CHECK (
      "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    ),
    CONSTRAINT "ScheduleShift_totalHours_check" CHECK ("totalHours" > 0 AND "totalHours" <= 24)
);

CREATE UNIQUE INDEX "ShiftTemplate_name_key" ON "ShiftTemplate"("name");
CREATE UNIQUE INDEX "ShiftTemplate_single_default_key" ON "ShiftTemplate"("isDefault") WHERE "isDefault" = true;
CREATE INDEX "ShiftTemplate_isActive_name_idx" ON "ShiftTemplate"("isActive", "name");
CREATE INDEX "ShiftTemplate_isDefault_isActive_idx" ON "ShiftTemplate"("isDefault", "isActive");
CREATE INDEX "ShiftTemplate_createdById_createdAt_idx" ON "ShiftTemplate"("createdById", "createdAt");
CREATE INDEX "ScheduleShift_scheduleId_idx" ON "ScheduleShift"("scheduleId");
CREATE INDEX "ScheduleShift_shiftTemplateId_idx" ON "ScheduleShift"("shiftTemplateId");
CREATE INDEX "ScheduleShift_createdById_createdAt_idx" ON "ScheduleShift"("createdById", "createdAt");

ALTER TABLE "ShiftTemplate"
ADD CONSTRAINT "ShiftTemplate_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShiftTemplate"
ADD CONSTRAINT "ShiftTemplate_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScheduleShift"
ADD CONSTRAINT "ScheduleShift_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduleShift"
ADD CONSTRAINT "ScheduleShift_shiftTemplateId_fkey"
FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScheduleShift"
ADD CONSTRAINT "ScheduleShift_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
