// Jednorazowa lista scaleń duplikatów projektów — powstałych, bo import
// portfela z arkusza kontrolera (import-cf-portfolio) dopasowuje po
// DOKŁADNEJ nazwie, a starsze rekordy w bazie miały inną pisownię (mała
// litera, brak prefiksu F8/F9) niż nazwy w arkuszu. Efekt: zamiast
// zaktualizować istniejący projekt, powstał nowy — ta sama farma widniała
// dwa razy na liście Projektów (i była podwójnie liczona w sumach).
//
// Rozstrzygnięcia zatwierdzone przez Kamila 2026-09-17:
// - w każdej parze zachowujemy wersję Z KODEM (nowszą, z importu CF Farmy.xlsx
//   — ma poprawną moc, status, harmonogram), usuwamy starszą bez kodu.
// - "Wysoka Strzyżowska"/"Chludowo" i "F8 Wysoka Strzyżowska"/"F9 Chludowo"
//   potwierdzone jako te same farmy — scalamy tak samo.
export type DuplicateMergePair = {
  oldName: string; // usuwany rekord (bez kodu, starszy)
  keepName: string; // zachowywany rekord (z kodem, z importu CF Farmy.xlsx)
};

export const DUPLICATE_PROJECT_MERGES: DuplicateMergePair[] = [
  { oldName: "Miejsce piastowe", keepName: "Miejsce Piastowe" },
  { oldName: "wylewa", keepName: "Wylewa" },
  { oldName: "poręba", keepName: "Poręba" },
  { oldName: "Wysoka Strzyżowska", keepName: "F8 Wysoka Strzyżowska" },
  { oldName: "Chludowo", keepName: "F9 Chludowo" },
];
