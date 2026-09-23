// Model Grzegorza „Budżet Farm PV" — generyczny odczyt pliku eksportu
// (pv-budget-dane_RRRR-MM-DD.json) i przeliczenie na dane, którymi żyje
// FFP Cost Control (2026-09-23). Zastępuje ręcznie przepisywany seed
// (lib/pvBudgetSeed.ts z 17.09): od teraz każdy nowy plik od Grzegorza wgrywa
// się w Ustawieniach (podgląd różnic → zastosuj), bez zmian w kodzie.
//
// Co bierzemy z modelu (i gdzie to ląduje):
//  - moc, lokalizacja, uruchomienie (endDate), start rozwoju (startDate),
//    CAPEX, przychód rok 1 = MW × uzysk × (cena + GO) → Project
//  - profil miesięczny produkcji, degradacja, eskalacja ceny, sposób
//    sprzedaży, etapy rozwoju, WACC → AppSetting farmModels (projekcje,
//    karta farmy, kalendarz)
//  - OPEX: dzierżawa (rocznie, w miesiącu płatności), O&M (mies.), podatki i
//    ubezpieczenia (mies.) → Cost z OPEX_MARKER
//  - finansowanie: udział długu × CAPEX, oprocentowanie = WIBOR + marża,
//    okres, karencja, transze, typ raty (malejąca / stała), istniejący dług
//    (Miejsce Piastowe) → Financing z GRZ_MARKER + parametry transz w
//    farmModels (harmonogram w przestrzeni Macieja)
export const OPEX_MARKER = "[OPEX wg modelu Grzegorza]";
export const GRZ_MARKER_PREFIX = "[Źródło: model Grzegorza, Budżet Farm PV";

export type Tranche = { month: number; pct: number };
export type ModelFinancing = {
  debtSharePct: number; wiborPct: number; marginPct: number; ratePct: number;
  termYears: number; graceMonths: number; type: "malejaca" | "stala";
  startYear: number; startMonth: number; tranches: Tranche[] | null; outstandingDebt: number;
};
export type ModelOpex = {
  leasePlnMwYear: number; leaseStartYear: number | null; leasePaymentMonth: number | null; leaseYears: number | null;
  servicePlnMwMonth: number; propertyTaxPlnMwYear: number; buildingTaxPct: number; buildingTaxBasePlnMw: number;
  insurancePlnMwYear: number; insuranceOcPlnYear: number; otherPlnYear: number; escalationPct: number;
};
export type ModelStage = { label: string; months: number };
export type NormalizedFarm = {
  modelId: string; label: string; location: string | null; mwPower: number;
  commissioningYear: number; commissioningMonth: number;
  devMode: string; devStartYear: number; devStartMonth: number; firstPendingStage: number; stages: ModelStage[];
  capexTotal: number; capexBreakdown: Record<string, number>; capexPerMw: number; declaredCapexPerMw: number;
  yieldKwhPerKwp: number; degradationPct: number; pricePlnMwh: number; priceEscalationPct: number; priceGoPlnMwh: number;
  otherRevenuePlnYear: number; monthlyProfilePct: number[]; saleMethod: string; horizonYears: number; waccPct: number; applyCit: boolean;
  opex: ModelOpex; financing: ModelFinancing;
  storageEnabled: boolean; storage: null | { powerMw: number; throughputMwhPerMw: number; commissioningYear: number; commissioningMonth: number; capexTotal: number; pricePlnMwh: number; degradationPct: number; opex: ModelOpex; financing: ModelFinancing };
  updatedAt: string | null;
};
export type NormalizedModel = {
  exportedAt: string | null; farms: NormalizedFarm[]; selectedIds: string[];
  fixedCosts: null | { enabled: boolean; startYear: number; startMonth: number; monthlyCurrent: number; monthlyFuture: number; escalationPct: number; items: Array<{ label: string; monthlyCurrent: number; monthlyFuture: number }> };
};

const n = (v: any, d = 0): number => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? d : Number(v));

function opexOf(o: any, esc: any): ModelOpex {
  o = o || {};
  return {
    leasePlnMwYear: n(o.dzierzawa_pln_mw), leaseStartYear: o.dzierzawa_start_year ? n(o.dzierzawa_start_year) : null,
    leasePaymentMonth: o.dzierzawa_payment_month ? n(o.dzierzawa_payment_month) : null, leaseYears: o.dzierzawa_okres_lat ? n(o.dzierzawa_okres_lat) : null,
    servicePlnMwMonth: n(o.obsluga_techniczna_pln_mw_mc), propertyTaxPlnMwYear: n(o.podatek_nieruchomosci_pln_mw),
    buildingTaxPct: n(o.podatek_budowli_stawka_pct), buildingTaxBasePlnMw: n(o.podatek_budowli_podstawa_pln_mw),
    insurancePlnMwYear: n(o.ubezpieczenie_majatkowe_pln_mw), insuranceOcPlnYear: n(o.ubezpieczenie_oc_pln),
    otherPlnYear: n(o.inne_pozostale_pln_rok), escalationPct: n(esc)
  };
}
function finOf(f: any): ModelFinancing {
  f = f || {};
  const wibor = n(f.wibor_pct), margin = n(f.marza_pct);
  const tranches = f.tranching_enabled && Array.isArray(f.tranches) && f.tranches.length
    ? f.tranches.map((t: any) => ({ month: n(t.month, 1), pct: n(t.pct) })).sort((a: Tranche, b: Tranche) => a.month - b.month)
    : null;
  return {
    debtSharePct: n(f.debt_share_pct), wiborPct: wibor, marginPct: margin, ratePct: Math.round((wibor + margin) * 1000) / 1000,
    termYears: n(f.loan_term_years), graceMonths: n(f.grace_months), type: f.type === "stala" ? "stala" : "malejaca",
    startYear: n(f.start_year), startMonth: n(f.start_month, 1), tranches, outstandingDebt: n(f.outstanding_debt_pln)
  };
}

export function normalizePvModel(json: any): NormalizedModel {
  if (!json || typeof json !== "object" || !Array.isArray(json.projects)) throw new Error("To nie jest plik eksportu Budżet Farm PV (brak listy projects).");
  const farms: NormalizedFarm[] = json.projects.map((p: any) => {
    const pv = p.pv || {}; const st = p.storage || {};
    const capexBreakdown: Record<string, number> = {};
    for (const k of Object.keys(pv.capex || {})) capexBreakdown[k] = n(pv.capex[k]);
    const capexTotal = Object.values(capexBreakdown).reduce((s, v) => s + v, 0);
    const mw = n(pv.power_kwp) / 1000;
    const dev = pv.development || {};
    const stCapex = Object.values(st.capex || {}).reduce((s: number, v: any) => s + n(v), 0);
    return {
      modelId: String(p.id || ""), label: String(p.name || "").replace(/\s+/g, " ").trim(), location: p.location ? String(p.location).trim() : null, mwPower: mw,
      commissioningYear: n(pv.commissioning_year), commissioningMonth: n(pv.commissioning_month, 1),
      devMode: String(dev.mode || ""), devStartYear: n(dev.start_year), devStartMonth: n(dev.start_month, 1), firstPendingStage: n(dev.first_pending_stage),
      stages: Array.isArray(dev.stages) ? dev.stages.map((s: any) => ({ label: String(s.label || ""), months: n(s.months) })) : [],
      capexTotal, capexBreakdown, capexPerMw: mw ? capexTotal / mw : 0, declaredCapexPerMw: n(pv.capex_total_per_mw_pln),
      yieldKwhPerKwp: n(pv.production?.specific_yield_kwh_kwp, 1050), degradationPct: n(pv.production?.degradation_pct),
      pricePlnMwh: n(pv.revenue?.price_pln_mwh), priceEscalationPct: n(pv.revenue?.price_escalation_pct), priceGoPlnMwh: n(pv.revenue?.price_go_pln_mwh),
      otherRevenuePlnYear: n(pv.revenue?.inne_przychody_pln_rok),
      monthlyProfilePct: Array.isArray(pv.monthly_profile_pct) && pv.monthly_profile_pct.length === 12 ? pv.monthly_profile_pct.map((x: any) => n(x)) : [],
      saleMethod: String(p.energy_sale_method || ""), horizonYears: n(p.horizon_years, 25), waccPct: n(p.discount?.wacc_pct), applyCit: !!p.tax?.apply_cit,
      opex: opexOf(pv.opex, pv.opex_escalation_pct), financing: finOf(pv.financing),
      storageEnabled: !!st.enabled,
      storage: st.enabled ? {
        powerMw: n(st.power_mw), throughputMwhPerMw: n(st.throughput_mwh_mw), commissioningYear: n(st.commissioning_year), commissioningMonth: n(st.commissioning_month, 1),
        capexTotal: stCapex, pricePlnMwh: n(st.revenue?.price_pln_mwh), degradationPct: n(st.degradation_pct), opex: opexOf(st.opex, st.opex_escalation_pct), financing: finOf(st.financing)
      } : null,
      updatedAt: p.updatedAt ? String(p.updatedAt) : null
    };
  });
  const fc = json.fixedCosts;
  return {
    exportedAt: json.exportedAt ? String(json.exportedAt) : null,
    farms,
    selectedIds: Array.isArray(json.selection?.ids) ? json.selection.ids.map(String) : [],
    fixedCosts: fc ? {
      enabled: !!fc.enabled, startYear: n(fc.start_year), startMonth: n(fc.start_month, 1), monthlyCurrent: n(fc.monthly_current_pln), monthlyFuture: n(fc.monthly_future_pln), escalationPct: n(fc.escalation_pct),
      items: Array.isArray(fc.items) ? fc.items.map((i: any) => ({ label: String(i.label || ""), monthlyCurrent: n(i.monthly_current_pln), monthlyFuture: n(i.monthly_future_pln) })) : []
    } : null
  };
}

// ---- przeliczenia ----
export function annualRevenueYear1(f: NormalizedFarm): number {
  return Math.round(f.mwPower * f.yieldKwhPerKwp * (f.pricePlnMwh + f.priceGoPlnMwh) + f.otherRevenuePlnYear);
}
export function monthlyRevenueAvg(f: NormalizedFarm): number { return Math.round(annualRevenueYear1(f) / 12); }
export function storageAnnualRevenue(f: NormalizedFarm): number {
  if (!f.storage) return 0;
  return Math.round(f.storage.powerMw * f.storage.throughputMwhPerMw * f.storage.pricePlnMwh);
}

export function ymd(y: number, m: number, addMonths = 0, day = 1): string {
  const d = new Date(Date.UTC(y, m - 1 + addMonths, day));
  return d.toISOString().slice(0, 10);
}
export function commissioningISO(f: NormalizedFarm): string { return ymd(f.commissioningYear, f.commissioningMonth); }
export function devStartISO(f: NormalizedFarm): string | null { return f.devStartYear ? ymd(f.devStartYear, f.devStartMonth) : null; }

// Harmonogram etapów rozwoju: od startu rozwoju, etapy przed first_pending_stage
// są zakończone (0 miesięcy w modelu, gdy "0"), kolejne następują po sobie.
export type StageWindow = { label: string; months: number; startISO: string; endISO: string; done: boolean };
export function stageSchedule(f: NormalizedFarm): StageWindow[] {
  if (!f.devStartYear || !f.stages.length) return [];
  let cursor = 0; const out: StageWindow[] = [];
  f.stages.forEach((s, i) => {
    const startISO = ymd(f.devStartYear, f.devStartMonth, cursor);
    const endISO = ymd(f.devStartYear, f.devStartMonth, cursor + Math.max(0, s.months));
    out.push({ label: s.label, months: s.months, startISO, endISO, done: i < f.firstPendingStage || (f.devMode === "operating" || f.devMode === "own_operating") });
    cursor += Math.max(0, s.months);
  });
  return out;
}

export type OpexLine = { name: string; amount: number; category: string; recurrence: "MIESIECZNY" | "ROCZNY"; costDate: string; note: string };
export function opexLines(f: NormalizedFarm, farmName: string): OpexLine[] {
  const o = f.opex; const mw = f.mwPower; const start = commissioningISO(f);
  const lines: OpexLine[] = [];
  const leaseYear = Math.round(o.leasePlnMwYear * mw);
  if (leaseYear > 0) {
    const leaseStart = o.leaseStartYear ? ymd(o.leaseStartYear, o.leasePaymentMonth || 1) : start;
    lines.push({ name: `Dzierżawa gruntu — ${farmName} (PV)`, amount: leaseYear, category: "OPEX farmy — dzierżawa", recurrence: "ROCZNY", costDate: leaseStart, note: `Dzierżawa ${o.leasePlnMwYear.toLocaleString("pl-PL")} zł/MW/rok × ${mw} MW, płatna raz w roku (miesiąc ${o.leasePaymentMonth || "?"}), od ${leaseStart.slice(0, 7)}${o.leaseYears ? `, ${o.leaseYears} lat` : ""}.` });
  }
  const service = Math.round(o.servicePlnMwMonth * mw);
  if (service > 0) lines.push({ name: `Obsługa techniczna (O&M) — ${farmName} (PV)`, amount: service, category: "OPEX farmy — serwis", recurrence: "MIESIECZNY", costDate: start, note: `${o.servicePlnMwMonth.toLocaleString("pl-PL")} zł/MW/mies. × ${mw} MW od uruchomienia.` });
  const taxes = Math.round((o.propertyTaxPlnMwYear * mw + (o.buildingTaxPct / 100) * o.buildingTaxBasePlnMw * mw) / 12);
  if (taxes > 0) lines.push({ name: `Podatki (nieruchomości + od budowli) — ${farmName} (PV)`, amount: taxes, category: "OPEX farmy — podatki", recurrence: "MIESIECZNY", costDate: start, note: `(${o.propertyTaxPlnMwYear.toLocaleString("pl-PL")} zł/MW + ${o.buildingTaxPct}% × ${o.buildingTaxBasePlnMw.toLocaleString("pl-PL")} zł/MW) × ${mw} MW / 12.` });
  const ins = Math.round((o.insurancePlnMwYear * mw + o.insuranceOcPlnYear) / 12);
  if (ins > 0) lines.push({ name: `Ubezpieczenie (majątkowe + OC) — ${farmName} (PV)`, amount: ins, category: "OPEX farmy — ubezpieczenie", recurrence: "MIESIECZNY", costDate: start, note: `(${o.insurancePlnMwYear.toLocaleString("pl-PL")} zł/MW × ${mw} MW + OC ${o.insuranceOcPlnYear.toLocaleString("pl-PL")} zł) / 12.` });
  const other = Math.round(o.otherPlnYear / 12);
  if (other > 0) lines.push({ name: `Pozostałe koszty — ${farmName} (PV)`, amount: other, category: "OPEX farmy — inne", recurrence: "MIESIECZNY", costDate: start, note: "" });
  return lines;
}
export function monthlyOpexTotal(f: NormalizedFarm): number {
  return opexLines(f, "x").reduce((s, l) => s + (l.recurrence === "ROCZNY" ? l.amount / 12 : l.amount), 0);
}

// Rata: malejąca = P/n + odsetki od salda; stała (annuitetowa) = wzór annuitetowy.
export function firstInstallment(principal: number, ratePct: number, termYears: number, type: "malejaca" | "stala"): number {
  const nInst = termYears * 12; if (nInst <= 0 || principal <= 0) return 0;
  const r = ratePct / 100 / 12;
  if (type === "stala") { if (r === 0) return Math.round(principal / nInst); return Math.round(principal * r / (1 - Math.pow(1 + r, -nInst))); }
  return Math.round(principal / nInst + principal * r);
}
export type FinancingSpec = {
  lender: string; subject: string; principal: number; ratePct: number; termYears: number; graceMonths: number; type: "malejaca" | "stala";
  startISO: string; firstInstallmentISO: string; endISO: string; monthlyPayment: number; tranches: Tranche[] | null; outstanding: boolean; note: string;
};
export function financingSpecs(f: NormalizedFarm, farmName: string): FinancingSpec[] {
  const out: FinancingSpec[] = [];
  const mk = (lender: string, subject: string, fin: ModelFinancing, capex: number, what: string): FinancingSpec | null => {
    const outstanding = fin.outstandingDebt > 0;
    const principal = outstanding ? Math.round(fin.outstandingDebt) : Math.round(capex * fin.debtSharePct / 100);
    if (principal <= 0 || fin.termYears <= 0) return null;
    const nInst = fin.termYears * 12;
    const startISO = ymd(fin.startYear, fin.startMonth);
    const firstISO = ymd(fin.startYear, fin.startMonth, fin.graceMonths);
    const endISO = ymd(fin.startYear, fin.startMonth, fin.graceMonths + nInst - 1);
    const tr = fin.tranches && fin.tranches.length ? ` Transze: ${fin.tranches.map((t) => `m${t.month} → ${t.pct}%`).join(", ")}.` : "";
    return {
      lender, subject, principal, ratePct: fin.ratePct, termYears: fin.termYears, graceMonths: fin.graceMonths, type: fin.type, startISO, firstInstallmentISO: firstISO, endISO,
      monthlyPayment: firstInstallment(principal, fin.ratePct, fin.termYears, fin.type), tranches: fin.tranches, outstanding,
      note: `${what}: ${outstanding ? `istniejący dług ${principal.toLocaleString("pl-PL")} zł` : `${fin.debtSharePct}% CAPEX`}, ${fin.ratePct}% rocznie (WIBOR ${fin.wiborPct}% + marża ${fin.marginPct}%), ${fin.termYears} lat, karencja ${fin.graceMonths} mc, rata ${fin.type === "stala" ? "stała (annuitetowa)" : "malejąca — wpisana PIERWSZA (najwyższa), kolejne maleją"}, uruchomienie kredytu ${startISO.slice(0, 7)}.${tr}`
    };
  };
  const pv = mk("Model budżetowy (Grzegorz) — PV", `${farmName}: instalacja PV ${f.mwPower} MW`, f.financing, f.capexTotal, "Kredyt PV");
  if (pv) out.push(pv);
  if (f.storage) {
    const st = mk("Model budżetowy (Grzegorz) — BESS", `${farmName}: magazyn energii ${f.storage.powerMw} MW`, f.storage.financing, f.storage.capexTotal, "Kredyt BESS");
    if (st) out.push(st);
  }
  return out;
}

// Dopasowanie nazwy z modelu do farmy w aplikacji: po słowie kluczowym miejscowości.
export function normTxt(s: string): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/\s+/g, " ").trim();
}
const NAME_ALIASES: Array<[RegExp, string[]]> = [
  [/debowiec/, ["debowiec"]], [/lubno/, ["lubno"]], [/miejsce piastowe/, ["miejsce piastowe"]], [/poreba/, ["poreba"]], [/wylewa/, ["wylewa"]],
  [/zaleszany/, ["zaleszany"]], [/opole 4x1|opole 5x1/, ["opole 5x1", "opole 4x1", "opole"]], [/podkarpackie 5x1|lubelskie 4x1/, ["lubelskie 4x1", "podkarpackie 5x1"]],
  [/sz?krzypaczowice/, ["skrzypaczowice"]], [/ziempniow/, ["ziempniow"]], [/kamyk/, ["kamyk"]], [/pieczyska/, ["pieczyska"]]
];
export function suggestProjectMatch(label: string, projects: Array<{ id: string; name: string; isDemo?: boolean; status?: string }>): { id: string; name: string } | null {
  const l = normTxt(label);
  const real = projects.filter((p) => !p.isDemo && !/— BESS/.test(p.name));
  for (const [re, keys] of NAME_ALIASES) {
    if (!re.test(l)) continue;
    for (const k of keys) { const hit = real.find((p) => normTxt(p.name).indexOf(k) >= 0); if (hit) return { id: hit.id, name: hit.name }; }
  }
  const hit = real.find((p) => l.indexOf(normTxt(p.name)) >= 0 && normTxt(p.name).length >= 5);
  return hit ? { id: hit.id, name: hit.name } : null;
}
// Skrót nazwy do karty projektu ("1 ETAP PV Dębowiec 1 MW" -> "Dębowiec").
export function shortFarmName(label: string): string {
  return label.replace(/^\d\s*ETAP\s*/i, "").replace(/^PV\s*/i, "").replace(/\s*\(kopia\)\s*$/i, "").replace(/\s+\d+(\.\d+)?\s*MW\s*$/i, "").replace(/\s+\d+MW\s*$/i, "").replace(/\s+\d+x\d+\s*MW\s*$/i, (m) => m).trim() || label;
}
// Warianty / kopie / scenariusze — do pominięcia domyślnie (Kamil może włączyć).
export function looksLikeVariant(f: NormalizedFarm, _all: NormalizedFarm[]): string | null {
  if (/\(kopia\)/i.test(f.label)) return "kopia";
  if (f.mwPower > 0 && f.declaredCapexPerMw > 0) {
    const declared = f.declaredCapexPerMw; // CAPEX/MW zadeklarowany w narzędziu
    const actual = f.capexTotal / f.mwPower; // CAPEX/MW z rozbicia
    if (Math.abs(actual - declared) / declared > 0.3) return "wariant (CAPEX niespójny z mocą — prawdopodobnie kopia scenariusza)";
  }
  return null;
}
export const SALE_METHOD_LABEL: Record<string, string> = { aukcja_oze: "aukcja OZE", rynek_dnia_nastepnego: "rynek dnia następnego (RDN)", ppa: "PPA" };
