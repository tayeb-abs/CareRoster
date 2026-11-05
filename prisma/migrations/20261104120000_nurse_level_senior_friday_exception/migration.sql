CREATE TYPE "NurseLevel" AS ENUM ('SENIOR', 'REGULAR');

ALTER TABLE "Nurse"
ADD COLUMN "level" "NurseLevel" NOT NULL DEFAULT 'REGULAR';

ALTER TABLE "Schedule"
ADD COLUMN "exceptionApproved" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Schedule"
ADD COLUMN "seniorFridayOverrideApproved" BOOLEAN NOT NULL DEFAULT false;
