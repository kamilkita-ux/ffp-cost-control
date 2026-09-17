// Wzory modelu Grzegorza użyte przy resecie portfela (lib/pvBudgetSeed.ts):
// przychód = moc × uzysk × (cena + GO) / 12; BESS = moc × przepustowość × cena / 12;
// pierwsza rata malejąca = kapitał/n + kapitał × r/12. Test pilnuje, żeby
// zmiana wzoru była świadoma (liczby zgodne z narzędziem Grzegorza).
import test from "node:test";
import assert from "node:assert/strict";
import { PV_BUDGET_ENTRIES, pvMonthlyRevenue, storageMonthlyRevenue, monthlyOpexFor, decliningFirstInstallment, defaultMonthlyRevenue } from "../lib/pvBudgetSeed";

test("Dębowiec 1 MW: przychód mies. = 1 × 1050 × 352.5 / 12 = 30 844", () => {
  const e = PV_BUDGET_ENTRIES.find((x) => x.name === "Dębowiec")!;
  assert.equal(pvMonthlyRevenue(e), 30844);
  assert.equal(storageMonthlyRevenue(e), 0);
});

test("Miejsce Piastowe: BESS 2 MW × 1500 MWh/MW × 400 zł / 12 = 100 000", () => {
  const e = PV_BUDGET_ENTRIES.find((x) => x.name === "Miejsce Piastowe")!;
  assert.ok(e.storage);
  assert.equal(storageMonthlyRevenue(e), 100000);
});

test("rata malejąca: 1 000 000 zł, 6%, 10 lat → 8 333 + 5 000 = 13 333", () => {
  assert.equal(decliningFirstInstallment(1000000, 6, 10), 13333);
  assert.equal(decliningFirstInstallment(1000000, 0, 10), 8333);
});

test("OPEX Dębowiec (PV): dzierżawa 19000/12, O&M 5000, podatki (10000 + 2%×600000)/12, ubezp. (3750+2500)/12", () => {
  const e = PV_BUDGET_ENTRIES.find((x) => x.name === "Dębowiec")!;
  const o = monthlyOpexFor(e.pv.opex, e.mwPower);
  assert.equal(o.lease, 1583);
  assert.equal(o.service, 5000);
  assert.equal(o.taxes, 1833);
  assert.equal(o.insurance, 521);
});

test("każda pozycja ma kod, nazwę bez sufiksu MW i dodatni CAPEX; BESS ma finansowanie", () => {
  for (const e of PV_BUDGET_ENTRIES) {
    assert.match(e.code, /^PV-/);
    assert.ok(e.totalCapex > 0);
    assert.equal(e.pvCapex + e.storageCapex, e.totalCapex);
    if (e.storage) assert.ok(e.financingStorage, `${e.name}: BESS bez finansowania`);
  }
});

test("przychód domyślny dla farm spoza modelu: 3 MW → 92 531", () => {
  assert.equal(defaultMonthlyRevenue(3), 92531);
});
