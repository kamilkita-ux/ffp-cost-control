// Test regresyjny na listę scaleń duplikatów farm — patrz
// lib/duplicateProjectMerges.ts i app/api/admin/merge-duplicate-projects/route.ts.
// Pilnuje, żeby "keepName" w każdej parze odpowiadał realnej, aktualnej nazwie
// farmy z portfela CF Farmy.xlsx (ta z kodem PV-xxx) — literówka oznaczałaby,
// że scalenie nie znajdzie celu i nic się nie scali (route.ts robi wtedy
// "skip", ale błąd i tak lepiej wyłapać tutaj, nie dopiero na produkcji).
import test from "node:test";
import assert from "node:assert/strict";
import { DUPLICATE_PROJECT_MERGES } from "../lib/duplicateProjectMerges";
import { CF_PORTFOLIO_PROJECTS } from "../lib/cfPortfolioSeed";

test("keepName każdej pary wskazuje na realną farmę z portfela CF Farmy.xlsx", () => {
  const cfNames = new Set(CF_PORTFOLIO_PROJECTS.map((p) => p.name));
  for (const pair of DUPLICATE_PROJECT_MERGES) {
    assert.ok(
      cfNames.has(pair.keepName),
      `keepName "${pair.keepName}" nie odpowiada żadnej farmie w portfelu CF Farmy.xlsx`
    );
  }
});

test("oldName i keepName różnią się (nie ma par scalających samo ze sobą)", () => {
  for (const pair of DUPLICATE_PROJECT_MERGES) {
    assert.notEqual(pair.oldName, pair.keepName, `para "${pair.oldName}" ma identyczne oldName i keepName`);
  }
});

test("brak zduplikowanych par (ta sama para oldName->keepName nie występuje dwa razy)", () => {
  const keys = DUPLICATE_PROJECT_MERGES.map((p) => `${p.oldName}=>${p.keepName}`);
  assert.equal(new Set(keys).size, keys.length, "znaleziono zduplikowaną parę scalenia");
});
