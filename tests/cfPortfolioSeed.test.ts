// Test regresyjny na dane portfela farm z arkusza kontrolera (CF Farmy.xlsx)
// — patrz lib/cfPortfolioSeed.ts i app/api/admin/import-cf-portfolio/route.ts.
// Pilnuje spójności danych WEJŚCIOWYCH do importu (bez bazy): unikalne nazwy
// i kody projektów, oraz że każde Financing wskazuje na istniejący projekt —
// literówka w projectName oznaczałaby CICHE pominięcie finansowania (route.ts
// robi `continue` gdy nie znajdzie projektu po nazwie), więc błąd tutaj
// musi się wyłapać w teście, nie dopiero po imporcie na produkcji.
import test from "node:test";
import assert from "node:assert/strict";
import { CF_PORTFOLIO_PROJECTS, CF_PORTFOLIO_FINANCINGS } from "../lib/cfPortfolioSeed";

test("każdy projekt portfela ma unikalną nazwę i kod", () => {
  const names = CF_PORTFOLIO_PROJECTS.map((p) => p.name);
  const codes = CF_PORTFOLIO_PROJECTS.map((p) => p.code);
  assert.equal(new Set(names).size, names.length, "nazwy projektów muszą być unikalne");
  assert.equal(new Set(codes).size, codes.length, "kody projektów muszą być unikalne");
});

test("każde finansowanie wskazuje na istniejący w portfelu projekt", () => {
  const names = new Set(CF_PORTFOLIO_PROJECTS.map((p) => p.name));
  for (const f of CF_PORTFOLIO_FINANCINGS) {
    assert.ok(names.has(f.projectName), `Financing "${f.lender}" wskazuje na nieistniejący projekt "${f.projectName}"`);
  }
});

test("moc (mwPower) każdego projektu jest dodatnia", () => {
  for (const p of CF_PORTFOLIO_PROJECTS) {
    assert.ok(p.mwPower > 0, `${p.name}: mwPower musi być > 0`);
  }
});

test("portfel obejmuje wszystkie 11 farm z arkusza kontrolera", () => {
  const expected = [
    "Miejsce Piastowe", "Dębowiec", "Łubno", "Skrzypaczowice",
    "F8 Wysoka Strzyżowska", "F9 Chludowo", "Ziempniów", "Wylewa", "Poręba",
    "Kamyk", "Pieczyska"
  ];
  const names = CF_PORTFOLIO_PROJECTS.map((p) => p.name);
  for (const n of expected) {
    assert.ok(names.includes(n), `Brakuje projektu "${n}" w portfelu`);
  }
  assert.equal(names.length, expected.length, "liczba projektów w portfelu powinna wynosić dokładnie 11");
});
