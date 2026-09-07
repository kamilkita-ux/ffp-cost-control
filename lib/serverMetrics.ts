// Serwerowa wersja części funkcji metrics() z app/app-shell.html — liczy
// TE SAME sumy zbiorcze (koszt pracowniczy per projekt/dział, wynik
// firmy itd.), ale robi to na serwerze, na podstawie PEŁNYCH,
// nieukrytych danych. Dzięki temu dla kont z listy "restricted"
// (app/api/bootstrap/route.ts) można bezpiecznie usunąć z odpowiedzi API
// surowe kwoty wynagrodzeń poszczególnych osób, a mimo to interfejs
// dalej pokazuje poprawne sumy (koszt projektu, wynik firmy, koszty
// działów) — bo te sumy przychodzą gotowe z tego modułu, zamiast być
// wyliczane w przeglądarce z (teraz ukrytych) kwot per-pracownik.
//
// UWAGA — to jest CELOWO zduplikowana logika względem metrics() w
// app/app-shell.html (ta sama zasada liczenia, dwa miejsca). Jeśli
// zmienia się sposób liczenia kosztu pracownika/projektu w jednym
// miejscu, trzeba to samo poprawić w drugim — inaczej dashboard kont
// pełnych i kont ograniczonych zacznie pokazywać różne liczby. Osobny
// plik (nie import z .html) dlatego, że app-shell.html to statyczny
// plik wysyłany do przeglądarki, nie moduł Node.

type AnyRec = Record<string, any>;

function monthlyEquivalent(cost: AnyRec): number {
  const g = Number(cost.grossAmount) || Number(cost.netAmount) || 0;
  switch (cost.recurrence) {
    case "miesięczny": return g;
    case "kwartalny": return g / 3;
    case "półroczny": return g / 6;
    case "roczny": return g / 12;
    default: return 0; // jednorazowy / nieregularny
  }
}

function monthlyEquivalentGeneric(amount: any, freq: string): number {
  const a = Number(amount) || 0;
  switch (freq) {
    case "miesięczny": return a;
    case "kwartalny": return a / 3;
    case "półroczny": return a / 6;
    case "roczny": return a / 12;
    default: return a;
  }
}

function totalMonthlyCostEmployee(e: AnyRec): number {
  if (e.status === "zakończona współpraca") return 0;
  const base = Number(e.employerCost) || Number(e.grossSalary) || 0;
  const extra =
    (Number(e.otherMonthlyCost) || 0) +
    (Number(e.bonus) || 0) +
    (Number(e.car) || 0) +
    (Number(e.phoneCost) || 0) +
    (Number(e.computer) || 0) +
    (Number(e.otherBenefits) || 0);
  return base + extra;
}

function empAllocPct(e: AnyRec, projectId: string): number {
  if (!e.allocations || !e.allocations.length) return projectId === "ADMIN" ? 100 : 0;
  const a = e.allocations.find((x: AnyRec) => x.projectId === projectId);
  return a ? Number(a.pct) || 0 : 0;
}

export interface ServerMetrics {
  monthlyPayroll: number;
  monthlyExternal: number;
  monthlyFinancing: number;
  monthlyFixed: number;
  totalBurn: number;
  annualRunRate: number;
  monthlyProjectCost: Record<string, number>;
  totalProjectCost: number;
  monthlyProjectRevenue: Record<string, number>;
  monthlyRevenue: number;
  monthlyRevenueProjected: number;
  monthlyProfit: number;
  annualProfit: number;
  monthlyAdmin: number;
  deptCost: Record<string, { employees: number; empCost: number; otherCost: number; total: number }>;
  potentialSavingsMonthly: number;
  potentialSavingsAnnual: number;
  byAssetType: Record<string, { revenue: number; cost: number; count: number; mwPower: number }>;
}

// Liczy dokładnie te pola z metrics(), które zależą od kwot wynagrodzeń
// (bezpośrednio lub pośrednio) i które są pokazywane też kontom
// ograniczonym jako sumy zbiorcze. Wejściem są PEŁNE, nieukryte tablice
// (przed jakąkolwiek redakcją pod kątem "restricted").
export function computeServerMetrics(data: {
  projects: AnyRec[];
  costs: AnyRec[];
  employees: AnyRec[];
  departments: AnyRec[];
  financings: AnyRec[];
  contracts: AnyRec[];
}): ServerMetrics {
  const { projects, costs, employees, departments, financings, contracts } = data;

  const realProjects = projects.filter((p) => !p.isDemo);
  const realCosts = costs.filter((c) => !c.isDemo);
  const realEmployeesAll = employees.filter((e) => !e.isDemo);
  const activeEmployees = realEmployeesAll.filter((e) => e.status !== "zakończona współpraca");

  const monthlyPayroll = activeEmployees.reduce((s, e) => s + totalMonthlyCostEmployee(e), 0);
  const monthlyExternal = realCosts.reduce((s, c) => s + monthlyEquivalent(c), 0);
  const monthlyFinancing = financings.reduce((s, f) => s + (Number(f.monthlyPayment) || 0), 0);
  const monthlyFixedNonPayroll = realCosts.filter((c) => c.isFixed).reduce((s, c) => s + monthlyEquivalent(c), 0);
  const monthlyFixed = monthlyPayroll + monthlyFixedNonPayroll + monthlyFinancing;
  const totalBurn = monthlyPayroll + monthlyExternal + monthlyFinancing;
  const annualRunRate = totalBurn * 12;

  const monthlyProjectCost: Record<string, number> = {};
  for (const p of projects) {
    const c = realCosts.filter((x) => x.projectId === p.id).reduce((s, x) => s + monthlyEquivalent(x), 0);
    const emp = activeEmployees.reduce((s, e) => s + totalMonthlyCostEmployee(e) * (empAllocPct(e, p.id) / 100), 0);
    monthlyProjectCost[p.id] = c + emp;
  }
  const totalProjectCost = realProjects.reduce((s, p) => s + (monthlyProjectCost[p.id] || 0), 0);

  const monthlyProjectRevenue: Record<string, number> = {};
  for (const p of projects) monthlyProjectRevenue[p.id] = Number(p.revenueMonthly) || 0;

  const operationalProjects = realProjects.filter((p) => p.status === "operacyjny");
  const nonOperationalProjects = realProjects.filter((p) => p.status !== "operacyjny");
  const monthlyRevenue = operationalProjects.reduce((s, p) => s + (monthlyProjectRevenue[p.id] || 0), 0);
  const monthlyRevenueProjected = nonOperationalProjects.reduce((s, p) => s + (monthlyProjectRevenue[p.id] || 0), 0);

  const byAssetType: ServerMetrics["byAssetType"] = {};
  for (const p of realProjects) {
    const t = p.assetType || "PV";
    if (!byAssetType[t]) byAssetType[t] = { revenue: 0, cost: 0, count: 0, mwPower: 0 };
    byAssetType[t].revenue += monthlyProjectRevenue[p.id] || 0;
    byAssetType[t].cost += monthlyProjectCost[p.id] || 0;
    byAssetType[t].count += 1;
    byAssetType[t].mwPower += Number(p.mwPower) || 0;
  }

  const unassignedCosts = realCosts.filter((c) => !c.projectId);
  const monthlyAdminFromCosts = unassignedCosts.reduce((s, c) => s + monthlyEquivalent(c), 0);
  const monthlyAdminFromEmp = activeEmployees.reduce((s, e) => s + totalMonthlyCostEmployee(e) * (empAllocPct(e, "ADMIN") / 100), 0);
  const monthlyAdmin = monthlyAdminFromCosts + monthlyAdminFromEmp;

  const deptCost: ServerMetrics["deptCost"] = {};
  for (const d of departments) {
    const deptEmployees = activeEmployees.filter((e) => e.departmentId === d.id);
    const empC = deptEmployees.reduce((s, e) => s + totalMonthlyCostEmployee(e), 0);
    const costC = realCosts.filter((c) => c.departmentId === d.id).reduce((s, c) => s + monthlyEquivalent(c), 0);
    deptCost[d.id] = { employees: deptEmployees.length, empCost: empC, otherCost: costC, total: empC + costC };
  }

  const potentialSavingsMonthly =
    realCosts.filter((c) => c.excludeFromSimulation).reduce((s, c) => s + monthlyEquivalent(c), 0) +
    realEmployeesAll.filter((e) => e.excludeFromSimulation).reduce((s, e) => s + totalMonthlyCostEmployee(e), 0) +
    contracts.filter((c) => c.excludeFromSimulation).reduce((s, c) => s + monthlyEquivalentGeneric(c.amount, c.frequency), 0) +
    financings.filter((f) => f.excludeFromSimulation).reduce((s, f) => s + (Number(f.monthlyPayment) || 0), 0);

  const monthlyProfit = monthlyRevenue - totalBurn;

  return {
    monthlyPayroll, monthlyExternal, monthlyFinancing, monthlyFixed, totalBurn, annualRunRate,
    monthlyProjectCost, totalProjectCost, monthlyProjectRevenue, monthlyRevenue, monthlyRevenueProjected,
    monthlyProfit, annualProfit: monthlyProfit * 12,
    monthlyAdmin, deptCost, potentialSavingsMonthly, potentialSavingsAnnual: potentialSavingsMonthly * 12,
    byAssetType
  };
}

// Pola pracownika, które są kwotami wynagrodzenia/benefitów — usuwane z
// odpowiedzi API dla kont z listy "restricted". Imię, nazwisko,
// stanowisko, dział, alokacje % na projekty i ocena stanowiska ZOSTAJĄ
// (to nie są kwoty pieniężne), bo są potrzebne np. do listy osób
// przypisanych do projektu.
const SALARY_FIELDS = [
  "netSalary", "grossSalary", "employerCost", "otherMonthlyCost",
  "bonus", "car", "phoneCost", "computer", "otherBenefits"
] as const;

export function redactEmployeeSalary<T extends AnyRec>(employee: T): T {
  const copy: AnyRec = { ...employee };
  for (const f of SALARY_FIELDS) copy[f] = null;
  return copy as T;
}

// Ukrywa powiązanie "imię/rola -> kwota" w ręcznie wpisywanych pozycjach
// harmonogramu kosztów stałych (Założenia -> Koszty Stałe), bo część z
// nich to nazwane osoby ("Biuro Zarządu / Michał B2B" itp.) — kwoty
// (current/future12m) ZOSTAJĄ nietknięte, żeby sumy (np. panel "Trzy
// stany portfela" na dashboardzie) się zgadzały; usuwana jest tylko
// nazwa i notatka, które ujawniają, o kogo chodzi.
export function redactFixedCostLineItem<T extends AnyRec>(item: T, index: number): T {
  return { ...item, name: `Pozycja kosztowa ${index + 1} (ukryta)`, note: "" } as T;
}
