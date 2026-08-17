-- Preserve the existing daily-reading requirement for every current user, then
-- let each account opt into a bounded consecutive-day break allowance.
ALTER TABLE "User"
  ADD COLUMN "maxConsecutiveDaysOff" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "User"
  ADD CONSTRAINT "User_maxConsecutiveDaysOff_range"
  CHECK ("maxConsecutiveDaysOff" BETWEEN 0 AND 30);
