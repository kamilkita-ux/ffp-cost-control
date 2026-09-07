// Test regresyjny dla lib/serverMetrics.ts — pierwszy automatyczny test w
// tym projekcie (2026-09-07). Cel: każda przyszła zmiana sposobu liczenia
// sum zbiorczych (koszt pracowniczy, wynik firmy, koszty działów — patrz
// komentarz na górze serverMetrics.ts) musi dalej dawać poprawne, ręcznie
// wyliczone wartości na małym, kontrolowanym zestawie danych. Bez tego
// pomyłka w logice ujawniłaby się dopiero na żywych danych finansowych.
//
// Celowo bez zewnętrznego frameworka testowego (node:test + node:assert są
// wbudowane w Node.js) — projekt i tak ma już "tsx" jako zależność, więc
// uruchomienie to: npx tsx --test tests/*.test.ts (patrz package.json,
// skrypt "test").
import test from "node:test";
import assert from "node:assert/strict";
import { computeServerMetrics, redactEmployeeSalary, redactFixedCostLineItem, preserveSalaryFieldsIfRestricted } from "../lib/serverMetrics";

// Mały, ręcznie policzony zestaw danych: jeden dział, dwa projekty,
// dwóch pracowników (jeden aktywny w 100% na projekt A, jeden nieaktywny
// "zakończona współpraca" — nie powinien liczyć się do żadnej sumy).
const fixture = {
  projects: [
    { id: "p1", status: "operacyjny", revenueMonthly: 10000, assetType: "PV", mwPower: 2, isDemo: false },
    { id: "p2", status: "w budowie", revenueMonthly: 0, assetType: "PV", mwPower: 5, isDemo: false }
  ],
  costs: [
    { id: "c1", projectId: "p1", grossAmount: 1200, recurrence: "miesięczny", isFixed: false, isDemo: false },
    { id: "c2", projectId: null, grossAmount: 3600, recurrence: "kwartalny", isFixed: true, isDemo: false }
  ],
  employees: [
    {
      id: "e1", status: "aktywny", employerCost: 8000, bonus: 500, departmentId: "d1",
      allocations: [{ projectId: "p1", pct: 100 }], isDemo: false
    },
    {
      id: "e2", status: "zakończona współpraca", employerCost: 9999, departmentId: "d1",
      allocations: [{ projectId: "p1", pct: 100 }], isDemo: false
    }
  ],
  departments: [{ id: "d1", name: "Operacje" }],
  financings: [{ id: "f1", monthlyPayment: 700 }],
  contracts: []
};

test("computeServerMetrics — sumy podstawowe zgadzają się z ręcznym wyliczeniem", () => {
  const m = computeServerMetrics(fixture);

  // Pracownik e2 ("zakończona współpraca") nie liczy się w ogóle.
  assert.equal(m.monthlyPayroll, 8000 + 500, "monthlyPayroll powinien liczyć tylko aktywnego pracownika");

  // c1: 1200 zł/mies., c2: 3600 zł kwartalnie = 1200 zł/mies. -> razem 2400
  assert.equal(m.monthlyExternal, 1200 + 1200, "monthlyExternal: przelicznik kwartalny na miesięczny");

  assert.equal(m.monthlyFinancing, 700);

  // koszt projektu p1: koszt c1 (1200, przypisany do p1) + 100% kosztu e1 (8500)
  assert.equal(m.monthlyProjectCost.p1, 1200 + 8500);
  // p2: brak przypisanych kosztów/pracowników
  assert.equal(m.monthlyProjectCost.p2, 0);

  assert.equal(m.monthlyRevenue, 10000, "tylko projekty ze statusem operacyjny liczą się do przychodu bieżącego");
  assert.equal(m.monthlyRevenueProjected, 0);

  const totalBurn = m.monthlyPayroll + m.monthlyExternal + m.monthlyFinancing;
  assert.equal(m.totalBurn, totalBurn);
  assert.equal(m.annualRunRate, totalBurn * 12);

  assert.equal(m.monthlyProfit, m.monthlyRevenue - m.totalBurn);
  assert.equal(m.annualProfit, m.monthlyProfit * 12);

  // koszt nieprzypisany do żadnego projektu (c2) trafia do "admin"
  assert.equal(m.monthlyAdmin, 1200);

  assert.equal(m.deptCost.d1.employees, 1, "tylko aktywny pracownik liczy się do działu");
  assert.equal(m.deptCost.d1.empCost, 8500);
});

test("redactEmployeeSalary — usuwa TYLKO pola kwotowe, nie rusza reszty", () => {
  const employee = {
    id: "e1", firstName: "Jan", lastName: "Kowalski", position: "Kierownik",
    grossSalary: 12000, netSalary: 8500, employerCost: 14500, bonus: 1000,
    car: 0, phoneCost: 100, computer: 0, otherBenefits: 0, otherMonthlyCost: 0,
    departmentId: "d1", allocations: [{ projectId: "p1", pct: 100 }]
  };
  const redacted = redactEmployeeSalary(employee);
  assert.equal(redacted.grossSalary, null);
  assert.equal(redacted.netSalary, null);
  assert.equal(redacted.employerCost, null);
  assert.equal(redacted.bonus, null);
  // Dane niebędące kwotami muszą zostać nietknięte.
  assert.equal(redacted.firstName, "Jan");
  assert.equal(redacted.position, "Kierownik");
  assert.deepEqual(redacted.allocations, employee.allocations);
});

test("redactFixedCostLineItem — ukrywa nazwę/notatkę, zostawia kwoty", () => {
  const item = { name: "Kontroling - Maciek B2B", note: "umowa do 2027", current: 5000, future12m: 60000 };
  const redacted = redactFixedCostLineItem(item, 2);
  assert.equal(redacted.name, "Pozycja kosztowa 3 (ukryta)");
  assert.equal(redacted.note, "");
  assert.equal(redacted.current, 5000, "kwoty muszą zostać, żeby sumy się zgadzały");
  assert.equal(redacted.future12m, 60000);
});

test("preserveSalaryFieldsIfRestricted — konto pełne: przesłane dane bez zmian", () => {
  const incoming = { firstName: "Jan", grossSalary: 999, netSalary: 1 };
  const out = preserveSalaryFieldsIfRestricted(incoming, { grossSalary: 12000, netSalary: 8500 }, false);
  assert.equal(out, incoming, "dla konta pełnego funkcja musi zwrócić dokładnie ten sam obiekt, bez modyfikacji");
});

test("preserveSalaryFieldsIfRestricted — konto ograniczone + edycja (PUT): wymusza wartości z bazy, ignorując puste pola z ukrytego formularza", () => {
  // Dokładnie ten scenariusz, który powodował błąd: przeglądarka wysyła
  // puste stringi w polach kwotowych (bo dostała je już wyzerowane z
  // /api/bootstrap), a serwer musi je zignorować i zachować prawdziwe
  // kwoty zapisane w bazie.
  const incoming = { firstName: "Jan", position: "Kierownik po zmianie", grossSalary: "", netSalary: "", bonus: "" };
  const current = { grossSalary: 12000, netSalary: 8500, employerCost: 14500, otherMonthlyCost: 0, bonus: 1000, car: 0, phoneCost: 100, computer: 0, otherBenefits: 0 };
  const out = preserveSalaryFieldsIfRestricted(incoming, current, true);
  assert.equal(out.grossSalary, 12000);
  assert.equal(out.netSalary, 8500);
  assert.equal(out.employerCost, 14500);
  assert.equal(out.bonus, 1000);
  // Pola niebędące kwotami zostają takie, jak przesłano (edycja ma zadziałać).
  assert.equal(out.position, "Kierownik po zmianie");
});

test("preserveSalaryFieldsIfRestricted — konto ograniczone + nowy pracownik (POST, current=null): kwoty wynagrodzenia = null", () => {
  const incoming = { firstName: "Nowy", grossSalary: 15000, netSalary: 10000 };
  const out = preserveSalaryFieldsIfRestricted(incoming, null, true);
  assert.equal(out.grossSalary, null);
  assert.equal(out.netSalary, null);
  assert.equal(out.firstName, "Nowy");
});
