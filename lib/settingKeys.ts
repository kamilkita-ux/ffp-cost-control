// JEDNO miejsce z listą kluczy ustawień (AppSetting) — używane przez
// /api/settings (co wolno zapisać), /api/bootstrap (co wysłać), lib/snapshot
// (co trafia do kopii) i lib/restoreData (co przywrócić). Dodanie nowego
// klucza TU automatycznie obejmuje kopie zapasowe i przywracanie
// (audyt 2026-09-19, pkt 25: wcześniej trzeba było pamiętać o 4 miejscach).

// Klucze o wartości-obiekcie (JSON) — przywracane w pętli.
export const OBJECT_SETTING_KEYS = [
  "assumptions",          // Założenia finansowe (moduł Założenia)
  "fixedCostSchedule",    // harmonogram kosztów stałych (kontroler)
  "shareholderStructure", // Akcjonariat
  "groupStructure",       // Struktura grupy (drzewo spółek)
  "financeWorkspace",     // przestrzeń Macieja Zaparta: notatki, zadania, ustalenia finansowania
  "deadlines",            // rejestr terminów (pozwolenia, umowy przyłączeniowe, PPA, decyzje)
  "farmActuals",          // produkcja/przychód rzeczywisty per farma i miesiąc (vs model)
  "paymentLedger",        // rejestr opłaconych miesięcy kosztów cyklicznych i rat ("cost:<id>"/"fin:<id>" -> {RRRR-MM: {...}})
  "scenarios",            // scenariusze Symulatora oszczędności (lista zestawów id pozycji do redukcji)
  "moduleVisibility"      // {login: [klucze zakładek]} — które moduły widzi dana osoba (admin)
] as const;

// Klucze proste (lista nazw / waluta).
export const SIMPLE_SETTING_KEYS = ["currency", "costCategories", "costCenters"] as const;

export const ALL_SETTING_KEYS = [...SIMPLE_SETTING_KEYS, ...OBJECT_SETTING_KEYS] as const;

// Klucze finansowe/wrażliwe — konto ograniczone (bez wglądu w wynagrodzenia)
// nie może ich zapisywać (SETTINGS_PERMISSION_MATRIX, zatwierdzone 2026-09-08;
// groupStructure dodane w audycie 2026-09-19). financeWorkspace / deadlines /
// farmActuals CELOWO dozwolone — to narzędzia pracy Macieja (finansowanie)
// i osób prowadzących farmy, bez danych o wynagrodzeniach.
export const RESTRICTED_FORBIDDEN_SETTING_KEYS = ["assumptions", "fixedCostSchedule", "shareholderStructure", "groupStructure", "moduleVisibility"] as const;

export type SettingKey = (typeof ALL_SETTING_KEYS)[number];
