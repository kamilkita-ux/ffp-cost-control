-- FFP Cost Control — migracja początkowa (zgodna z prisma/schema.prisma)
-- Wygenerowana i zweryfikowana ręcznie na realnej instancji PostgreSQL 16.

-- Enums
CREATE TYPE "EmployeeStatus" AS ENUM ('AKTYWNY', 'URLOP', 'ZAWIESZONY', 'ZAKONCZONA_WSPOLPRACA');
CREATE TYPE "ContractType" AS ENUM ('UMOWA_O_PRACE', 'B2B', 'ZLECENIE', 'DZIELO', 'KONTRAKT_MANAGERSKI', 'INNE');
CREATE TYPE "CriticalRating" AS ENUM ('KRYTYCZNE', 'WAZNE', 'MOZLIWE_DO_ZASTAPIENIA', 'MOZLIWE_DO_OUTSOURCINGU', 'MOZLIWE_DO_REDUKCJI');
CREATE TYPE "ProjectStatus" AS ENUM ('DEVELOPMENT', 'POZWOLENIA', 'RTB', 'BUDOWA', 'OPERACYJNY', 'ZAWIESZONY', 'SPRZEDANY', 'ZAMKNIETY');
CREATE TYPE "Recurrence" AS ENUM ('JEDNORAZOWY', 'MIESIECZNY', 'KWARTALNY', 'POLROCZNY', 'ROCZNY', 'NIEREGULARNY');
CREATE TYPE "PaymentStatus" AS ENUM ('PLANOWANY', 'ZATWIERDZONY', 'DO_ZAPLATY', 'ZAPLACONY', 'ANULOWANY');
CREATE TYPE "Necessity" AS ENUM ('NIEZBEDNY', 'WAZNY', 'OPCJONALNY', 'DO_ANALIZY', 'DO_REDUKCJI');
CREATE TYPE "FinancingType" AS ENUM ('LEASING_OPERACYJNY', 'LEASING_FINANSOWY', 'KREDYT_INWESTYCYJNY', 'KREDYT_OBROTOWY', 'POZYCZKA', 'INNE');

-- Department
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Department_deletedAt_idx" ON "Department"("deletedAt");

-- Project
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "spv" TEXT,
    "location" TEXT,
    "mwPower" DECIMAL(10,2),
    "status" "ProjectStatus" NOT NULL DEFAULT 'DEVELOPMENT',
    "owner" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- Employee
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "position" TEXT NOT NULL,
    "departmentId" TEXT,
    "managerId" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'AKTYWNY',
    "contractType" "ContractType" NOT NULL DEFAULT 'UMOWA_O_PRACE',
    "netSalary" DECIMAL(12,2),
    "grossSalary" DECIMAL(12,2),
    "employerCost" DECIMAL(12,2),
    "otherMonthlyCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "car" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "phoneCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "computer" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherBenefits" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "responsibilities" TEXT,
    "justification" TEXT,
    "keyTasks" TEXT,
    "criticalRating" "CriticalRating" NOT NULL DEFAULT 'WAZNE',
    "presidentNotes" TEXT,
    "excludeFromSimulation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Employee_deletedAt_idx" ON "Employee"("deletedAt");
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EmployeeProjectAllocation
CREATE TABLE "EmployeeProjectAllocation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "projectId" TEXT,
    "pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeProjectAllocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeeProjectAllocation_employeeId_idx" ON "EmployeeProjectAllocation"("employeeId");
CREATE INDEX "EmployeeProjectAllocation_projectId_idx" ON "EmployeeProjectAllocation"("projectId");
ALTER TABLE "EmployeeProjectAllocation" ADD CONSTRAINT "EmployeeProjectAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeProjectAllocation" ADD CONSTRAINT "EmployeeProjectAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vendor
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "nip" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "serviceType" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Vendor_deletedAt_idx" ON "Vendor"("deletedAt");

-- Cost
CREATE TABLE "Cost" (
    "id" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "vendorId" TEXT,
    "netAmount" DECIMAL(14,2),
    "vat" DECIMAL(5,2) NOT NULL DEFAULT 23,
    "grossAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "departmentId" TEXT,
    "projectId" TEXT,
    "costCenter" TEXT,
    "costDate" DATE,
    "invoiceDate" DATE,
    "dueDate" DATE,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PLANOWANY',
    "recurrence" "Recurrence" NOT NULL DEFAULT 'JEDNORAZOWY',
    "docNumber" TEXT,
    "notes" TEXT,
    "necessity" "Necessity" NOT NULL DEFAULT 'DO_ANALIZY',
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "excludeFromSimulation" BOOLEAN NOT NULL DEFAULT false,
    "budgetMonthly" DECIMAL(14,2),
    "documentLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Cost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Cost_deletedAt_idx" ON "Cost"("deletedAt");
CREATE INDEX "Cost_projectId_idx" ON "Cost"("projectId");
CREATE INDEX "Cost_departmentId_idx" ON "Cost"("departmentId");
CREATE INDEX "Cost_vendorId_idx" ON "Cost"("vendorId");
CREATE INDEX "Cost_dueDate_idx" ON "Cost"("dueDate");
CREATE INDEX "Cost_category_idx" ON "Cost"("category");
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Contract
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2),
    "netGross" TEXT NOT NULL DEFAULT 'brutto',
    "frequency" "Recurrence" NOT NULL DEFAULT 'MIESIECZNY',
    "projectId" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "noticePeriodDays" INTEGER,
    "earliestTerminationDate" DATE,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "owner" TEXT,
    "documentLink" TEXT,
    "notes" TEXT,
    "excludeFromSimulation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Contract_deletedAt_idx" ON "Contract"("deletedAt");
CREATE INDEX "Contract_projectId_idx" ON "Contract"("projectId");
CREATE INDEX "Contract_vendorId_idx" ON "Contract"("vendorId");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Financing
CREATE TABLE "Financing" (
    "id" TEXT NOT NULL,
    "lender" TEXT NOT NULL,
    "subject" TEXT,
    "type" "FinancingType" NOT NULL DEFAULT 'LEASING_OPERACYJNY',
    "initialAmount" DECIMAL(14,2),
    "remainingBalance" DECIMAL(14,2),
    "monthlyPayment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "numInstallments" INTEGER,
    "remainingInstallments" INTEGER,
    "nextPaymentDate" DATE,
    "endDate" DATE,
    "interestRate" DECIMAL(6,3),
    "projectId" TEXT,
    "notes" TEXT,
    "excludeFromSimulation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Financing_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Financing_deletedAt_idx" ON "Financing"("deletedAt");
CREATE INDEX "Financing_projectId_idx" ON "Financing"("projectId");
ALTER TABLE "Financing" ADD CONSTRAINT "Financing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Document
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "link" TEXT,
    "docType" TEXT,
    "date" DATE,
    "description" TEXT,
    "externalSource" TEXT,
    "externalId" TEXT,
    "sharePointUrl" TEXT,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");

-- AppSetting
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
