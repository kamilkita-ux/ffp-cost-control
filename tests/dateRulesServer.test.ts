// AUDYT 2026-09-19: reguły "od kiedy liczyć" (18.09) muszą być identyczne na
// serwerze (lib/serverMetrics.ts) i w przeglądarce (app-shell.html). Ten test
// pilnuje serwera na kontrolowanych danych: koszt cykliczny z datą w
// przyszłości / anulowany NIE wchodzi do "Koszt dziś"; finansowanie z
// pierwszą ratą w przyszłości NIE wchodzi, a w trakcie spłaty — wchodzi.
import test from "node:test";
import assert from "node:assert/strict";
import { computeServerMetrics, redactSmallGroupsForRestricted } from "../lib/serverMetrics";

function iso(d: Date): string { return d.toISOString().slice(0, 10); }
const today = new Date();
const future = new Date(today.getTime() + 90 * 86400000);
const past = new Date(today.getTime() - 90 * 86400000);

const base = {
  projects: [{ id: "p1", status: "operacyjny", revenueMonthly: 1000, isDemo: false }],
  employees: [],
  departments: [],
  contracts: []
};

test("koszt cykliczny z datą startu w przyszłości nie wchodzi do Koszt dziś", () => {
  const m = computeServerMetrics({
    ...base,
    costs: [
      { id: "c1", projectId: null, grossAmount: 500, recurrence: "miesięczny", costDate: iso(past), isDemo: false },
      { id: "c2", projectId: null, grossAmount: 700, recurrence: "miesięczny", costDate: iso(future), isDemo: false }
    ],
    financings: []
  });
  assert.equal(m.monthlyExternal, 500);
});

test("koszt cykliczny anulowany nie wchodzi do Koszt dziś", () => {
  const m = computeServerMetrics({
    ...base,
    costs: [
      { id: "c1", projectId: null, grossAmount: 500, recurrence: "miesięczny", costDate: iso(past), paymentStatus: "anulowany", isDemo: false }
    ],
    financings: []
  });
  assert.equal(m.monthlyExternal, 0);
});

test("finansowanie: pierwsza rata w przyszłości nie wchodzi, w trakcie spłaty wchodzi, zakończone nie wchodzi", () => {
  const m = computeServerMetrics({
    ...base,
    costs: [],
    financings: [
      { id: "f1", monthlyPayment: 100, nextPaymentDate: iso(future), numInstallments: 120, remainingInstallments: 120 },
      { id: "f2", monthlyPayment: 200, nextPaymentDate: iso(future), numInstallments: 120, remainingInstallments: 100 },
      { id: "f3", monthlyPayment: 400, nextPaymentDate: iso(past), numInstallments: 120, remainingInstallments: 50 },
      { id: "f4", monthlyPayment: 800, nextPaymentDate: iso(past), endDate: iso(past), numInstallments: 12, remainingInstallments: 0 }
    ]
  });
  assert.equal(m.monthlyFinancing, 200 + 400);
});

test("oszczędności liczone tylko z pozycji aktywnych dziś; umowy osobno", () => {
  const m = computeServerMetrics({
    ...base,
    costs: [
      { id: "c1", projectId: null, grossAmount: 300, recurrence: "miesięczny", costDate: iso(past), excludeFromSimulation: true, isDemo: false },
      { id: "c2", projectId: null, grossAmount: 900, recurrence: "miesięczny", costDate: iso(future), excludeFromSimulation: true, isDemo: false }
    ],
    financings: [],
    contracts: [{ id: "k1", amount: 1200, frequency: "roczny", excludeFromSimulation: true }]
  });
  assert.equal(m.potentialSavingsMonthly, 300);
  assert.equal(m.potentialSavingsContractsMonthly, 100);
});

test("redakcja małych grup dla konta ograniczonego: dział 1–2 osób i projekt 1–2 osób ukryte", () => {
  const employees = [
    { id: "e1", status: "aktywny", employerCost: 8000, departmentId: "d1", allocations: [{ projectId: "p1", pct: 100 }], isDemo: false },
    { id: "e2", status: "aktywny", employerCost: 7000, departmentId: "d2", allocations: [{ projectId: "p2", pct: 50 }], isDemo: false },
    { id: "e3", status: "aktywny", employerCost: 6000, departmentId: "d2", allocations: [{ projectId: "p2", pct: 50 }], isDemo: false },
    { id: "e4", status: "aktywny", employerCost: 5000, departmentId: "d2", allocations: [{ projectId: "p2", pct: 50 }], isDemo: false }
  ];
  const projects = [
    { id: "p1", status: "operacyjny", revenueMonthly: 0, isDemo: false },
    { id: "p2", status: "operacyjny", revenueMonthly: 0, isDemo: false }
  ];
  const departments = [{ id: "d1", name: "A" }, { id: "d2", name: "B" }];
  const sm = computeServerMetrics({ projects, employees, departments, costs: [], financings: [], contracts: [] });
  const r = redactSmallGroupsForRestricted(sm, employees, projects);
  assert.equal((r.deptCost.d1 as any).hidden, true, "dział z 1 osobą ukryty");
  assert.equal((r.deptCost.d1 as any).total, null);
  assert.equal((r.deptCost.d2 as any).hidden, undefined, "dział z 3 osobami widoczny");
  assert.equal(r.deptCost.d2.total, 18000);
  assert.equal(r.monthlyProjectCost.p1, null, "projekt z 1 osobą ukryty");
  assert.equal(r.monthlyProjectCost.p2, 9000, "projekt z 3 osobami widoczny");
});
