// Testy modułów przeglądarkowych (app/app-shell.html) uruchamiane w izolowanym
// kontekście VM z atrapą DOM i kontrolowanym STATE — 2026-09-19. Pokrywają
// logikę, która wcześniej nie miała żadnego testu: harmonogram rat malejących,
// rejestr płatności (paymentItems / zaległe / nadchodzące), rejestr terminów,
// kompletność danych, alerty Dashboardu, analizę wrażliwości Portfela,
// propozycje przypisania farm do spółek.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function iso(d: Date): string { const p2 = (n: number) => (n < 10 ? "0" : "") + n; return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
const today = new Date(); today.setHours(0, 0, 0, 0);
const addDays = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
const addMonths = (n: number, day = 1) => { const d = new Date(today.getFullYear(), today.getMonth() + n, day); return iso(d); };
const ym = (n: number) => addMonths(n).slice(0, 7);

function loadFront(state: any): any {
  const html = readFileSync(join(ROOT, "app/app-shell.html"), "utf-8");
  const js = html.match(/<script>([\s\S]*)<\/script>/)![1];
  const el = () => ({ innerHTML: "", textContent: "", style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, appendChild() {}, parentNode: null, value: "", querySelector() { return null; }, contains() { return false; } });
  const ctx: any = {
    console, setTimeout, clearTimeout, setInterval() { return 0; }, clearInterval() {},
    document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: el, body: el() },
    window: { addEventListener() {}, location: { search: "" }, matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: {} },
    navigator: { onLine: true, serviceWorker: { register: () => Promise.resolve() } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: () => new Promise(() => {}), alert() {}, confirm() { return false; }, prompt() { return null; }, location: { search: "" },
    Intl, Date, Math, Number, String, Object, Array, JSON, RegExp, Promise, Set, Map, Blob: function () {}, URL: { createObjectURL() {} }
  };
  ctx.window.document = ctx.document; ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(js, ctx); } catch { /* atrapa DOM przerywa inicjalizację — funkcje są zdefiniowane */ }
  // Zmienne globalne inicjalizowane po miejscu przerwania — ustawiamy ręcznie.
  Object.assign(ctx, { STATE: state, METRICS_CACHE: null, DASH_PERIOD: "2y", PF_SENS: { price: 0, yield: 0, capex: 0 }, FIN_SCHEDULE_MONTHS: 36, FIN_TASK_FILTER: "open", DL_FILTER: "open", PAY_SHOW_PAID: false, COMPL_OPEN: {}, GROUP_COLLAPSED: {}, GROUP_ZOOM: 1, QUICK_QUEUE: [], REC_STEP: { "miesięczny": 1, "kwartalny": 3, "półroczny": 6, "roczny": 12 } });
  return ctx;
}

function baseState(): any {
  return {
    projects: [
      { id: "p1", name: "Miejsce Piastowe", code: "PV-MP", status: "operacyjny", revenueMonthly: 60000, mwPower: 2, capex: 6000000, endDate: addMonths(-3), assetType: "PV", isDemo: false, location: "x", gridOperator: "PGE", energyBuyer: "PPA", startDate: addMonths(-12) },
      { id: "p2", name: "F9 Chludowo", code: "PV-F9", status: "budowa", revenueMonthly: 30000, mwPower: 1, capex: 3000000, endDate: addMonths(4), assetType: "PV", isDemo: false },
      { id: "p3", name: "Stara", status: "sprzedany", revenueMonthly: 99999, mwPower: 5, isDemo: false },
      { id: "pd", name: "Demo", status: "operacyjny", revenueMonthly: 12345, isDemo: true }
    ],
    costs: [
      { id: "c1", name: "Biuro", category: "Biuro", grossAmount: 3000, recurrence: "miesięczny", paymentStatus: "planowany", costDate: addMonths(-6, 10), projectId: null, departmentId: "d1", isDemo: false, necessity: "niezbędny" },
      { id: "c2", name: "OPEX MP", category: "OPEX", grossAmount: 1200, recurrence: "kwartalny", paymentStatus: "planowany", costDate: addMonths(-3, 5), projectId: "p1", isDemo: false, necessity: "niezbędny" },
      { id: "c3", name: "Faktura jednorazowa", category: "Usługi", grossAmount: 5000, recurrence: "jednorazowy", paymentStatus: "do zapłaty", costDate: addDays(-20), dueDate: addDays(-5), projectId: null, departmentId: "d1", isDemo: false, necessity: "ważny" },
      { id: "c4", name: "Anulowany", category: "IT", grossAmount: 999, recurrence: "miesięczny", paymentStatus: "anulowany", costDate: addMonths(-6), projectId: null, isDemo: false }
    ],
    employees: [{ id: "e1", firstName: "A", lastName: "B", status: "aktywny", employerCost: 10000, departmentId: "d1", position: "x", allocations: [{ projectId: "p1", pct: 100 }], isDemo: false }],
    departments: [{ id: "d1", name: "Operacje" }],
    vendors: [], contracts: [], documents: [],
    financings: [
      { id: "f1", lender: "Bank A", type: "kredyt inwestycyjny", initialAmount: 1200000, remainingBalance: 1200000, monthlyPayment: 15000, interestRate: 6, numInstallments: 120, remainingInstallments: 120, nextPaymentDate: addMonths(1, 15), endDate: addMonths(120, 15), projectId: "p2" },
      { id: "f2", lender: "Leasing B", type: "leasing operacyjny", initialAmount: 120000, remainingBalance: 60000, monthlyPayment: 2500, interestRate: "", numInstallments: 48, remainingInstallments: 24, nextPaymentDate: addMonths(0, 20), endDate: addMonths(24, 20), projectId: "p1" }
    ],
    fixedCostSchedule: { lineItems: [], monthlySchedule: [], revenueMonthlySchedule: [] },
    costCategories: ["Biuro", "OPEX", "Usługi", "IT"], costCenters: [], currency: "PLN", restricted: false, isAdmin: true,
    groupStructure: { version: 1, asOfLabel: "", entities: [
      { id: "ffp", name: "FFP S.A.", type: "S.A.", kind: "parent", status: "aktywna", roles: [{ person: "K", role: "Prezes" }], projectIds: [] },
      { id: "farmy", name: "Farmy Sp. z o.o.", type: "Sp. z o.o.", kind: "company", status: "aktywna", roles: [{ person: "J", role: "Prezes" }], projectIds: [] },
      { id: "f9", name: "Farma F9 Sp. z o.o.", type: "Sp. z o.o.", kind: "company", status: "aktywna", roles: [], projectIds: [] },
      { id: "mp", name: "Miejsce Piastowe Sp. z o.o.", type: "Sp. z o.o.", kind: "company", status: "KRS w toku", roles: [], projectIds: [] }
    ], shares: [{ owner: "ffp", owned: "farmy", pct: 100 }, { owner: "farmy", owned: "f9", pct: 100 }, { owner: "farmy", owned: "mp", pct: 100 }] },
    financeWorkspace: { notes: "", tasks: [{ id: "t1", title: "Zadanie", due: addDays(1), done: false }] },
    deadlines: [
      { id: "d1", title: "Warunki przyłączenia", date: addDays(-2), type: "warunki przyłączenia", projectId: "p2", done: false },
      { id: "d2", title: "Pozwolenie", date: addDays(5), type: "pozwolenie na budowę", projectId: "p2", done: false },
      { id: "d3", title: "Zrobione", date: addDays(-30), type: "inne", done: true }
    ],
    farmActuals: { p1: {} },
    paymentLedger: {}
  };
}

test("harmonogram rat: kredyt malejący + leasing płaski, saldo maleje, 0 przed pierwszą ratą", () => {
  const ctx = loadFront(baseState());
  const rows = vm.runInContext("finScheduleRows(4)", ctx);
  // miesiąc 0: tylko leasing (2500) — kredyt startuje w miesiącu 1
  assert.equal(Math.round(rows[0].total), 2500);
  // miesiąc 1: leasing 2500 + kredyt: 1 200 000/120 = 10 000 kapitału + 1 200 000*6%/12 = 6 000 odsetek
  assert.equal(Math.round(rows[1].total), 2500 + 16000);
  assert.equal(Math.round(rows[1].interest), 6000);
  assert.ok(rows[2].total < rows[1].total, "rata malejąca");
  assert.ok(rows[2].balance < rows[1].balance, "saldo maleje");
  const comp = vm.runInContext("finComputedNextInstallment(STATE.financings[0])", ctx);
  assert.equal(Math.round(comp), 16000);
  assert.equal(vm.runInContext("finComputedNextInstallment(STATE.financings[1])", ctx), null, "bez oprocentowania — brak raty wyliczonej");
});

test("braki w kartach finansowań: rata wpisana 15 000 vs wyliczona 16 000 = -6% -> uwaga; leasing bez oprocentowania", () => {
  const ctx = loadFront(baseState());
  const gaps = vm.runInContext("finDataGaps()", ctx);
  const bank = gaps.find((g: any) => g.f.id === "f1");
  assert.ok(bank && bank.miss.some((m: string) => m.startsWith("rata wpisana")));
  const leas = gaps.find((g: any) => g.f.id === "f2");
  assert.ok(leas && leas.miss.includes("oprocentowanie"));
});

test("płatności: koszt kwartalny tylko w miesiącach cyklu, zaległa faktura jednorazowa, rejestr 'zapłacone' usuwa z listy", () => {
  const st = baseState();
  const ctx = loadFront(st);
  const items = vm.runInContext(`paymentItems('${addMonths(0)}','${addMonths(2, 28)}')`, ctx);
  const biuro = items.filter((i: any) => i.key === "cost:c1");
  assert.equal(biuro.length, 3, "miesięczny: 3 miesiące");
  const opex = items.filter((i: any) => i.key === "cost:c2");
  assert.equal(opex.length, 1, "kwartalny: raz na 3 miesiące (start 3 mies. temu -> teraz)");
  assert.equal(opex[0].ym, ym(0));
  assert.ok(!items.some((i: any) => i.key === "cost:c4"), "anulowany nie wchodzi");
  const overdue = vm.runInContext("overduePayments()", ctx);
  assert.ok(overdue.some((i: any) => i.key === "once:c3"), "jednorazowa po terminie = zaległa");
  assert.ok(!overdue.some((i: any) => i.recurring), "cykliczne przed startem rejestru nie są zaległe");
  // oznaczenie zapłaconego miesiąca
  st.paymentLedger = { _start: addMonths(-1), ["cost:c1"]: { [ym(0)]: { paidAt: addDays(0), amount: 3000 } } };
  const ctx2 = loadFront(st);
  const items2 = vm.runInContext(`paymentItems('${addMonths(0)}','${addMonths(0, 28)}')`, ctx2);
  const b2 = items2.find((i: any) => i.key === "cost:c1");
  assert.equal(b2.paid, true);
  const up = vm.runInContext("upcomingPayments(60)", ctx2);
  assert.ok(!up.some((i: any) => i.key === "cost:c1" && i.ym === ym(0)), "zapłacony miesiąc nie jest 'do zapłaty'");
});

test("rejestr terminów: po terminie / w 7 dni / zrobione; terminy automatyczne z kart", () => {
  const ctx = loadFront(baseState());
  const dl = vm.runInContext("upcomingDeadlines(7)", ctx);
  assert.equal(JSON.stringify(dl.map((d: any) => d.id)), JSON.stringify(["d1", "d2"]));
  assert.ok(dl[0].days < 0 && dl[1].days > 0);
  const auto = vm.runInContext("autoDeadlines(180)", ctx);
  assert.ok(auto.some((a: any) => /uruchomienie — F9 Chludowo/.test(a.title)));
  assert.ok(auto.some((a: any) => /pierwsza rata — Bank A/.test(a.title)));
});

test("kompletność danych: liczy braki i wskazuje rekord do uzupełnienia; sprzedane i DEMO pominięte", () => {
  const ctx = loadFront(baseState());
  const mods = vm.runInContext("completenessModules()", ctx);
  const proj = mods.find((m: any) => m.tab === "projects");
  assert.equal(proj.count, 2, "sprzedany i demo nie liczą się");
  const f9 = proj.gaps.find((g: any) => g.id === "p2");
  assert.ok(f9 && f9.missing.includes("lokalizacja") && f9.missing.includes("spółka celowa (Struktura grupy)"));
  assert.equal(f9.entity, "projects");
  const fin = mods.find((m: any) => m.tab === "maciej");
  assert.ok(fin.gaps.find((g: any) => g.id === "f2").missing.includes("oprocentowanie"));
  const overall = vm.runInContext("completenessOverall(completenessModules())", ctx);
  assert.ok(overall > 0 && overall < 100);
});

test("alerty Dashboardu: zaległa płatność, termin po czasie, termin w 7 dni, zadanie Macieja", () => {
  const ctx = loadFront(baseState());
  const items = vm.runInContext("attentionItems()", ctx);
  const texts = items.map((i: any) => i.text).join(" | ");
  assert.match(texts, /zaległych płatności/);
  assert.match(texts, /terminów po czasie/);
  assert.match(texts, /terminów w 7 dni/);
  assert.match(texts, /zadań Macieja/);
  assert.ok(items.every((i: any) => ["payments", "deadlines", "maciej", "consistency", "portfolio"].includes(i.tab)));
});

test("analiza wrażliwości: cena -20% obniża przychód i DSCR tylko w Portfelu, metrics() bez zmian", () => {
  const ctx = loadFront(baseState());
  const base = vm.runInContext("farmRows(true).find(function(r){return r.p.id==='p1';})", ctx);
  vm.runInContext("PF_SENS={price:-20,yield:0,capex:10}", ctx);
  const sens = vm.runInContext("farmRows(true).find(function(r){return r.p.id==='p1';})", ctx);
  assert.equal(Math.round(sens.rev), Math.round(base.rev * 0.8));
  assert.equal(Math.round(sens.capex), Math.round(base.capex * 1.1));
  const plain = vm.runInContext("farmRows().find(function(r){return r.p.id==='p1';})", ctx);
  assert.equal(Math.round(plain.rev), Math.round(base.rev), "bez flagi wrażliwość nie działa");
  assert.equal(vm.runInContext("metrics().monthlyRevenue", ctx), 60000);
});

test("propozycje przypisania farm do spółek po nazwie: F9 -> f9, Miejsce Piastowe -> mp", () => {
  const ctx = loadFront(baseState());
  const s = vm.runInContext("suggestSpvMapping()", ctx);
  const map: Record<string, string> = {};
  s.forEach((x: any) => { map[x.project.id] = x.entity.id; });
  assert.equal(map.p2, "f9");
  assert.equal(map.p1, "mp");
  assert.equal(map.p3, undefined, "sprzedana farma pominięta");
});

test("metrics(): DEMO i anulowane nie wchodzą; koszt dziś = pracownik + biuro + OPEX/3 + leasing (kredyt jeszcze nie ruszył)", () => {
  const ctx = loadFront(baseState());
  const m = vm.runInContext("metrics()", ctx);
  assert.equal(m.monthlyRevenue, 60000);
  assert.equal(Math.round(m.totalBurn), Math.round(10000 + 3000 + 1200 / 3 + 2500));
});

test("widoczność modułów: allowedTabs ogranicza zakładki (Dashboard i Pomoc zawsze), null = wszystkie", () => {
  const st = baseState(); st.allowedTabs = ["maciej", "payments"];
  const ctx = loadFront(st);
  assert.equal(vm.runInContext("tabAllowed('maciej')", ctx), true);
  assert.equal(vm.runInContext("tabAllowed('costs')", ctx), false);
  assert.equal(vm.runInContext("tabAllowed('dashboard')", ctx), true);
  assert.equal(vm.runInContext("tabAllowed('help')", ctx), true);
  assert.equal(vm.runInContext("tabAllowed('detail:projects:p1')", ctx), false);
  const st2 = baseState(); st2.allowedTabs = null;
  assert.equal(vm.runInContext("tabAllowed('costs')", loadFront(st2)), true);
});

test("scenariusze Symulatora: oszczędność liczona z pozycji aktywnych dziś (kredyt przed pierwszą ratą nie liczy się)", () => {
  const ctx = loadFront(baseState());
  const m = vm.runInContext("scenarioMetrics({costIds:['c1','c4'], employeeIds:['e1'], financingIds:['f1','f2'], contractIds:[]})", ctx);
  assert.equal(Math.round(m.costs), 3000, "anulowany c4 nie liczy się");
  assert.equal(Math.round(m.empCost), 10000);
  assert.equal(Math.round(m.fins), 2500, "f1 rusza za miesiąc — nie liczy się, f2 tak");
  assert.equal(Math.round(m.total), 15500);
});
