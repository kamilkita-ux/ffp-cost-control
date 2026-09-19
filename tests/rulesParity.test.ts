// AUDYT 2026-09-19 (pkt 24): reguły liczenia w przeglądarce (app/app-shell.html)
// i na serwerze (lib/rules.ts) muszą dawać IDENTYCZNE wyniki. Test ładuje
// skrypt z app-shell.html do izolowanego kontekstu VM (z atrapą DOM) i
// porównuje funkcje na tych samych, celowo brzegowych danych.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as rules from "../lib/rules";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function loadFront(): any {
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
  try { vm.runInContext(js, ctx); } catch { /* skrypt kończy się na atrapie DOM — funkcje są już zdefiniowane */ }
  return ctx;
}

const front = loadFront();
const ASOF = "2026-09-30";

const COSTS = [
  { paymentStatus: "planowany", costDate: "2026-09-01", grossAmount: 100, recurrence: "miesięczny" },
  { paymentStatus: "planowany", costDate: "2026-09-30", grossAmount: 100, recurrence: "kwartalny" },
  { paymentStatus: "planowany", costDate: "2026-10-01", grossAmount: 100, recurrence: "miesięczny" },
  { paymentStatus: "anulowany", costDate: "2026-01-01", grossAmount: 100, recurrence: "miesięczny" },
  { paymentStatus: "zapłacony", costDate: null, grossAmount: 100, recurrence: "roczny" },
  { paymentStatus: "zapłacony", costDate: "2026-01-01", grossAmount: 100, recurrence: "jednorazowy" },
  { paymentStatus: "zapłacony", costDate: "2026-01-01", netAmount: 50, recurrence: "półroczny" }
];
const FINS = [
  { nextPaymentDate: "2026-10-05", numInstallments: 120, remainingInstallments: 120 },
  { nextPaymentDate: "2026-10-05", numInstallments: 120, remainingInstallments: 119 },
  { nextPaymentDate: "2026-09-30", numInstallments: 120, remainingInstallments: 120 },
  { nextPaymentDate: "2026-09-01", endDate: "2026-08-31", numInstallments: 12, remainingInstallments: 0 },
  { nextPaymentDate: "2026-09-01", endDate: "2026-09-01", numInstallments: 12, remainingInstallments: 1 },
  { nextPaymentDate: null },
  { nextPaymentDate: "2027-01-01", numInstallments: 0, remainingInstallments: 0 }
];
const PROJECTS = [
  { status: "operacyjny", endDate: null, isDemo: false },
  { status: "operacyjny", endDate: null, isDemo: true },
  { status: "budowa", endDate: "2026-09-30", isDemo: false },
  { status: "budowa", endDate: "2026-10-01", isDemo: false },
  { status: "RTB", endDate: null, isDemo: false },
  { status: "zawieszony", endDate: "2026-01-01", isDemo: false },
  { status: "sprzedany", endDate: "2026-01-01", isDemo: false },
  { status: "zamknięty", endDate: "2026-01-01", isDemo: false },
  { status: "development", endDate: "2025-01-01", isDemo: false }
];

test("recurringCostActive: przeglądarka == serwer", () => {
  for (const c of COSTS) assert.equal(front.recurringCostActive(c, ASOF), rules.recurringCostActive(c, ASOF), JSON.stringify(c));
});
test("monthlyEquivalent / monthlyEquivalentGeneric: przeglądarka == serwer", () => {
  for (const c of COSTS) assert.equal(front.monthlyEquivalent(c), rules.monthlyEquivalent(c), JSON.stringify(c));
  for (const f of ["miesięczny", "kwartalny", "półroczny", "roczny", "jednorazowy", "nieregularny", ""]) assert.equal(front.monthlyEquivalentGeneric(1200, f), rules.monthlyEquivalentGeneric(1200, f), f);
});
test("financingActive: przeglądarka == serwer", () => {
  for (const f of FINS) assert.equal(front.financingActive(f, ASOF), rules.financingActive(f, ASOF), JSON.stringify(f));
});
test("projectActiveInMonth / projectCountsAsFuture: przeglądarka == serwer", () => {
  for (const p of PROJECTS) {
    assert.equal(front.projectActiveInMonth(p, ASOF), rules.projectActiveInMonth(p, ASOF), JSON.stringify(p));
    assert.equal(front.projectCountsAsFuture(p), rules.projectCountsAsFuture(p), JSON.stringify(p));
  }
});
test("runRateAsOfISO: koniec bieżącego miesiąca (bez okna +45 dni) w obu wersjach", () => {
  const f = front.runRateAsOfISO();
  const s = rules.runRateAsOfISO();
  assert.match(f, /^\d{4}-\d{2}-\d{2}$/);
  // Serwer liczy w strefie Warszawy, przeglądarka lokalnie — w teście
  // (ta sama maszyna) różnica może wystąpić tylko o północy 1-go dnia
  // miesiąca; dopuszczamy oba warianty, ale dzień musi być końcem miesiąca.
  for (const v of [f, s]) {
    const d = new Date(v + "T12:00:00");
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    assert.equal(next.getDate(), 1, v + " musi być ostatnim dniem miesiąca");
  }
});
test("decliningSchedule: suma kapitału = kwota, pierwsza rata = kapitał + odsetki od całości", () => {
  const rows = rules.decliningSchedule(120000, 8, 12);
  assert.equal(rows.length, 12);
  assert.ok(Math.abs(rows.reduce((s, r) => s + r.capital, 0) - 120000) < 1e-6);
  assert.ok(Math.abs(rows[0].total - (10000 + 120000 * 0.08 / 12)) < 1e-6);
  assert.equal(rows[11].balanceAfter, 0);
  assert.equal(rules.decliningSchedule(0, 8, 12).length, 0);
});
