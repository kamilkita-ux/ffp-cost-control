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
  for (const key of ["assumptions", "fixedCostSchedule", "shareholderStructure", "groupStructure"]) {
    assert.match(
      src,
      new RegExp(`["']${key}["']`),
      `RESTRICTED_FORBIDDEN_KEYS musi obejmować "${key}"`
    );
  }
});

// AUDYT 2026-09-19: kopia zapasowa (snapshot) musi zawierać KAŻDY klucz
// ustawień, który przywraca /api/restore — inaczej przywrócenie backupu
// po cichu gubiłoby Założenia / harmonogram / strukturę grupy.
test("snapshot obejmuje wszystkie klucze ustawień, które przywraca restore", () => {
  const snap = readFileSync(join(ROOT, "lib/snapshot.ts"), "utf-8");
  const restore = readFileSync(join(ROOT, "app/api/restore/route.ts"), "utf-8");
  const m = restore.match(/for \(const k of \[([^\]]*)\]\)/);
  assert.ok(m, "restore musi iterować po liście kluczy ustawień");
  const keys = m![1].split(",").map((k) => k.trim().replace(/["']/g, "")).filter(Boolean);
  assert.ok(keys.length >= 4);
  const snapKeysM = snap.match(/SNAPSHOT_SETTING_KEYS = \[([^\]]*)\]/);
  assert.ok(snapKeysM, "lib/snapshot.ts musi eksportować SNAPSHOT_SETTING_KEYS");
  const snapKeys = snapKeysM![1].split(",").map((k) => k.trim().replace(/["']/g, "")).filter(Boolean);
  for (const k of keys) assert.ok(snapKeys.includes(k), `snapshot musi zawierać klucz ustawień "${k}"`);
});

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
