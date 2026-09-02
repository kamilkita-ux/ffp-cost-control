-- Nowe pola projektu: CAPEX, budżet całkowity, rodzaj aktywa, moc
-- wnioskowana/przyznana, statusy ryzyka (przyłącze, pozwolenia, środowisko, MPZP/WZ).
ALTER TABLE "Project" ADD COLUMN "assetType" TEXT DEFAULT 'PV';
ALTER TABLE "Project" ADD COLUMN "capex" DECIMAL(14,2);
ALTER TABLE "Project" ADD COLUMN "budgetTotal" DECIMAL(14,2);
ALTER TABLE "Project" ADD COLUMN "requestedPowerMW" DECIMAL(10,2);
ALTER TABLE "Project" ADD COLUMN "grantedPowerMW" DECIMAL(10,2);
ALTER TABLE "Project" ADD COLUMN "connectionConditionsStatus" TEXT;
ALTER TABLE "Project" ADD COLUMN "connectionAgreementStatus" TEXT;
ALTER TABLE "Project" ADD COLUMN "permitsStatus" TEXT;
ALTER TABLE "Project" ADD COLUMN "environmentalDecisionStatus" TEXT;
ALTER TABLE "Project" ADD COLUMN "zoningStatus" TEXT;

-- Dziennik zmian (audyt)
CREATE TABLE "ChangeLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT,

    CONSTRAINT "ChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChangeLog_createdAt_idx" ON "ChangeLog"("createdAt");
CREATE INDEX "ChangeLog_entity_idx" ON "ChangeLog"("entity");
