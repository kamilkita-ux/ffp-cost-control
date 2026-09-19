// Test regresyjny na klasę błędu znalezioną 2026-09-08: destrukcyjne/admińskie
// endpointy (kasowanie i podmiana CAŁEJ bazy, pobieranie nieredagowanych
// backupów z surowymi wynagrodzeniami) nie miały ŻADNEGO sprawdzenia
// uprawnień (isAdminCaller), mimo że analogiczny /api/admin/users to
// sprawdzenie ma od dawna.
//
// Prawdziwy test integracyjny (żądanie HTTP -> sprawdzenie 403) wymagałby
// żywej bazy Postgres (getVerifiedSession/isAdminCaller odpytują Prisma),
// której w tym środowisku testowym nie ma. Zamiast tego ten test pilnuje
// STATYCZNIE, żeby każdy z tych plików źródłowych faktycznie wywoływał
// isAdminCaller przed jakąkolwiek operacją na bazie — tak, żeby ktoś (albo
// AI) nie usunął tego guarda przypadkiem przy przyszłej edycji, bez testu,
// który by to złapał.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// Pliki, w których operacja jest tak destrukcyjna (pełna podmiana/odczyt
// całej bazy, w tym surowych wynagrodzeń), że MUSZĄ być zabezpieczone
// isAdminCaller — inaczej dowolne zalogowane konto (także "ograniczone")
// mogłoby skasować/nadpisać całą produkcyjną bazę albo pobrać surowe kwoty.
const MUST_GUARD_WITH_ADMIN = [
  "app/api/admin/backups/route.ts",
  "app/api/admin/backups/[id]/route.ts",
  "app/api/admin/backups/[id]/restore/route.ts",
  "app/api/restore/route.ts",
  "app/api/admin/users/route.ts",
  "app/api/admin/users/[id]/route.ts",
  "app/api/admin/import-cf-portfolio/route.ts",
  "app/api/admin/import-pv-budget/route.ts",
  "app/api/admin/merge-duplicate-projects/route.ts",
  "app/api/admin/repair-lost-revenue/route.ts",
  "app/api/admin/reset-farm-portfolio/route.ts",
  "app/api/admin/apply-data-adjustments/route.ts",
  // AUDYT 2026-09-19: kasowanie danych demo też musi być admin-only.
  "app/api/demo/route.ts"
];

for (const relPath of MUST_GUARD_WITH_ADMIN) {
  test(`auth guard obecny: ${relPath} importuje i wywołuje isAdminCaller`, () => {
    const src = readFileSync(join(ROOT, relPath), "utf-8");
    assert.match(
      src,
      /import\s*\{[^}]*isAdminCaller[^}]*\}\s*from\s*["']@\/lib\/access["']/,
      `${relPath} musi importować isAdminCaller z @/lib/access`
    );
    assert.match(
      src,
      /await isAdminCaller\(req\)/,
      `${relPath} musi realnie wywoływać isAdminCaller(req) (nie tylko importować)`
    );
  });
}

// Zatwierdzone przez Kamila 2026-09-08 (D-SETTINGS-PERMISSIONS,
// SETTINGS_PERMISSION_MATRIX z raportu nocnego): klucze finansowe/wrażliwe
// w /api/settings muszą być zablokowane dla konta ograniczonego.
test("PUT /api/settings blokuje konto ograniczone dla kluczy finansowych/wrażliwych", () => {
  const src = readFileSync(join(ROOT, "app/api/settings/route.ts"), "utf-8");
  assert.match(
    src,
    /import\s*\{[^}]*isRestrictedUser[^}]*\}\s*from\s*["']@\/lib\/access["']/,
    "app/api/settings/route.ts musi importować isRestrictedUser z @/lib/access"
  );
  assert.match(
    src,
    /await isRestrictedUser\(req\)/,
    "app/api/settings/route.ts musi realnie wywoływać isRestrictedUser(req)"
  );
});

// AUDYT 2026-09-19: kopia zapasowa (snapshot), przywracanie i /api/settings
// muszą korzystać z JEDNEJ listy kluczy ustawień (lib/settingKeys.ts) —
// inaczej nowy klucz po cichu wypadałby z kopii/przywracania.
test("snapshot, restore i settings korzystają ze wspólnej listy kluczy ustawień", () => {
  const snap = readFileSync(join(ROOT, "lib/snapshot.ts"), "utf-8");
  const restoreData = readFileSync(join(ROOT, "lib/restoreData.ts"), "utf-8");
  const restoreRoute = readFileSync(join(ROOT, "app/api/restore/route.ts"), "utf-8");
  const settings = readFileSync(join(ROOT, "app/api/settings/route.ts"), "utf-8");
  assert.match(snap, /from ["']\.\/settingKeys["']/, "lib/snapshot.ts musi importować settingKeys");
  assert.match(snap, /OBJECT_SETTING_KEYS\.map/, "snapshot musi zapisywać wszystkie OBJECT_SETTING_KEYS");
  assert.match(restoreData, /for \(const k of OBJECT_SETTING_KEYS\)/, "restoreData musi przywracać wszystkie OBJECT_SETTING_KEYS");
  assert.match(restoreRoute, /restoreSnapshot\(prisma, data\)/, "/api/restore musi używać wspólnego restoreSnapshot (bez duplikatu logiki)");
  assert.doesNotMatch(restoreRoute, /\$transaction/, "/api/restore nie może mieć własnej kopii transakcji przywracania");
  assert.match(settings, /new Set<string>\(ALL_SETTING_KEYS\)/, "settings: ALLOWED_KEYS z ALL_SETTING_KEYS");
  assert.match(settings, /new Set<string>\(RESTRICTED_FORBIDDEN_SETTING_KEYS\)/, "settings: lista zakazanych z settingKeys");
});

test("klucze wrażliwe pozostają zablokowane dla konta ograniczonego", () => {
  const keys = readFileSync(join(ROOT, "lib/settingKeys.ts"), "utf-8");
  const m = keys.match(/RESTRICTED_FORBIDDEN_SETTING_KEYS = \[([^\]]*)\]/);
  assert.ok(m);
  const list = m![1].split(",").map((k) => k.trim().replace(/["']/g, "")).filter(Boolean);
  for (const k of ["assumptions", "fixedCostSchedule", "shareholderStructure", "groupStructure"]) assert.ok(list.includes(k), k);
});

// AUDYT 2026-09-19 (pkt 1): w trybie kont każdy endpoint danych sprawdza
// sesję w bazie (requireSession) — nie tylko podpis tokenu w middleware.
for (const relPath of [
  "app/api/costs/route.ts", "app/api/costs/[id]/route.ts",
  "app/api/projects/route.ts", "app/api/projects/[id]/route.ts",
  "app/api/employees/route.ts", "app/api/employees/[id]/route.ts",
  "app/api/contracts/route.ts", "app/api/contracts/[id]/route.ts",
  "app/api/financings/route.ts", "app/api/financings/[id]/route.ts",
  "app/api/vendors/route.ts", "app/api/vendors/[id]/route.ts",
  "app/api/departments/route.ts", "app/api/departments/[id]/route.ts",
  "app/api/documents/route.ts", "app/api/documents/[id]/route.ts",
  "app/api/changelog/route.ts", "app/api/bootstrap/route.ts", "app/api/settings/route.ts"
]) {
  test(`sesja sprawdzana w bazie: ${relPath}`, () => {
    const src = readFileSync(join(ROOT, relPath), "utf-8");
    const handlers = (src.match(/export async function (GET|POST|PUT|PATCH|DELETE)\(/g) || []).length;
    const checks = (src.match(/await requireSession\(req\)/g) || []).length;
    assert.ok(handlers > 0);
    assert.equal(checks, handlers, `${relPath}: każdy handler (${handlers}) musi wywołać requireSession (znaleziono ${checks})`);
  });
}

// AUDYT 2026-09-19: starsze importy (CF, model Grzegorza, scalanie, naprawa
// przychodów) po resecie portfela muszą być zablokowane (409), żeby nie
// nadpisały nowych danych.
for (const relPath of [
  "app/api/admin/import-cf-portfolio/route.ts",
  "app/api/admin/import-pv-budget/route.ts",
  "app/api/admin/merge-duplicate-projects/route.ts",
  "app/api/admin/repair-lost-revenue/route.ts"
]) {
  test(`blokada po resecie obecna: ${relPath}`, () => {
    const src = readFileSync(join(ROOT, relPath), "utf-8");
    assert.match(src, /await portfolioWasReset\(\)/, `${relPath} musi sprawdzać portfolioWasReset()`);
  });
}
