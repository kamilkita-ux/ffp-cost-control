// Czysta funkcja (bez dostępu do bazy) sprawdzająca, czy obiekt "wygląda"
// jak prawdziwy eksport całej bazy (dokładnie taki kształt, jaki ZAWSZE ma
// GET /api/bootstrap / przycisk "Pobierz kopię zapasową" — te pola są
// zawsze tablicami, nawet pustymi).
//
// Używana w dwóch miejscach (app/api/restore/route.ts i
// lib/restoreData.ts) jako ostatnia linia obrony przed operacją, która
// kasuje CAŁĄ bazę i nie wstawia nic z powrotem, gdy podany plik/snapshot
// jest pusty, ma literówkę w nazwie klucza, albo jest zupełnie innym
// obiektem JSON. Wyodrębniona do osobnego pliku, żeby dało się ją
// przetestować bez Postgresa i bez duplikowania logiki w dwóch miejscach.
export const EXPECTED_BACKUP_ARRAY_KEYS = [
  "departments", "projects", "vendors", "employees", "costs", "contracts", "financings", "documents"
] as const;

export function looksLikeRealBackup(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  return EXPECTED_BACKUP_ARRAY_KEYS.some((k) => Array.isArray((data as any)[k]));
}
