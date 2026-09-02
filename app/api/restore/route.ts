import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  str, numOrNull, intOrNull, bool, toDate, toEnum,
  EMPLOYEE_STATUS_MAP, CONTRACT_TYPE_MAP, CRITICAL_RATING_MAP, PROJECT_STATUS_MAP,
  RECURRENCE_MAP, PAYMENT_STATUS_MAP, NECESSITY_MAP, FINANCING_TYPE_MAP
} from "@/lib/serialize";
import { logChange } from "@/lib/audit";

// POST /api/restore — przywraca CAŁĄ bazę z pliku kopii zapasowej JSON
// (dokładnie ten sam format, który zwraca /api/bootstrap i który pobiera
// przycisk "Pobierz kopię zapasową" w Ustawieniach).
//
// Operacja niszcząca: usuwa bieżące dane i zastępuje je zawartością pliku,
// w jednej transakcji (albo wszystko się powiedzie, albo nic się nie zmienia).
export async function POST(req: Request) {
  const data = await req.json();
  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.employeeProjectAllocation.deleteMany({});
    await tx.cost.deleteMany({});
    await tx.contract.deleteMany({});
    await tx.financing.deleteMany({});
    await tx.document.deleteMany({});
    await tx.employee.deleteMany({});
    await tx.vendor.deleteMany({});
    await tx.project.deleteMany({});
    await tx.department.deleteMany({});

    for (const d of data.departments ?? []) {
      await tx.department.create({ data: { id: str(d.id) || undefined, name: String(d.name ?? "") } });
    }
    for (const p of data.projects ?? []) {
      await tx.project.create({
        data: {
          id: str(p.id) || undefined,
          isDemo: bool(p.isDemo),
          name: String(p.name ?? ""),
          code: str(p.code) || null,
          spv: str(p.spv) || null,
          location: str(p.location) || null,
          mwPower: numOrNull(p.mwPower),
          revenueMonthly: numOrNull(p.revenueMonthly),
          gridOperator: str(p.gridOperator) || null,
          energyBuyer: str(p.energyBuyer) || null,
          assetType: str(p.assetType) || "PV",
          capex: numOrNull(p.capex),
          budgetTotal: numOrNull(p.budgetTotal),
          requestedPowerMW: numOrNull(p.requestedPowerMW),
          grantedPowerMW: numOrNull(p.grantedPowerMW),
          connectionConditionsStatus: str(p.connectionConditionsStatus) || null,
          connectionAgreementStatus: str(p.connectionAgreementStatus) || null,
          permitsStatus: str(p.permitsStatus) || null,
          environmentalDecisionStatus: str(p.environmentalDecisionStatus) || null,
          zoningStatus: str(p.zoningStatus) || null,
          status: toEnum(PROJECT_STATUS_MAP, p.status, "DEVELOPMENT") as any,
          owner: str(p.owner) || null,
          startDate: toDate(p.startDate),
          endDate: toDate(p.endDate),
          description: str(p.description) || null
        }
      });
    }
    for (const v of data.vendors ?? []) {
      await tx.vendor.create({
        data: {
          id: str(v.id) || undefined,
          isDemo: bool(v.isDemo),
          name: String(v.name ?? ""),
          nip: str(v.nip) || null,
          contactPerson: str(v.contactPerson) || null,
          phone: str(v.phone) || null,
          email: str(v.email) || null,
          serviceType: str(v.serviceType) || null,
          notes: str(v.notes) || null
        }
      });
    }
    for (const e of data.employees ?? []) {
      const emp = await tx.employee.create({
        data: {
          id: str(e.id) || undefined,
          isDemo: bool(e.isDemo),
          firstName: String(e.firstName ?? ""),
          lastName: String(e.lastName ?? ""),
          email: str(e.email) || null,
          phone: str(e.phone) || null,
          position: String(e.position ?? ""),
          departmentId: str(e.departmentId) || null,
          managerId: str(e.managerId) || null,
          status: toEnum(EMPLOYEE_STATUS_MAP, e.status, "AKTYWNY") as any,
          contractType: toEnum(CONTRACT_TYPE_MAP, e.contractType, "UMOWA_O_PRACE") as any,
          netSalary: numOrNull(e.netSalary),
          grossSalary: numOrNull(e.grossSalary),
          employerCost: numOrNull(e.employerCost),
          otherMonthlyCost: numOrNull(e.otherMonthlyCost) ?? 0,
          bonus: numOrNull(e.bonus) ?? 0,
          car: numOrNull(e.car) ?? 0,
          phoneCost: numOrNull(e.phoneCost) ?? 0,
          computer: numOrNull(e.computer) ?? 0,
          otherBenefits: numOrNull(e.otherBenefits) ?? 0,
          responsibilities: str(e.responsibilities) || null,
          justification: str(e.justification) || null,
          keyTasks: str(e.keyTasks) || null,
          criticalRating: toEnum(CRITICAL_RATING_MAP, e.criticalRating, "WAZNE") as any,
          presidentNotes: str(e.presidentNotes) || null,
          excludeFromSimulation: bool(e.excludeFromSimulation)
        }
      });
      const allocations = Array.isArray(e.allocations) ? e.allocations : [];
      for (const a of allocations) {
        if (!a || !a.projectId) continue;
        await tx.employeeProjectAllocation.create({
          data: {
            employeeId: emp.id,
            projectId: a.projectId === "ADMIN" ? null : String(a.projectId),
            pct: numOrNull(a.pct) ?? 0
          }
        });
      }
    }
    for (const c of data.costs ?? []) {
      await tx.cost.create({
        data: {
          id: str(c.id) || undefined,
          isDemo: bool(c.isDemo),
          name: String(c.name ?? ""),
          description: str(c.description) || null,
          vendorId: str(c.vendorId) || null,
          netAmount: numOrNull(c.netAmount),
          vat: numOrNull(c.vat) ?? 23,
          grossAmount: numOrNull(c.grossAmount) ?? 0,
          currency: str(c.currency) || "PLN",
          category: String(c.category ?? "Inne"),
          subcategory: str(c.subcategory) || null,
          departmentId: str(c.departmentId) || null,
          projectId: str(c.projectId) || null,
          costCenter: str(c.costCenter) || null,
          costDate: toDate(c.costDate),
          invoiceDate: toDate(c.invoiceDate),
          dueDate: toDate(c.dueDate),
          paymentStatus: toEnum(PAYMENT_STATUS_MAP, c.paymentStatus, "PLANOWANY") as any,
          recurrence: toEnum(RECURRENCE_MAP, c.recurrence, "JEDNORAZOWY") as any,
          docNumber: str(c.docNumber) || null,
          notes: str(c.notes) || null,
          necessity: toEnum(NECESSITY_MAP, c.necessity, "DO_ANALIZY") as any,
          isFixed: bool(c.isFixed),
          excludeFromSimulation: bool(c.excludeFromSimulation),
          budgetMonthly: numOrNull(c.budgetMonthly),
          documentLink: str(c.documentLink) || null
        }
      });
    }
    for (const c of data.contracts ?? []) {
      await tx.contract.create({
        data: {
          id: str(c.id) || undefined,
          vendorId: str(c.vendorId) || null,
          name: String(c.name ?? ""),
          description: str(c.description) || null,
          amount: numOrNull(c.amount),
          netGross: str(c.netGross) || "brutto",
          frequency: toEnum(RECURRENCE_MAP, c.frequency, "MIESIECZNY") as any,
          projectId: str(c.projectId) || null,
          startDate: toDate(c.startDate),
          endDate: toDate(c.endDate),
          noticePeriodDays: intOrNull(c.noticePeriodDays),
          earliestTerminationDate: toDate(c.earliestTerminationDate),
          autoRenew: bool(c.autoRenew),
          owner: str(c.owner) || null,
          documentLink: str(c.documentLink) || null,
          notes: str(c.notes) || null,
          excludeFromSimulation: bool(c.excludeFromSimulation)
        }
      });
    }
    for (const f of data.financings ?? []) {
      await tx.financing.create({
        data: {
          id: str(f.id) || undefined,
          lender: String(f.lender ?? ""),
          subject: str(f.subject) || null,
          type: toEnum(FINANCING_TYPE_MAP, f.type, "LEASING_OPERACYJNY") as any,
          initialAmount: numOrNull(f.initialAmount),
          remainingBalance: numOrNull(f.remainingBalance),
          monthlyPayment: numOrNull(f.monthlyPayment) ?? 0,
          numInstallments: intOrNull(f.numInstallments),
          remainingInstallments: intOrNull(f.remainingInstallments),
          nextPaymentDate: toDate(f.nextPaymentDate),
          endDate: toDate(f.endDate),
          interestRate: numOrNull(f.interestRate),
          projectId: str(f.projectId) || null,
          notes: str(f.notes) || null,
          excludeFromSimulation: bool(f.excludeFromSimulation)
        }
      });
    }
    for (const d of data.documents ?? []) {
      await tx.document.create({
        data: {
          id: str(d.id) || undefined,
          name: String(d.name ?? ""),
          link: str(d.link) || null,
          docType: str(d.docType) || null,
          date: toDate(d.date),
          description: str(d.description) || null,
          externalSource: str(d.externalSource) || null,
          externalId: str(d.externalId) || null,
          sharePointUrl: str(d.sharePointUrl) || null,
          documentUrl: str(d.documentUrl) || null
        }
      });
    }

    if (data.costCategories) {
      await tx.appSetting.upsert({ where: { key: "costCategories" }, create: { key: "costCategories", value: data.costCategories }, update: { value: data.costCategories } });
    }
    if (data.costCenters) {
      await tx.appSetting.upsert({ where: { key: "costCenters" }, create: { key: "costCenters", value: data.costCenters }, update: { value: data.costCenters } });
    }
    if (data.currency) {
      await tx.appSetting.upsert({ where: { key: "currency" }, create: { key: "currency", value: data.currency }, update: { value: data.currency } });
    }
  }, { timeout: 30000 });

  await logChange(req, "database", null, "update", "Przywrócono bazę z pliku kopii zapasowej (restore)");
  return NextResponse.json({ ok: true });
}
