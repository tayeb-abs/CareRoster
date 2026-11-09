ALTER TABLE "Nurse"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ordered_nurses AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) - 1 AS "sortOrder"
  FROM "Nurse"
)
UPDATE "Nurse"
SET "sortOrder" = ordered_nurses."sortOrder"
FROM ordered_nurses
WHERE "Nurse"."id" = ordered_nurses."id";

CREATE INDEX "Nurse_deletedAt_sortOrder_idx" ON "Nurse"("deletedAt", "sortOrder");
