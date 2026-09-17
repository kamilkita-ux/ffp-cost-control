// Test regresyjny na listę przywracanych przychodów — patrz
// lib/lostRevenueRepair.ts. Nazwy muszą odpowiadać realnym farmom z portfela
// (te z kodem PV-xxx), inaczej endpoint niczego nie uzupełni.
import test from "node:test";
import assert from "node:assert/strict";
import { LOST_REVENUE_REPAIRS } from "../lib/lostRevenueRepair";
import { CF_PORTFOLIO_PROJECTS } from "../lib/cfPortfolioSeed";

test("każda pozycja wskazuje na realną farmę z portfela CF Farmy.xlsx", () => {
  const cfNames = new Set(CF_PORTFOLIO_PROJECTS.map((p) => p.name));
  for (const r of LOST_REVENUE_REPAIRS) {
    assert.ok(cfNames.has(r.name), `"${r.name}" nie odpowiada żadnej farmie w portfelu`);
  }
});

test("przychody są dodatnie i nazwy unikalne", () => {
  const names = LOST_REVENUE_REPAIRS.map((r) => r.name);
  assert.equal(new Set(names).size, names.length);
  for (const r of LOST_REVENUE_REPAIRS) assert.ok(r.revenueMonthly > 0, `${r.name}: przychód musi być > 0`);
});
