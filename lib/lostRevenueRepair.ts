// Przywrócenie danych utraconych 2026-09-17 przy pierwszym uruchomieniu
// "Scal duplikaty farm" (patrz komentarz w
// app/api/admin/merge-duplicate-projects/route.ts): stare rekordy bez kodu
// zostały usunięte bez przeniesienia pola "Przychód / mies." (revenueMonthly)
// i lokalizacji na rekord zachowywany.
//
// Wartości pochodzą ze zrzutu ekranu listy Projektów z 2026-09-17 SPRZED
// scalenia (przesłany przez Kamila) — dokładnie te liczby stały w starych,
// usuniętych rekordach. Endpoint /api/admin/repair-lost-revenue wpisuje je
// TYLKO tam, gdzie pole jest puste/0 — nigdy nie nadpisuje wpisanej ręcznie
// wartości, więc jest bezpieczny także wtedy, gdy Kamil część już poprawił
// ręcznie albo gdy poprawione scalanie przeniosło wartość samo.
export type LostRevenueRepair = {
  name: string; // dokładna nazwa zachowanego rekordu (z kodem PV-xxx)
  revenueMonthly: number; // zł / mies.
  location?: string;
};

export const LOST_REVENUE_REPAIRS: LostRevenueRepair[] = [
  { name: "Miejsce Piastowe", revenueMonthly: 56600, location: "Miejsce Piastowe" },
  { name: "Wylewa", revenueMonthly: 424500 },
  { name: "Poręba", revenueMonthly: 183950 },
  { name: "F8 Wysoka Strzyżowska", revenueMonthly: 28333 },
  { name: "F9 Chludowo", revenueMonthly: 56667 },
];
