-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'HEAD_NURSE');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('WORK', 'OFF', 'SICK', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "OverrideReason" AS ENUM ('SATURDAY_OFF', 'CONSECUTIVE_OFF', 'FRIDAY_COVERAGE', 'CONSECUTIVE_FRIDAY', 'FORCED_WORK', 'SICK_LEAVE', 'EMERGENCY_LEAVE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('SICK', 'EMERGENCY', 'OTHER');

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "name" "RoleName" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "roleId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nurse" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255),
    "title" VARCHAR(80) NOT NULL DEFAULT 'Registered Nurse',
    "color" VARCHAR(7) NOT NULL DEFAULT '#2c9c84',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMPTZ(6),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Nurse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlySchedule" (
    "id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MonthlySchedule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MonthlySchedule"
    ADD CONSTRAINT "MonthlySchedule_month_check" CHECK ("month" BETWEEN 1 AND 12),
    ADD CONSTRAINT "MonthlySchedule_year_check" CHECK ("year" BETWEEN 2000 AND 2200);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" UUID NOT NULL,
    "monthlyScheduleId" UUID NOT NULL,
    "nurseId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" "OverrideReason",
    "note" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleException" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "monthlyScheduleId" UUID NOT NULL,
    "nurseId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "note" VARCHAR(500),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualOverride" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "monthlyScheduleId" UUID NOT NULL,
    "nurseId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "previousShiftType" "ShiftType",
    "shiftType" "ShiftType" NOT NULL,
    "reason" "OverrideReason" NOT NULL,
    "note" VARCHAR(500),
    "createdById" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ManualOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAuditLog" (
    "id" UUID NOT NULL,
    "monthlyScheduleId" UUID,
    "scheduleId" UUID,
    "nurseId" UUID,
    "date" DATE,
    "actorId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FridayAssignmentHistory" (
    "id" UUID NOT NULL,
    "monthlyScheduleId" UUID,
    "nurseId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "assigned" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FridayAssignmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_roleId_isActive_idx" ON "User"("roleId", "isActive");

-- CreateIndex
CREATE INDEX "User_isActive_name_idx" ON "User"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Nurse_email_key" ON "Nurse"("email");

-- CreateIndex
CREATE INDEX "Nurse_isActive_name_idx" ON "Nurse"("isActive", "name");

-- CreateIndex
CREATE INDEX "Nurse_createdById_idx" ON "Nurse"("createdById");

-- CreateIndex
CREATE INDEX "MonthlySchedule_year_month_idx" ON "MonthlySchedule"("year", "month");

-- CreateIndex
CREATE INDEX "MonthlySchedule_createdById_generatedAt_idx" ON "MonthlySchedule"("createdById", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySchedule_year_month_key" ON "MonthlySchedule"("year", "month");

-- CreateIndex
CREATE INDEX "Schedule_nurseId_idx" ON "Schedule"("nurseId");

-- CreateIndex
CREATE INDEX "Schedule_date_idx" ON "Schedule"("date");

-- CreateIndex
CREATE INDEX "Schedule_monthlyScheduleId_date_idx" ON "Schedule"("monthlyScheduleId", "date");

-- CreateIndex
CREATE INDEX "Schedule_date_shiftType_idx" ON "Schedule"("date", "shiftType");

-- CreateIndex
CREATE INDEX "Schedule_nurseId_date_shiftType_idx" ON "Schedule"("nurseId", "date", "shiftType");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_nurseId_date_key" ON "Schedule"("nurseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleException_scheduleId_key" ON "ScheduleException"("scheduleId");

-- CreateIndex
CREATE INDEX "ScheduleException_nurseId_idx" ON "ScheduleException"("nurseId");

-- CreateIndex
CREATE INDEX "ScheduleException_date_idx" ON "ScheduleException"("date");

-- CreateIndex
CREATE INDEX "ScheduleException_monthlyScheduleId_date_idx" ON "ScheduleException"("monthlyScheduleId", "date");

-- CreateIndex
CREATE INDEX "ScheduleException_type_date_idx" ON "ScheduleException"("type", "date");

-- CreateIndex
CREATE INDEX "ManualOverride_nurseId_idx" ON "ManualOverride"("nurseId");

-- CreateIndex
CREATE INDEX "ManualOverride_date_idx" ON "ManualOverride"("date");

-- CreateIndex
CREATE INDEX "ManualOverride_scheduleId_isActive_idx" ON "ManualOverride"("scheduleId", "isActive");

-- CreateIndex
CREATE INDEX "ManualOverride_monthlyScheduleId_date_idx" ON "ManualOverride"("monthlyScheduleId", "date");

-- CreateIndex
CREATE INDEX "ManualOverride_createdById_createdAt_idx" ON "ManualOverride"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleAuditLog_nurseId_idx" ON "ScheduleAuditLog"("nurseId");

-- CreateIndex
CREATE INDEX "ScheduleAuditLog_date_idx" ON "ScheduleAuditLog"("date");

-- CreateIndex
CREATE INDEX "ScheduleAuditLog_monthlyScheduleId_createdAt_idx" ON "ScheduleAuditLog"("monthlyScheduleId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleAuditLog_scheduleId_createdAt_idx" ON "ScheduleAuditLog"("scheduleId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleAuditLog_actorId_createdAt_idx" ON "ScheduleAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleAuditLog_action_createdAt_idx" ON "ScheduleAuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "FridayAssignmentHistory_nurseId_idx" ON "FridayAssignmentHistory"("nurseId");

-- CreateIndex
CREATE INDEX "FridayAssignmentHistory_date_idx" ON "FridayAssignmentHistory"("date");

-- CreateIndex
CREATE INDEX "FridayAssignmentHistory_date_assigned_idx" ON "FridayAssignmentHistory"("date", "assigned");

-- CreateIndex
CREATE INDEX "FridayAssignmentHistory_monthlyScheduleId_date_idx" ON "FridayAssignmentHistory"("monthlyScheduleId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FridayAssignmentHistory_nurseId_date_key" ON "FridayAssignmentHistory"("nurseId", "date");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nurse" ADD CONSTRAINT "Nurse_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nurse" ADD CONSTRAINT "Nurse_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlySchedule" ADD CONSTRAINT "MonthlySchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_monthlyScheduleId_fkey" FOREIGN KEY ("monthlyScheduleId") REFERENCES "MonthlySchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "Nurse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_monthlyScheduleId_fkey" FOREIGN KEY ("monthlyScheduleId") REFERENCES "MonthlySchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "Nurse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualOverride" ADD CONSTRAINT "ManualOverride_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualOverride" ADD CONSTRAINT "ManualOverride_monthlyScheduleId_fkey" FOREIGN KEY ("monthlyScheduleId") REFERENCES "MonthlySchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualOverride" ADD CONSTRAINT "ManualOverride_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "Nurse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualOverride" ADD CONSTRAINT "ManualOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAuditLog" ADD CONSTRAINT "ScheduleAuditLog_monthlyScheduleId_fkey" FOREIGN KEY ("monthlyScheduleId") REFERENCES "MonthlySchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAuditLog" ADD CONSTRAINT "ScheduleAuditLog_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAuditLog" ADD CONSTRAINT "ScheduleAuditLog_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "Nurse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAuditLog" ADD CONSTRAINT "ScheduleAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FridayAssignmentHistory" ADD CONSTRAINT "FridayAssignmentHistory_monthlyScheduleId_fkey" FOREIGN KEY ("monthlyScheduleId") REFERENCES "MonthlySchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FridayAssignmentHistory" ADD CONSTRAINT "FridayAssignmentHistory_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "Nurse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FridayAssignmentHistory" ADD CONSTRAINT "FridayAssignmentHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
