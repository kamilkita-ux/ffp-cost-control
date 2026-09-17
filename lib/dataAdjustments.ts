// Lista POPRAWEK DANYCH do zastosowania na żywej bazie jednym przyciskiem
// (Ustawienia -> "Zastosuj poprawki danych"). To jest umówiony z Kamilem
// (2026-09-18) sposób "uzupełniania": Kamil podaje informację, ja dopisuję
// tu wpis, on klika raz. Endpoint: app/api/admin/apply-data-adjustments.
//
// Zasady:
// - każda poprawka ma unikalne id (data-temat) i notatkę skąd pochodzi;
// - idempotentne: ponowne kliknięcie ustawia te same wartości (UWAGA: jeśli
//   Kamil po zastosowaniu zmieni to pole ręcznie, kolejne kliknięcie
//   przywróci wartość z listy — wtedy trzeba usunąć/zmienić wpis tutaj);
// - poprawki dotyczą tylko pól wymienionych w "set"; reszta rekordu nie
//   jest ruszana.
export type ProjectAdjustment = {
  id: string;
  kind: "project";
  projectName: string; // dokładna nazwa (Project.name)
  set: Partial<{
    revenueMonthly: number;
    location: string;
    mwPower: number;
    status: "DEVELOPMENT" | "POZWOLENIA" | "RTB" | "BUDOWA" | "OPERACYJNY" | "ZAWIESZONY" | "SPRZEDANY" | "ZAMKNIETY";
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD = data uruchomienia (od niej liczony przychód)
    capex: number;
    budgetTotal: number;
    gridOperator: string;
    energyBuyer: string;
    owner: string;
  }>;
  // Jeśli podane: przestawia costDate wszystkich kosztów OPEX tego projektu
  // (te z markerem "[OPEX wg modelu Grzegorza]") na tę datę.
  opexStartDate?: string;
  note: string;
};

export type DataAdjustment = ProjectAdjustment;

export const DATA_ADJUSTMENTS: DataAdjustment[] = [
  {
    id: "2026-09-18-opole-przychod-po-9-mies",
    kind: "project",
    projectName: "Opole 5x1 MW",
    set: { startDate: "2026-11-01", endDate: "2027-08-01" },
    opexStartDate: "2027-08-01",
    note: "Kamil 18.09.2026: kredyt i start prac od XI 2026 (bez zmian), przychód i OPEX dopiero po 9 miesiącach — od VIII 2027."
  }
];
