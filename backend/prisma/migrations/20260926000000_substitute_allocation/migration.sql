ALTER TABLE "Allocation"
  ADD COLUMN "substituteComponentId" TEXT,
  ADD COLUMN "substituteRatio" INTEGER,
  ADD COLUMN "returnedGoodQty" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "damagedQty" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lostQty" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "usedUpQty" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Allocation_substituteComponentId_status_idx"
  ON "Allocation"("substituteComponentId", "status");

ALTER TABLE "Allocation"
  ADD CONSTRAINT "Allocation_substituteComponentId_fkey"
  FOREIGN KEY ("substituteComponentId") REFERENCES "Component"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
