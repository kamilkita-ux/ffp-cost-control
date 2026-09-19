// Reguły "od kiedy liczyć" (ustalone 18.09.2026) — JEDNO źródło dla serwera.
// Przeglądarka (app/app-shell.html) ma DOSŁOWNĄ kopię tych funkcji (to
// statyczny plik, nie moduł Node) — test tests/rulesParity.test.ts uruchamia
// obie wersje na tych samych danych i pilnuje, że dają identyczne wyniki.
//
// 1. Koszt cykliczny wchodzi do "Koszt dziś" od swojej daty (costDate) i
//    nigdy, gdy ma status płatności "anulowany".
// 2. Rata finansowania wchodzi od pierwszej raty (nextPaymentDate <= koniec
//    bieżącego miesiąca) albo gdy kredyt już jest w spłacie
//    (remainingInstallments < numInstallments), do endDate.
// 3. "Dziś" = koniec bieżącego miesiąca kalendarzowego w strefie Europe/Warsaw
//    (bez okna +45 dni — decyzja Kamila 18.09).
// 4. Projekt "liczy się" w miesiącu M od miesiąca uruchomienia (endDate) —
//    statusy sprzedany/zamknięty/zawieszony nigdy, DEMO nigdy.
type AnyRec = Record<string, any>;

export function localISO(d: Date): string {
  const p2 = (n: number) => (n < 10 ? "0" : "") + n;
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}

export function warsawToday(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}

export function runRateAsOfISO(today: Date = warsawToday()): string {
  return localISO(new Date(today.getFullYear(), today.getMonth() + 1, 0));
}

export function recurringCostActive(c: AnyRec, asOfISO: string): boolean {
  if (c.paymentStatus === "anulowany") return false;
  if (c.costDate && String(c.costDate) > asOfISO) return false;
  return true;
}

export function financingActive(f: AnyRec, asOfISO: string): boolean {
  if (f.endDate && String(f.endDate) < asOfISO.slice(0, 7) + "-01") return false;
  if (!f.nextPaymentDate) return true;
  if (String(f.nextPaymentDate) <= asOfISO) return true;
  const n = Number(f.numInstallments) || 0, r = Number(f.remainingInstallments) || 0;
  if (n > 0 && r > 0 && r < n) return true; // już w spłacie
  return false;
}

export const NEVER_FUTURE_STATUSES = ["sprzedany", "zamknięty", "zawieszony"];

// Czy projekt liczy się do "przychodu docelowego"/przyszłości (jedna
// definicja — audyt 2026-09-19, pkt 15).
export function projectCountsAsFuture(p: AnyRec): boolean {
  return !p.isDemo && NEVER_FUTURE_STATUSES.indexOf(p.status) < 0;
}

// Czy projekt (farma) jest "aktywny" w miesiącu kończącym się monthEndISO:
// operacyjny zawsze; nieoperacyjny od miesiąca uruchomienia (endDate);
// nigdy, gdy DEMO albo sprzedany/zamknięty/zawieszony.
export function projectActiveInMonth(p: AnyRec, monthEndISO: string): boolean {
  if (p.isDemo) return false;
  if (NEVER_FUTURE_STATUSES.indexOf(p.status) >= 0) return false;
  if (p.status === "operacyjny") return true;
  return !!(p.endDate && String(p.endDate) <= monthEndISO);
}

export function monthlyEquivalent(cost: AnyRec): number {
  const g = Number(cost.grossAmount) || Number(cost.netAmount) || 0;
  return monthlyEquivalentGeneric(g, cost.recurrence);
}

export function monthlyEquivalentGeneric(amount: any, freq: string): number {
  const a = Number(amount) || 0;
  switch (freq) {
    case "miesięczny": return a;
    case "kwartalny": return a / 3;
    case "półroczny": return a / 6;
    case "roczny": return a / 12;
    default: return 0; // jednorazowy / nieregularny — nie jest kosztem miesięcznym (audyt 2026-09-19)
  }
}

// Rata malejąca: stała część kapitałowa + odsetki od bieżącego salda.
// Zwraca harmonogram (k-ta rata, kapitał, odsetki, rata, saldo po racie).
export interface InstallmentRow { k: number; capital: number; interest: number; total: number; balanceAfter: number; }
export function decliningSchedule(principal: number, annualRatePct: number, numInstallments: number): InstallmentRow[] {
  const P = Number(principal) || 0, n = Math.max(0, Math.round(Number(numInstallments) || 0));
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  if (!P || !n) return [];
  const cap = P / n;
  const rows: InstallmentRow[] = [];
  let bal = P;
  for (let k = 1; k <= n; k++) {
    const interest = bal * r;
    const total = cap + interest;
    bal = Math.max(0, bal - cap);
    rows.push({ k, capital: cap, interest, total, balanceAfter: bal });
  }
  return rows;
}
