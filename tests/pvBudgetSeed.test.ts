// Test regresyjny na dane modelu budżetowego "Budżet Farm PV" (Grzegorz)
// — patrz lib/pvBudgetSeed.ts i app/api/admin/import-pv-budget/route.ts.
// Pilnuje spójności danych WEJŚCIOWYCH do importu (bez bazy): unikalne
// etykiety, że matchExistingProjectName wskazuje na realną nazwę farmy z
// portfela CF Farmy.xlsx (literówka oznaczałaby CICHE utworzenie nowego,
// zduplikowanego projektu zamiast dopisania do istniejącego — route.ts nie
// ma jak tego wykryć bez dodatkowej weryfikacji), dodatnią moc, oraz że
// rozbity CAPEX (pvCapex + storageCapex) sumuje się do totalCapex.
import test from "node:test";
import assert from "node:assert/strict";
import { PV_BUDGET_ENTRIES } from "../lib/pvBudgetSeed";
import { CF_PORTFOLIO_PROJECTS } from "../lib/cfPortfolioSeed";

test("każda pozycja modelu budżetowego ma unikalną etykietę", () => {
  const labels = PV_BUDGET_ENTRIES.map((e) => e.label);
  assert.equal(new Set(labels).size, labels.length, "etykiety (label) muszą być unikalne");
});

test("matchExistingProjectName wskazuje na realną farmę z portfela CF Farmy.xlsx (lub jest null = nowy projekt)", () => {
  const cfNames = new Set(CF_PORTFOLIO_PROJECTS.map((p) => p.name));
  for (const e of PV_BUDGET_ENTRIES) {
    if (e.matchExistingProjectName !== null) {
      assert.ok(
        cfNames.has(e.matchExistingProjectName),
        `"${e.label}": matchExistingProjectName "${e.matchExistingProjectName}" nie odpowiada żadnej farmie w portfelu CF Farmy.xlsx`
      );
    }
  }
});

test("moc (mwPower) każdej pozycji jest dodatnia", () => {
  for (const e of PV_BUDGET_ENTRIES) {
    assert.ok(e.mwPower > 0, `${e.label}: mwPower musi być > 0`);
  }
});

test("pvCapex + storageCapex = totalCapex dla każdej pozycji", () => {
  for (const e of PV_BUDGET_ENTRIES) {
    assert.equal(
      e.pvCapex + e.storageCapex,
      e.totalCapex,
      `${e.label}: pvCapex (${e.pvCapex}) + storageCapex (${e.storageCapex}) powinno równać się totalCapex (${e.totalCapex})`
    );
  }
});

test("Poręba 6.5 MW: CAPEX po korekcie /1000 mieści się w sensownym zakresie zł/MW (nie ma już dodatkowych zer)", () => {
  const poreba = PV_BUDGET_ENTRIES.find((e) => e.label === "Poręba 6.5 MW");
  assert.ok(poreba, "brak pozycji Poręba 6.5 MW");
  const perMw = poreba!.pvCapex / poreba!.mwPower;
  assert.ok(perMw > 500000 && perMw < 5000000, `Poręba: CAPEX/MW (${perMw}) poza sensownym zakresem — sprawdź korektę /1000`);
});

test("financingStorage jest ustawione tylko gdy storageCapex > 0", () => {
  for (const e of PV_BUDGET_ENTRIES) {
    if (e.storageCapex > 0) {
      assert.ok(e.financingStorage !== null, `${e.label}: storageCapex > 0, ale brak financingStorage`);
    } else {
      assert.equal(e.financingStorage, null, `${e.label}: storageCapex = 0, ale financingStorage jest ustawione`);
    }
  }
});

test("model budżetowy obejmuje wszystkie 7 pozycji z eksportu Grzegorza (po rozstrzygnięciu duplikatów)", () => {
  const expected = [
    "Dębowiec 1 MW", "Lubelskie 4x1 MW", "Łubno 1MW", "Miejsce Piastowe 2MW",
    "Opole 5x1 MW", "Poręba 6.5 MW", "Wylewa 15 MW"
  ];
  const labels = PV_BUDGET_ENTRIES.map((e) => e.label);
  for (const l of expected) {
    assert.ok(labels.includes(l), `Brakuje pozycji "${l}" w modelu budżetowym`);
  }
  assert.equal(labels.length, expected.length, "liczba pozycji w modelu budżetowym powinna wynosić dokładnie 7");
});
