// Mapowanie pomiędzy wartościami używanymi w interfejsie (polskie etykiety w
// dropdownach, dokładnie takie same jak w oryginalnym UI) a enumami Prisma/Postgres.
// Frontend NIE MOŻE się zmienić (wymóg: zachować UX) — więc to tłumaczenie żyje
// wyłącznie w warstwie API.

export const EMPLOYEE_STATUS_MAP: Record<string, string> = {
  "aktywny": "AKTYWNY",
  "urlop": "URLOP",
  "zawieszony": "ZAWIESZONY",
  "zakończona współpraca": "ZAKONCZONA_WSPOLPRACA"
};
export const CONTRACT_TYPE_MAP: Record<string, string> = {
  "umowa o pracę": "UMOWA_O_PRACE",
  "B2B": "B2B",
  "zlecenie": "ZLECENIE",
  "dzieło": "DZIELO",
  "kontrakt managerski": "KONTRAKT_MANAGERSKI",
  "inne": "INNE"
};
export const CRITICAL_RATING_MAP: Record<string, string> = {
  "krytyczne": "KRYTYCZNE",
  "ważne": "WAZNE",
  "możliwe do zastąpienia": "MOZLIWE_DO_ZASTAPIENIA",
  "możliwe do outsourcingu": "MOZLIWE_DO_OUTSOURCINGU",
  "możliwe do redukcji": "MOZLIWE_DO_REDUKCJI"
};
export const PROJECT_STATUS_MAP: Record<string, string> = {
  "development": "DEVELOPMENT",
  "pozwolenia": "POZWOLENIA",
  "RTB": "RTB",
  "budowa": "BUDOWA",
  "operacyjny": "OPERACYJNY",
  "zawieszony": "ZAWIESZONY",
  "sprzedany": "SPRZEDANY",
  "zamknięty": "ZAMKNIETY"
};
export const RECURRENCE_MAP: Record<string, string> = {
  "jednorazowy": "JEDNORAZOWY",
  "miesięczny": "MIESIECZNY",
  "kwartalny": "KWARTALNY",
  "półroczny": "POLROCZNY",
  "roczny": "ROCZNY",
  "nieregularny": "NIEREGULARNY"
};
export const PAYMENT_STATUS_MAP: Record<string, string> = {
  "planowany": "PLANOWANY",
  "zatwierdzony": "ZATWIERDZONY",
  "do zapłaty": "DO_ZAPLATY",
  "zapłacony": "ZAPLACONY",
  "anulowany": "ANULOWANY"
};
export const NECESSITY_MAP: Record<string, string> = {
  "niezbędny": "NIEZBEDNY",
  "ważny": "WAZNY",
  "opcjonalny": "OPCJONALNY",
  "do analizy": "DO_ANALIZY",
  "do redukcji": "DO_REDUKCJI"
};
export const FINANCING_TYPE_MAP: Record<string, string> = {
  "leasing operacyjny": "LEASING_OPERACYJNY",
  "leasing finansowy": "LEASING_FINANSOWY",
  "kredyt inwestycyjny": "KREDYT_INWESTYCYJNY",
  "kredyt obrotowy": "KREDYT_OBROTOWY",
  "pożyczka": "POZYCZKA",
  "inne": "INNE"
};

function invert(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k in map) out[map[k]] = k;
  return out;
}
export const EMPLOYEE_STATUS_MAP_REV = invert(EMPLOYEE_STATUS_MAP);
export const CONTRACT_TYPE_MAP_REV = invert(CONTRACT_TYPE_MAP);
export const CRITICAL_RATING_MAP_REV = invert(CRITICAL_RATING_MAP);
export const PROJECT_STATUS_MAP_REV = invert(PROJECT_STATUS_MAP);
export const RECURRENCE_MAP_REV = invert(RECURRENCE_MAP);
export const PAYMENT_STATUS_MAP_REV = invert(PAYMENT_STATUS_MAP);
export const NECESSITY_MAP_REV = invert(NECESSITY_MAP);
export const FINANCING_TYPE_MAP_REV = invert(FINANCING_TYPE_MAP);

export function toEnum(map: Record<string, string>, value: unknown, fallback: string): string {
  if (typeof value === "string" && map[value]) return map[value];
  return fallback;
}
export function fromEnum(mapRev: Record<string, string>, value: unknown, fallback: string): string {
  if (typeof value === "string" && mapRev[value]) return mapRev[value];
  return fallback;
}

// Daty: frontend używa <input type="date"> => zawsze 'YYYY-MM-DD' albo pusty string.
export function toDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? null : d;
}
export function fromDate(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}
export function fromDateTime(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString();
}

// Decimal (Prisma.Decimal) -> number, bezpiecznie dla null/undefined.
export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}
export function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}
export function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}
export function strOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}
export function bool(value: unknown): boolean {
  return value === true || value === "on" || value === "true";
}
export function intOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = parseInt(String(value), 10);
  return isNaN(n) ? null : n;
}

// ---- Serializacja rekordów Prisma -> kształt STATE oczekiwany przez frontend ----

export function serializeDepartment(d: any) {
  return { id: d.id, name: d.name };
}

export function serializeProject(p: any) {
  return {
    id: p.id,
    isDemo: p.isDemo,
    name: p.name,
    code: str(p.code),
    spv: str(p.spv),
    location: str(p.location),
    mwPower: p.mwPower === null ? "" : num(p.mwPower),
    revenueMonthly: p.revenueMonthly === null ? "" : num(p.revenueMonthly),
    gridOperator: str(p.gridOperator),
    energyBuyer: str(p.energyBuyer),
    assetType: str(p.assetType) || "PV",
    capex: p.capex === null || p.capex === undefined ? "" : num(p.capex),
    budgetTotal: p.budgetTotal === null || p.budgetTotal === undefined ? "" : num(p.budgetTotal),
    requestedPowerMW: p.requestedPowerMW === null || p.requestedPowerMW === undefined ? "" : num(p.requestedPowerMW),
    grantedPowerMW: p.grantedPowerMW === null || p.grantedPowerMW === undefined ? "" : num(p.grantedPowerMW),
    connectionConditionsStatus: str(p.connectionConditionsStatus),
    connectionAgreementStatus: str(p.connectionAgreementStatus),
    permitsStatus: str(p.permitsStatus),
    environmentalDecisionStatus: str(p.environmentalDecisionStatus),
    zoningStatus: str(p.zoningStatus),
    status: fromEnum(PROJECT_STATUS_MAP_REV, p.status, "development"),
    owner: str(p.owner),
    startDate: fromDate(p.startDate),
    endDate: fromDate(p.endDate),
    description: str(p.description)
  };
}

export function serializeEmployee(e: any) {
  return {
    id: e.id,
    isDemo: e.isDemo,
    firstName: e.firstName,
    lastName: e.lastName,
    email: str(e.email),
    phone: str(e.phone),
    position: e.position,
    departmentId: str(e.departmentId),
    managerId: str(e.managerId),
    status: fromEnum(EMPLOYEE_STATUS_MAP_REV, e.status, "aktywny"),
    contractType: fromEnum(CONTRACT_TYPE_MAP_REV, e.contractType, "umowa o pracę"),
    netSalary: e.netSalary === null ? "" : num(e.netSalary),
    grossSalary: e.grossSalary === null ? "" : num(e.grossSalary),
    employerCost: e.employerCost === null ? "" : num(e.employerCost),
    otherMonthlyCost: num(e.otherMonthlyCost),
    bonus: num(e.bonus),
    car: num(e.car),
    phoneCost: num(e.phoneCost),
    computer: num(e.computer),
    otherBenefits: num(e.otherBenefits),
    responsibilities: str(e.responsibilities),
    justification: str(e.justification),
    keyTasks: str(e.keyTasks),
    allocations: (e.allocations || []).map((a: any) => ({
      projectId: a.projectId === null ? "ADMIN" : a.projectId,
      pct: num(a.pct)
    })),
    criticalRating: fromEnum(CRITICAL_RATING_MAP_REV, e.criticalRating, "ważne"),
    presidentNotes: str(e.presidentNotes),
    excludeFromSimulation: e.excludeFromSimulation
  };
}

export function serializeVendor(v: any) {
  return {
    id: v.id,
    isDemo: v.isDemo,
    name: v.name,
    nip: str(v.nip),
    contactPerson: str(v.contactPerson),
    phone: str(v.phone),
    email: str(v.email),
    serviceType: str(v.serviceType),
    notes: str(v.notes)
  };
}

export function serializeCost(c: any) {
  return {
    id: c.id,
    isDemo: c.isDemo,
    name: c.name,
    description: str(c.description),
    vendorId: str(c.vendorId),
    netAmount: c.netAmount === null ? "" : num(c.netAmount),
    vat: num(c.vat),
    grossAmount: num(c.grossAmount),
    currency: c.currency,
    category: c.category,
    subcategory: str(c.subcategory),
    departmentId: str(c.departmentId),
    projectId: str(c.projectId),
    costCenter: str(c.costCenter),
    costDate: fromDate(c.costDate),
    invoiceDate: fromDate(c.invoiceDate),
    dueDate: fromDate(c.dueDate),
    paymentStatus: fromEnum(PAYMENT_STATUS_MAP_REV, c.paymentStatus, "planowany"),
    recurrence: fromEnum(RECURRENCE_MAP_REV, c.recurrence, "jednorazowy"),
    docNumber: str(c.docNumber),
    notes: str(c.notes),
    necessity: fromEnum(NECESSITY_MAP_REV, c.necessity, "do analizy"),
    isFixed: c.isFixed,
    excludeFromSimulation: c.excludeFromSimulation,
    budgetMonthly: c.budgetMonthly === null ? "" : num(c.budgetMonthly),
    documentLink: str(c.documentLink)
  };
}

export function serializeContract(c: any) {
  return {
    id: c.id,
    vendorId: str(c.vendorId),
    name: c.name,
    description: str(c.description),
    amount: c.amount === null ? "" : num(c.amount),
    netGross: c.netGross,
    frequency: fromEnum(RECURRENCE_MAP_REV, c.frequency, "miesięczny"),
    projectId: str(c.projectId),
    startDate: fromDate(c.startDate),
    endDate: fromDate(c.endDate),
    noticePeriodDays: c.noticePeriodDays === null ? "" : c.noticePeriodDays,
    earliestTerminationDate: fromDate(c.earliestTerminationDate),
    autoRenew: c.autoRenew,
    owner: str(c.owner),
    documentLink: str(c.documentLink),
    notes: str(c.notes),
    excludeFromSimulation: c.excludeFromSimulation
  };
}

export function serializeFinancing(f: any) {
  return {
    id: f.id,
    lender: f.lender,
    subject: str(f.subject),
    type: fromEnum(FINANCING_TYPE_MAP_REV, f.type, "leasing operacyjny"),
    initialAmount: f.initialAmount === null ? "" : num(f.initialAmount),
    remainingBalance: f.remainingBalance === null ? "" : num(f.remainingBalance),
    monthlyPayment: num(f.monthlyPayment),
    numInstallments: f.numInstallments === null ? "" : f.numInstallments,
    remainingInstallments: f.remainingInstallments === null ? "" : f.remainingInstallments,
    nextPaymentDate: fromDate(f.nextPaymentDate),
    endDate: fromDate(f.endDate),
    interestRate: f.interestRate === null ? "" : num(f.interestRate),
    projectId: str(f.projectId),
    notes: str(f.notes),
    excludeFromSimulation: f.excludeFromSimulation
  };
}

export function serializeDocument(d: any) {
  return {
    id: d.id,
    name: d.name,
    link: str(d.link),
    docType: str(d.docType),
    date: fromDate(d.date),
    description: str(d.description),
    externalSource: str(d.externalSource),
    externalId: str(d.externalId),
    sharePointUrl: str(d.sharePointUrl),
    documentUrl: str(d.documentUrl)
  };
}
