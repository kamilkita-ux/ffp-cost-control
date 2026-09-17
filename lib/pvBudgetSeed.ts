// Model budżetowy farm PV — dane z narzędzia "Budżet Farm PV" (Grzegorz),
// eksport pv-budget-dane_2026-09-17.json. WERSJA 2 (2026-09-18): pełne
// parametry strukturalne (produkcja, ceny, OPEX, BESS), bo decyzją Kamila
// dane Grzegorza są ŹRÓDŁEM PRAWDY dla portfela farm — patrz
// app/api/admin/reset-farm-portfolio/route.ts, który buduje z nich Projekty,
// Finansowania i koszty OPEX od zera (przychód mies. = moc × uzysk ×
// (cena + GO) / 12 [+ BESS: moc × przepustowość × cena / 12]).
//
// Rozstrzygnięcia zatwierdzone przez Kamila 2026-09-17:
// - duplikaty "Wylewa 15 MW" i "Lubelskie 4x1 MW": wersje edytowane rano
//   2026-09-17 (id erdqdiitjji, oxfm08xtjic);
// - "Miejsce Piastowe 2MW": wersja z magazynem energii (id 6elq9nstjj1);
// - "Poręba 6.5 MW": CAPEX w pliku miał dodatkowe 3 zera — podzielono /1000.
// Uwaga: "Lubelskie 4x1 MW" w wersji porannej ma BESS 4 MW (w starszej nie
// miało) — bierzemy wersję poranną zgodnie z decyzją.

export type PvBudgetFinancing = { debtSharePct: number; interestRate: number; termYears: number; graceMonths: number; startYear: number; startMonth: number };
export type PvBudgetOpex = { leasePlnMwYear: number; servicePlnMwMonth: number; propertyTaxPlnMwYear: number; buildingTaxPct: number; buildingTaxBasePlnMw: number; insurancePlnMwYear: number; insuranceOcPlnYear: number; otherPlnYear: number };
export type PvBudgetPv = { yieldKwhPerKwp: number; degradationPct: number; pricePlnMwh: number; priceGoPlnMwh: number; priceEscalationPct: number; opexEscalationPct: number; opex: PvBudgetOpex };
export type PvBudgetStorage = { powerMw: number; throughputMwhPerMw: number; commissioningYear: number; commissioningMonth: number; pricePlnMwh: number; degradationPct: number; opex: PvBudgetOpex };

export type PvBudgetEntry = {
  label: string; // nazwa w narzędziu Grzegorza
  name: string; // nazwa farmy w FFP Cost Control (Project.name)
  code: string; // Project.code
  matchExistingProjectName: string | null; // null = nowa farma spoza CF Farmy.xlsx
  mwPower: number;
  location: string | null;
  commissioningYear: number;
  commissioningMonth: number; // 1-12
  pvCapex: number;
  storageCapex: number;
  totalCapex: number;
  pv: PvBudgetPv;
  storage: PvBudgetStorage | null;
  financingPv: PvBudgetFinancing;
  financingStorage: PvBudgetFinancing | null;
  applyCit: boolean;
  waccPct: number;
  horizonYears: number;
  description: string;
};

// Przychód miesięczny (rok 1, bez degradacji/eskalacji) wg modelu Grzegorza —
// osobno dla części PV i BESS, bo w FFP Cost Control magazyn energii jest
// osobnym Projektem (inna data uruchomienia, CAPEX, finansowanie).
export function pvMonthlyRevenue(e: PvBudgetEntry): number {
  // MW × (kWh/kWp = MWh/MW) × zł/MWh / 12
  return Math.round(e.mwPower * e.pv.yieldKwhPerKwp * (e.pv.pricePlnMwh + e.pv.priceGoPlnMwh) / 12);
}
export function storageMonthlyRevenue(e: PvBudgetEntry): number {
  if (!e.storage) return 0;
  return Math.round(e.storage.powerMw * e.storage.throughputMwhPerMw * e.storage.pricePlnMwh / 12);
}
// Przychód referencyjny dla farm spoza modelu Grzegorza (te same założenia
// domyślne co w jego narzędziu: 1050 kWh/kWp, 350 zł/MWh + 2.5 zł GO).
export const DEFAULT_YIELD_KWH_PER_KWP = 1050;
export const DEFAULT_PRICE_PLN_MWH = 350;
export const DEFAULT_GO_PLN_MWH = 2.5;
export function defaultMonthlyRevenue(mw: number): number {
  return Math.round(mw * DEFAULT_YIELD_KWH_PER_KWP * (DEFAULT_PRICE_PLN_MWH + DEFAULT_GO_PLN_MWH) / 12);
}

// OPEX miesięczny (rok 1) dla jednego składnika (PV albo BESS), 4 linie.
export type MonthlyOpex = { lease: number; service: number; taxes: number; insurance: number; other: number };
export function monthlyOpexFor(o: PvBudgetOpex, mw: number): MonthlyOpex {
  return {
    lease: Math.round(o.leasePlnMwYear * mw / 12),
    service: Math.round(o.servicePlnMwMonth * mw),
    taxes: Math.round((o.propertyTaxPlnMwYear * mw + o.buildingTaxPct / 100 * o.buildingTaxBasePlnMw * mw) / 12),
    insurance: Math.round((o.insurancePlnMwYear * mw + o.insuranceOcPlnYear) / 12),
    other: Math.round(o.otherPlnYear / 12)
  };
}

// Pierwsza rata kredytu "malejąca": kapitał/n + odsetki od pełnego salda.
export function decliningFirstInstallment(principal: number, annualRatePct: number, termYears: number): number {
  const n = termYears * 12;
  if (n <= 0) return 0;
  return Math.round(principal / n + principal * (annualRatePct / 100) / 12);
}

export const PV_BUDGET_ENTRIES: PvBudgetEntry[] = [
  {
    label: "Dębowiec 1 MW",
    name: "Dębowiec",
    code: "PV-DEB",
    matchExistingProjectName: "Dębowiec",
    mwPower: 1,
    location: null,
    commissioningYear: 2027,
    commissioningMonth: 2,
    pvCapex: 2140000,
    storageCapex: 0,
    totalCapex: 2140000,
    pv: { yieldKwhPerKwp: 1050, degradationPct: 0.5, pricePlnMwh: 350, priceGoPlnMwh: 2.5, priceEscalationPct: 3, opexEscalationPct: 3, opex: { leasePlnMwYear: 19000, servicePlnMwMonth: 5000, propertyTaxPlnMwYear: 10000, buildingTaxPct: 2, buildingTaxBasePlnMw: 600000, insurancePlnMwYear: 3750, insuranceOcPlnYear: 2500, otherPlnYear: 0 } },
    storage: null,
    financingPv: { debtSharePct: 90, interestRate: 1, termYears: 10, graceMonths: 7, startYear: 2026, startMonth: 9 },
    financingStorage: null,
    applyCit: false,
    waccPct: 6.5,
    horizonYears: 20,
    description: "Model budżetowy „Dębowiec 1 MW” (Grzegorz  Budżet Farm PV  eksport 2026-09-17). CAPEX PV: 2 140 000 zł; razem 2 140 000 zł. Uruchomienie PV: luty 2027. Produkcja: 1050 kWh/kWp/rok  degradacja 0.5%/rok. Cena: 350 zł/MWh (+3%/rok) + GO 2.5 zł/MWh. OPEX: dzierżawa 19 000 zł/MW/rok  O&M 5 000 zł/MW/mc  podatek od nieruchomości 10 000 zł/MW/rok  podatek od budowli 2% × 600 000 zł/MW  ubezpieczenie 3 750 zł/MW/rok + OC 2 500 zł/rok  eskalacja 3%/rok. Finansowanie PV (założenie modelu): 90% dług  1%  10 lat  karencja 7 mc  rata malejąca  start wrzesień 2026. CIT nie stosowany (19%)  WACC 6.5%  horyzont 20 lat.",
  },
  {
    label: "Lubelskie 4x1 MW",
    name: "Lubelskie 4x1 MW",
    code: "PV-LBL",
    matchExistingProjectName: null,
    mwPower: 4,
    location: "woj. Lubelskie",
    commissioningYear: 2027,
    commissioningMonth: 2,
    pvCapex: 8440000,
    storageCapex: 8400001,
    totalCapex: 16840001,
    pv: { yieldKwhPerKwp: 1050, degradationPct: 0.5, pricePlnMwh: 350, priceGoPlnMwh: 2.5, priceEscalationPct: 3, opexEscalationPct: 3, opex: { leasePlnMwYear: 18500, servicePlnMwMonth: 2500, propertyTaxPlnMwYear: 10000, buildingTaxPct: 2, buildingTaxBasePlnMw: 600000, insurancePlnMwYear: 3750, insuranceOcPlnYear: 2500, otherPlnYear: 0 } },
    storage: { powerMw: 4, throughputMwhPerMw: 1500, commissioningYear: 2027, commissioningMonth: 3, pricePlnMwh: 400, degradationPct: 2, opex: { leasePlnMwYear: 2000, servicePlnMwMonth: 500, propertyTaxPlnMwYear: 0, buildingTaxPct: 2, buildingTaxBasePlnMw: 300000, insurancePlnMwYear: 3750, insuranceOcPlnYear: 2500, otherPlnYear: 0 } },
    financingPv: { debtSharePct: 100, interestRate: 0, termYears: 10, graceMonths: 7, startYear: 2026, startMonth: 10 },
    financingStorage: { debtSharePct: 100, interestRate: 0, termYears: 10, graceMonths: 7, startYear: 2026, startMonth: 11 },
    applyCit: false,
    waccPct: 6.5,
    horizonYears: 20,
    description: "Model budżetowy „Lubelskie 4x1 MW” (Grzegorz  Budżet Farm PV  eksport 2026-09-17). CAPEX PV: 8 440 000 zł; CAPEX BESS 4 MW: 8 400 001 zł; razem 16 840 001 zł. Uruchomienie PV: luty 2027  BESS: marzec 2027. Produkcja: 1050 kWh/kWp/rok  degradacja 0.5%/rok. Cena: 350 zł/MWh (+3%/rok) + GO 2.5 zł/MWh; BESS 400 zł/MWh × 1500 MWh/MW/rok. OPEX: dzierżawa 18 500 zł/MW/rok  O&M 2 500 zł/MW/mc  podatek od nieruchomości 10 000 zł/MW/rok  podatek od budowli 2% × 600 000 zł/MW  ubezpieczenie 3 750 zł/MW/rok + OC 2 500 zł/rok  eskalacja 3%/rok. Finansowanie PV (założenie modelu): 100% dług  0%  10 lat  karencja 7 mc  rata malejąca  start październik 2026. Finansowanie BESS: 100% dług  0%  10 lat  karencja 7 mc  start listopad 2026. CIT nie stosowany (19%)  WACC 6.5%  horyzont 20 lat.",
  },
  {
    label: "Łubno 1MW",
    name: "Łubno",
    code: "PV-LUB",
    matchExistingProjectName: "Łubno",
    mwPower: 1,
    location: null,
    commissioningYear: 2027,
    commissioningMonth: 4,
    pvCapex: 2140000,
    storageCapex: 0,
    totalCapex: 2140000,
    pv: { yieldKwhPerKwp: 1050, degradationPct: 0.5, pricePlnMwh: 350, priceGoPlnMwh: 2.5, priceEscalationPct: 3, opexEscalationPct: 3, opex: { leasePlnMwYear: 12000, servicePlnMwMonth: 5000, propertyTaxPlnMwYear: 10000, buildingTaxPct: 2, buildingTaxBasePlnMw: 600000, insurancePlnMwYear: 3750, insuranceOcPlnYear: 2500, otherPlnYear: 0 } },
    storage: null,
    financingPv: { debtSharePct: 90, interestRate: 1, termYears: 10, graceMonths: 7, startYear: 2026, startMonth: 9 },
    financingStorage: null,
    applyCit: false,
    waccPct: 6.5,
    horizonYears: 20,
    description: "Model budżetowy „Łubno 1MW” (Grzegorz  Budżet Farm PV  eksport 2026-09-17). CAPEX PV: 2 140 000 zł; razem 2 140 000 zł. Uruchomienie PV: kwiecień 2027. Produkcja: 1050 kWh/kWp/rok  degradacja 0.5%/rok. Cena: 350 zł/MWh (+3%/rok) + GO 2.5 zł/MWh. OPEX: dzierżawa 12 000 zł/MW/rok  O&M 5 000 zł/MW/mc  podatek od nieruchomości 10 000 zł/MW/rok  podatek od budowli 2% × 600 000 zł/MW  ubezpieczenie 3 750 zł/MW/rok + OC 2 500 zł/rok  eskalacja 3%/rok. Finansowanie PV (założenie modelu): 90% dług  1%  10 lat  karencja 7 mc  rata malejąca  start wrzesień 2026. CIT nie stosowany (19%)  WACC 6.5%  horyzont 20 lat.",
  },
  {
    label: "Miejsce Piastowe 2MW",
    name: "Miejsce Piastowe",
    code: "PV-MP",
    matchExistingProjectName: "Miejsce Piastowe",
    mwPower: 2,
    location: "Miejsce Piastowe",
    commissioningYear: 2026,
    commissioningMonth: 6,
    pvCapex: 4104153,
    storageCapex: 4199999,
    totalCapex: 8304152,
    pv: { yieldKwhPerKwp: 1050, degradationPct: 0.5, pricePlnMwh: 350, priceGoPlnMwh: 2.5, priceEscalationPct: 3, opexEscalationPct: 3, opex: { leasePlnMwYear: 15000, servicePlnMwMonth: 2500, propertyTaxPlnMwYear: 10000, buildingTaxPct: 2, buildingTaxBasePlnMw: 600000, insurancePlnMwYear: 3750, insuranceOcPlnYear: 2500, otherPlnYear: 0 } },
    storage: { powerMw: 2, throughputMwhPerMw: 1500, commissioningYear: 2027, commissioningMonth: 9, pricePlnMwh: 400, degradationPct: 2, opex: { leasePlnMwYear: 2000, servicePlnMwMonth: 1000, propertyTaxPlnMwYear: 0, buildingTaxPct: 2, buildingTaxBasePlnMw: 300000, insurancePlnMwYear: 3750, insuranceOcPlnYear: 2500, otherPlnYear: 0 } },
    financingPv: { debtSharePct: 100, interestRate: 4.69, termYears: 10, graceMonths: 0, startYear: 2026, startMonth: 6 },
    financingStorage: { debtSharePct: 80, interestRate: 6.01, termYears: 10, graceMonths: 7, startYear: 2027, startMonth: 2 },
    applyCit: false,
    waccPct: 6.5,
    horizonYears: 20,
    description: "Model budżetowy „Miejsce Piastowe 2MW” (Grzegorz  Budżet Farm PV  eksport 2026-09-17). CAPEX PV: 4 104 153 zł; CAPEX BESS 2 MW: 4 199 999 zł; razem 8 304 152 zł. Uruchomienie PV: czerwiec 2026  BESS: wrzesień 2027. Produkcja: 1050 kWh/kWp/rok  degradacja 0.5%/rok. Cena: 350 zł/MWh (+3%/rok) + GO 2.5 zł/MWh; BESS 400 zł/MWh × 1500 MWh/MW/rok. OPEX: dzierżawa 15 000 zł/MW/rok  O&M 2 500 zł/MW/mc  podatek od nieruchomości 10 000 zł/MW/rok  podatek od budowli 2% × 600 000 zł/MW  ubezpieczenie 3 750 zł/MW/rok + OC 2 500 zł/rok  eskalacja 3%/rok. Finansowanie PV (założenie modelu): 100% dług  4.69%  10 lat  karencja 0 mc  rata malejąca  start czerwiec 2026. Finansowanie BESS: 80% dług  6.01%  10 lat  karencja 7 mc  start luty 2027. CIT nie stosowany (19%)  WACC 6.5%  horyzont 20 lat.",
  },
  {
    label: "Opole 5x1 MW",
    name: "Opole 5x1 MW",
    code: "PV-OPL",
    matchExistingProjectName: null,
    mwPower: 5,
    location: "woj. Opolskie",
    // KOREKTA Kamila 2026-09-18: w eksporcie Grzegorza "uruchomienie" = XI 2026
    // (ten sam miesiąc co start kredytu) — to jest start PRAC; przychód (i OPEX)
    // dopiero po 9 miesiącach, czyli od VIII 2027. Kredyt zostaje od XI 2026.
    commissioningYear: 2027,
    commissioningMonth: 8,
    pvCapex: 10040000,
    storageCapex: 0,
    totalCapex: 10040000,
    pv: { yieldKwhPerKwp: 1050, degradationPct: 0.5, pricePlnMwh: 350, priceGoPlnMwh: 2.5, priceEscalationPct: 3, opexEscalationPct: 3, opex: { leasePlnMwYear: 18500, servicePlnMwMonth: 2000, propertyTaxPlnMwYear: 10000, buildingTaxPct: 2, buildingTaxBasePlnMw: 600000, insurancePlnMwYear: 3750, insuranceOcPlnYear: 2500, otherPlnYear: 0 } },
    storage: null,
    financingPv: { debtSharePct: 80, interestRate: 6.01, termYears: 10, graceMonths: 0, startYear: 2026, startMonth: 11 },
    financingStorage: null,
    applyCit: false,
    waccPct: 6.5,
    horizonYears: 20,
    description: "Model budżetowy „Opole 5x1 MW” (Grzegorz  Budżet Farm PV  eksport 2026-09-17). CAPEX PV: 10 040 000 zł; razem 10 040 000 zł. Uruchomienie PV: listopad 2026. Produkcja: 1050 kWh/kWp/rok  degradacja 0.5%/rok. Cena: 350 zł/MWh (+3%/rok) + GO 2.5 zł/MWh. OPEX: dzierżawa 18 500 zł/MW/rok  O&M 2 000 zł/MW/mc  podatek od nieruchomości 10 000 zł/MW/rok  podatek od budowli 2% × 600 000 zł/MW  ubezpieczenie 3 750 zł/MW/rok + OC 2 500 zł/rok  eskalacja 3%/rok. Finansowanie PV (założenie modelu): 80% dług  6.01%  10 lat  karencja 0 mc  rata malejąca  start listopad 2026. CIT nie stosowany (19%)  WACC 6.5%  horyzont 20 lat.",
  },
  {
    label: "Poręba 6.5 MW",
    name: "Poręba",
    code: "PV-POR",
    matchExistingProjectName: "Poręba",
    mwPower: 6.5,
    location: null,
    commissioningYear: 2027,
    commissioningMonth: 6,
    pvCapex: 14300040,
    storageCapex: 0,
    totalCapex: 14300040,
    pv: { yieldKwhPerKwp: 1050, degradationPct: 0.5, pricePlnMwh: 450, priceGoPlnMwh: 2.5, priceEscalationPct: 3, opexEscalationPct: 3, opex: { leasePlnMwYear: 18500, servicePlnMwMonth: 1230, propertyTaxPlnMwYear: 10000, buildingTaxPct: 2, buildingTaxBasePlnMw: 600000, insurancePlnMwYear: 3750, insuranceOcPlnYear: 2500, otherPlnYear: 0 } },
    storage: null,
    financingPv: { debtSharePct: 80, interestRate: 6.81, termYears: 15, graceMonths: 7, startYear: 2027, startMonth: 3 },
    financingStorage: null,
    applyCit: false,
    waccPct: 6.5,
    horizonYears: 20,
    description: "Model budżetowy „Poręba 6.5 MW” (Grzegorz  Budżet Farm PV  eksport 2026-09-17). UWAGA: w oryginalnym pliku CAPEX miał dodatkowe 3 zera (błąd narzędzia) — podzielono przez 1000  potwierdzone przez Kamila 2026-09-17. CAPEX PV: 14 300 040 zł; razem 14 300 040 zł. Uruchomienie PV: czerwiec 2027. Produkcja: 1050 kWh/kWp/rok  degradacja 0.5%/rok. Cena: 450 zł/MWh (+3%/rok) + GO 2.5 zł/MWh. OPEX: dzierżawa 18 500 zł/MW/rok  O&M 1 230 zł/MW/mc  podatek od nieruchomości 10 000 zł/MW/rok  podatek od budowli 2% × 600 000 zł/MW  ubezpieczenie 3 750 zł/MW/rok + OC 2 500 zł/rok  eskalacja 3%/rok. Finansowanie PV (założenie modelu): 80% dług  6.81%  15 lat  karencja 7 mc  rata malejąca  start marzec 2027. CIT nie stosowany (19%)  WACC 6.5%  horyzont 20 lat.",
  },
  {
    label: "Wylewa 15 MW",
    name: "Wylewa",
    code: "PV-WYL",
    matchExistingProjectName: "Wylewa",
    mwPower: 15,
    location: null,
    commissioningYear: 2027,
    commissioningMonth: 6,
    pvCapex: 35040000,
    storageCapex: 0,
    totalCapex: 35040000,
    pv: { yieldKwhPerKwp: 1050, degradationPct: 0.5, pricePlnMwh: 350, priceGoPlnMwh: 2.5, priceEscalationPct: 3, opexEscalationPct: 3, opex: { leasePlnMwYear: 18500, servicePlnMwMonth: 500, propertyTaxPlnMwYear: 10000, buildingTaxPct: 2, buildingTaxBasePlnMw: 600000, insurancePlnMwYear: 3750, insuranceOcPlnYear: 2500, otherPlnYear: 0 } },
    storage: null,
    financingPv: { debtSharePct: 80, interestRate: 6.31, termYears: 15, graceMonths: 7, startYear: 2026, startMonth: 12 },
    financingStorage: null,
    applyCit: true,
    waccPct: 6.5,
    horizonYears: 20,
    description: "Model budżetowy „Wylewa 15 MW” (Grzegorz  Budżet Farm PV  eksport 2026-09-17). CAPEX PV: 35 040 000 zł; razem 35 040 000 zł. Uruchomienie PV: czerwiec 2027. Produkcja: 1050 kWh/kWp/rok  degradacja 0.5%/rok. Cena: 350 zł/MWh (+3%/rok) + GO 2.5 zł/MWh. OPEX: dzierżawa 18 500 zł/MW/rok  O&M 500 zł/MW/mc  podatek od nieruchomości 10 000 zł/MW/rok  podatek od budowli 2% × 600 000 zł/MW  ubezpieczenie 3 750 zł/MW/rok + OC 2 500 zł/rok  eskalacja 3%/rok. Finansowanie PV (założenie modelu): 80% dług  6.31%  15 lat  karencja 7 mc  rata malejąca  start grudzień 2026. CIT stosowany (19%)  WACC 6.5%  horyzont 20 lat.",
  },
];
