// Model budżetowy farm PV — dane z narzędzia "Budżet Farm PV" (Grzegorz),
// eksport pv-budget-dane_2026-09-17.json.
//
// Różnica względem lib/cfPortfolioSeed.ts: to narzędzie liczy szczegółowy
// budżet/IRR projektu (rozbity CAPEX, OPEX, cena energii z eskalacją, WACC,
// CIT) — czyli MODEL/ZAŁOŻENIA do analiz opłacalności, NIE rzeczywiste
// podpisane umowy kredytowe. Dlatego:
// - dla farm już istniejących w portfelu (Dębowiec, Łubno, Miejsce Piastowe,
//   Poręba, Wylewa) NIE nadpisujemy mwPower/capex/status/dat — te pola mają
//   już spójne, potwierdzone znaczenie z importu CF Farmy.xlsx (patrz
//   lib/cfPortfolioSeed.ts). Dopisujemy tylko bogaty opis modelu do
//   Project.description i tworzymy osobne rekordy Financing oznaczone
//   excludeFromSimulation=true (widoczne w karcie projektu, ale NIE liczone
//   do bieżącego zadłużenia/cash-flow firmy — bo to założenie, nie fakt).
// - dla dwóch NOWYCH projektów (Lubelskie 4x1 MW, Opole 5x1 MW), których nie
//   ma w ogóle w portfelu, tworzymy pełny rekord Project + Financing (też
//   excludeFromSimulation=true — to wczesna koncepcja, nie zatwierdzony
//   projekt).
//
// Rozstrzygnięcia zatwierdzone przez Kamila 2026-09-17:
// - duplikaty "Wylewa 15 MW" i "Lubelskie 4x1 MW": wzięta wersja edytowana
//   rano 2026-09-17 (nie starsza wersja z nazwą z końcową spacją).
// - duplikat "Miejsce Piastowe 2MW": wzięta wersja Z magazynem energii (BESS).
// - "Poręba 6.5 MW": rozbity CAPEX w oryginalnym pliku miał dodatkowe 3 zera
//   (błąd narzędzia Grzegorza) — skorygowane /1000 za zgodą Kamila.

export type PvBudgetFinancing = { debtSharePct: number; interestRate: number; termYears: number; graceMonths: number; startYear: number; startMonth: number };

export type PvBudgetEntry = {
  label: string;
  matchExistingProjectName: string | null; // null = nowy projekt, do utworzenia
  mwPower: number;
  location: string | null;
  commissioningYear: number;
  commissioningMonth: number; // 1-12
  pvCapex: number;
  storageCapex: number;
  totalCapex: number;
  description: string;
  financingPv: PvBudgetFinancing;
  financingStorage: PvBudgetFinancing | null;
};

export const PV_BUDGET_ENTRIES: PvBudgetEntry[] = [
  {
    label: "Dębowiec 1 MW",
    matchExistingProjectName: "Dębowiec",
    mwPower: 1.0,
    location: null,
    commissioningYear: 2027,
    commissioningMonth: 2,
    pvCapex: 2140000,
    storageCapex: 0,
    totalCapex: 2140000,
    description: "Model budżetowy „Dębowiec 1 MW” (Grzegorz, narzędzie Budżet Farm PV, eksport 2026-09-17). CAPEX PV: 2 140 000 zł (2 100 000 zł/MW deklarowane). CAPEX razem (PV+BESS): 2 140 000 zł. Uruchomienie PV planowane: luty 2027. OPEX: dzierżawa 19 000 zł/MW/rok, obsługa techniczna 5 000 zł/MW/mc, podatek od nieruchomości 10 000 zł/MW/rok, eskalacja OPEX 3%/rok. Przychód: 350 zł/MWh (+3%/rok) + GO 2.5 zł/MWh, uzysk 1050 kWh/kWp/rok, degradacja 0.5%/rok. Finansowanie PV (założenie modelu, NIE rzeczywista umowa): 90% dług, WIBOR 0% + marża 1% = 1.00%, 10 lat, karencja 7 mc, rata malejąca, start wrzesień 2026. Podatek CIT: nie stosowany w modelu (19%), WACC 6.5%, stopa dyskonta equity 10%, horyzont 20 lat.",
    financingPv: { debtSharePct: 90, interestRate: 1, termYears: 10, graceMonths: 7, startYear: 2026, startMonth: 9 },
    financingStorage: null
  },
  {
    label: "Lubelskie 4x1 MW",
    matchExistingProjectName: null,
    mwPower: 4.0,
    location: "woj. Lubelskie",
    commissioningYear: 2027,
    commissioningMonth: 2,
    pvCapex: 8440000,
    storageCapex: 8400001,
    totalCapex: 16840001,
    description: "Model budżetowy „Lubelskie 4x1 MW” (Grzegorz, narzędzie Budżet Farm PV, eksport 2026-09-17). CAPEX PV: 8 440 000 zł (2 100 000 zł/MW deklarowane). CAPEX BESS 4 MW / 1500 MWh na MW: 8 400 001 zł. CAPEX razem (PV+BESS): 16 840 001 zł. Uruchomienie PV planowane: luty 2027. OPEX: dzierżawa 18 500 zł/MW/rok, obsługa techniczna 2 500 zł/MW/mc, podatek od nieruchomości 10 000 zł/MW/rok, eskalacja OPEX 3%/rok. Przychód: 350 zł/MWh (+3%/rok) + GO 2.5 zł/MWh, uzysk 1050 kWh/kWp/rok, degradacja 0.5%/rok. Finansowanie PV (założenie modelu, NIE rzeczywista umowa): 100% dług, WIBOR 0% + marża 0% = 0.00%, 10 lat, karencja 7 mc, rata malejąca, start październik 2026. Finansowanie BESS (założenie modelu): 100% dług, WIBOR 0% + marża 0% = 0.00%, 10 lat, karencja 7 mc, start listopad 2026. Podatek CIT: nie stosowany w modelu (19%), WACC 6.5%, stopa dyskonta equity 10%, horyzont 20 lat.",
    financingPv: { debtSharePct: 100, interestRate: 0, termYears: 10, graceMonths: 7, startYear: 2026, startMonth: 10 },
    financingStorage: { debtSharePct: 100, interestRate: 0, termYears: 10, graceMonths: 7, startYear: 2026, startMonth: 11 }
  },
  {
    label: "Łubno 1MW",
    matchExistingProjectName: "Łubno",
    mwPower: 1.0,
    location: null,
    commissioningYear: 2027,
    commissioningMonth: 4,
    pvCapex: 2140000,
    storageCapex: 0,
    totalCapex: 2140000,
    description: "Model budżetowy „Łubno 1MW” (Grzegorz, narzędzie Budżet Farm PV, eksport 2026-09-17). CAPEX PV: 2 140 000 zł (2 100 000 zł/MW deklarowane). CAPEX razem (PV+BESS): 2 140 000 zł. Uruchomienie PV planowane: kwiecień 2027. OPEX: dzierżawa 12 000 zł/MW/rok, obsługa techniczna 5 000 zł/MW/mc, podatek od nieruchomości 10 000 zł/MW/rok, eskalacja OPEX 3%/rok. Przychód: 350 zł/MWh (+3%/rok) + GO 2.5 zł/MWh, uzysk 1050 kWh/kWp/rok, degradacja 0.5%/rok. Finansowanie PV (założenie modelu, NIE rzeczywista umowa): 90% dług, WIBOR 0% + marża 1% = 1.00%, 10 lat, karencja 7 mc, rata malejąca, start wrzesień 2026. Podatek CIT: nie stosowany w modelu (19%), WACC 6.5%, stopa dyskonta equity 10%, horyzont 20 lat.",
    financingPv: { debtSharePct: 90, interestRate: 1, termYears: 10, graceMonths: 7, startYear: 2026, startMonth: 9 },
    financingStorage: null
  },
  {
    label: "Miejsce Piastowe 2MW",
    matchExistingProjectName: "Miejsce Piastowe",
    mwPower: 2.0,
    location: null,
    commissioningYear: 2026,
    commissioningMonth: 6,
    pvCapex: 4104153,
    storageCapex: 4199999,
    totalCapex: 8304152,
    description: "Model budżetowy „Miejsce Piastowe 2MW” (Grzegorz, narzędzie Budżet Farm PV, eksport 2026-09-17). CAPEX PV: 4 104 153 zł (2 052 076 zł/MW deklarowane). CAPEX BESS 2 MW / 1500 MWh na MW: 4 199 999 zł. CAPEX razem (PV+BESS): 8 304 152 zł. Uruchomienie PV planowane: czerwiec 2026. OPEX: dzierżawa 15 000 zł/MW/rok, obsługa techniczna 2 500 zł/MW/mc, podatek od nieruchomości 10 000 zł/MW/rok, eskalacja OPEX 3%/rok. Przychód: 350 zł/MWh (+3%/rok) + GO 2.5 zł/MWh, uzysk 1050 kWh/kWp/rok, degradacja 0.5%/rok. Finansowanie PV (założenie modelu, NIE rzeczywista umowa): 100% dług, WIBOR 3.81% + marża 0.88% = 4.69%, 10 lat, karencja 0 mc, rata malejąca, start czerwiec 2026. Finansowanie BESS (założenie modelu): 80% dług, WIBOR 3.81% + marża 2.2% = 6.01%, 10 lat, karencja 7 mc, start luty 2027. Podatek CIT: nie stosowany w modelu (19%), WACC 6.5%, stopa dyskonta equity 10%, horyzont 20 lat.",
    financingPv: { debtSharePct: 100, interestRate: 4.69, termYears: 10, graceMonths: 0, startYear: 2026, startMonth: 6 },
    financingStorage: { debtSharePct: 80, interestRate: 6.01, termYears: 10, graceMonths: 7, startYear: 2027, startMonth: 2 }
  },
  {
    label: "Opole 5x1 MW",
    matchExistingProjectName: null,
    mwPower: 5.0,
    location: "woj. Opolskie",
    commissioningYear: 2026,
    commissioningMonth: 11,
    pvCapex: 10040000,
    storageCapex: 0,
    totalCapex: 10040000,
    description: "Model budżetowy „Opole 5x1 MW” (Grzegorz, narzędzie Budżet Farm PV, eksport 2026-09-17). CAPEX PV: 10 040 000 zł (2 000 000 zł/MW deklarowane). CAPEX razem (PV+BESS): 10 040 000 zł. Uruchomienie PV planowane: listopad 2026. OPEX: dzierżawa 18 500 zł/MW/rok, obsługa techniczna 2 000 zł/MW/mc, podatek od nieruchomości 10 000 zł/MW/rok, eskalacja OPEX 3%/rok. Przychód: 350 zł/MWh (+3%/rok) + GO 2.5 zł/MWh, uzysk 1050 kWh/kWp/rok, degradacja 0.5%/rok. Finansowanie PV (założenie modelu, NIE rzeczywista umowa): 80% dług, WIBOR 3.81% + marża 2.2% = 6.01%, 10 lat, karencja 0 mc, rata malejąca, start listopad 2026. Podatek CIT: nie stosowany w modelu (19%), WACC 6.5%, stopa dyskonta equity 10%, horyzont 20 lat.",
    financingPv: { debtSharePct: 80, interestRate: 6.01, termYears: 10, graceMonths: 0, startYear: 2026, startMonth: 11 },
    financingStorage: null
  },
  {
    label: "Poręba 6.5 MW",
    matchExistingProjectName: "Poręba",
    mwPower: 6.5,
    location: null,
    commissioningYear: 2027,
    commissioningMonth: 6,
    pvCapex: 14300040.0,
    storageCapex: 0,
    totalCapex: 14300040.0,
    description: "Model budżetowy „Poręba 6.5 MW” (Grzegorz, narzędzie Budżet Farm PV, eksport 2026-09-17). UWAGA: w oryginalnym pliku rozbity CAPEX miał dodatkowe 3 zera (błąd narzędzia) — wartości poniżej zostały już podzielone przez 1000, potwierdzone przez Kamila 2026-09-17. CAPEX PV: 14 300 040 zł (2 200 000 zł/MW deklarowane). CAPEX razem (PV+BESS): 14 300 040 zł. Uruchomienie PV planowane: czerwiec 2027. OPEX: dzierżawa 18 500 zł/MW/rok, obsługa techniczna 1 230 zł/MW/mc, podatek od nieruchomości 10 000 zł/MW/rok, eskalacja OPEX 3%/rok. Przychód: 450 zł/MWh (+3%/rok) + GO 2.5 zł/MWh, uzysk 1050 kWh/kWp/rok, degradacja 0.5%/rok. Finansowanie PV (założenie modelu, NIE rzeczywista umowa): 80% dług, WIBOR 3.81% + marża 3% = 6.81%, 15 lat, karencja 7 mc, rata malejąca, start marzec 2027. Podatek CIT: nie stosowany w modelu (19%), WACC 6.5%, stopa dyskonta equity 10%, horyzont 20 lat.",
    financingPv: { debtSharePct: 80, interestRate: 6.81, termYears: 15, graceMonths: 7, startYear: 2027, startMonth: 3 },
    financingStorage: null
  },
  {
    label: "Wylewa 15 MW",
    matchExistingProjectName: "Wylewa",
    mwPower: 15.0,
    location: null,
    commissioningYear: 2027,
    commissioningMonth: 6,
    pvCapex: 35040000,
    storageCapex: 0,
    totalCapex: 35040000,
    description: "Model budżetowy „Wylewa 15 MW” (Grzegorz, narzędzie Budżet Farm PV, eksport 2026-09-17). CAPEX PV: 35 040 000 zł (2 333 333 zł/MW deklarowane). CAPEX razem (PV+BESS): 35 040 000 zł. Uruchomienie PV planowane: czerwiec 2027. OPEX: dzierżawa 18 500 zł/MW/rok, obsługa techniczna 500 zł/MW/mc, podatek od nieruchomości 10 000 zł/MW/rok, eskalacja OPEX 3%/rok. Przychód: 350 zł/MWh (+3%/rok) + GO 2.5 zł/MWh, uzysk 1050 kWh/kWp/rok, degradacja 0.5%/rok. Finansowanie PV (założenie modelu, NIE rzeczywista umowa): 80% dług, WIBOR 3.81% + marża 2.5% = 6.31%, 15 lat, karencja 7 mc, rata malejąca, start grudzień 2026. Podatek CIT: stosowany (19%), WACC 6.5%, stopa dyskonta equity 10%, horyzont 20 lat.",
    financingPv: { debtSharePct: 80, interestRate: 6.31, termYears: 15, graceMonths: 7, startYear: 2026, startMonth: 12 },
    financingStorage: null
  },
];
