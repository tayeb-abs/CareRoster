CREATE TABLE "ClinicProfile" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'default',
    "clinicNameEn" VARCHAR(160) NOT NULL DEFAULT 'Evercare Medical Center',
    "clinicNameAr" VARCHAR(160) NOT NULL DEFAULT 'مركز إيفركير الطبي',
    "logoDataUrl" TEXT,
    "address" VARCHAR(300),
    "phoneNumber" VARCHAR(40),
    "departmentName" VARCHAR(120),
    "headNurseName" VARCHAR(120),
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ClinicProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClinicProfile_updatedById_updatedAt_idx"
ON "ClinicProfile"("updatedById", "updatedAt");

ALTER TABLE "ClinicProfile"
ADD CONSTRAINT "ClinicProfile_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ClinicProfile" ("id", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP);
