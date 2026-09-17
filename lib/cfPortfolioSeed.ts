// Portfel farm PV — dane z arkusza kontrolera "CF Farmy.xlsx"
// (zakładki: CF ROCZNY, Harmonogram, Koszty Finansowe), stan na wrzesień 2026.
//
// Używane WYŁĄCZNIE przez POST /api/admin/import-cf-portfolio (patrz ten
// plik) — jednorazowy/powtarzalny import realnych danych 11 farm (9 z
// modelu finansowego + 2 w akwizycji: Kamyk, Pieczyska) jako prawdziwe
// rekordy Projekt/Financing, zamiast pustego modułu Projekty.
//
// UWAGA co do dokładności:
// - "capex" to kwota z wiersza "Fundusz Inwestycyjny" w Harmonogramie —
//   czyli KAPITAŁ WŁASNY/FUNDUSZ potrzebny na dany projekt, NIE całkowity
//   CAPEX łącznie z finansowaniem dłużnym (to jest już w Financing).
// - startDate/endDate to ORIENTACYJNE granice wg kolorowego harmonogramu
//   kontrolera (pierwszy zaznaczony miesiąc pierwszego etapu -> pierwszy
//   miesiąc po ostatnim zaznaczonym etapie) — do potwierdzenia z
//   kontrolerem przy najbliższej aktualizacji harmonogramu.
// - Financing: dane z zakładki "Koszty Finansowe", NAJNOWSZY dostępny w
//   arkuszu miesiąc dla każdej pozycji (nie każda farma ma już uruchomione
//   finansowanie — patrz notes).
// - Revenue miesięczne per-farma NIE jest tu ustawiane na Project — projekcja
//   przychodów już istnieje zbiorczo w Założenia -> revenueMonthlySchedule
//   (DEFAULT_ASSUMPTIONS w app/api/bootstrap/route.ts), żeby nie liczyć
//   dwa razy tego samego przychodu na Dashboardzie.

export type CfPortfolioProject = {
  name: string;
  code: string;
  mwPower: number;
  energyBuyer: "Giełda" | "Spółdzielnia/Klaster" | null;
  capex: number | null;
  status: "DEVELOPMENT" | "POZWOLENIA" | "RTB" | "BUDOWA" | "OPERACYJNY";
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  description: string;
};

export type CfPortfolioFinancing = {
  projectName: string; // dopasowanie po Project.name
  lender: string;
  subject?: string;
  type: "LEASING_OPERACYJNY" | "LEASING_FINANSOWY" | "KREDYT_INWESTYCYJNY" | "KREDYT_OBROTOWY" | "POZYCZKA" | "INNE";
  initialAmount: number | null;
  remainingBalance: number | null;
  monthlyPayment: number;
  numInstallments: number | null;
  interestRate: number | null; // % rocznie
  nextPaymentDate: string | null;
  notes: string;
};

export const CF_PORTFOLIO_PROJECTS: CfPortfolioProject[] = [
  {
    name: "Miejsce Piastowe",
    code: "PV-MP",
    mwPower: 2,
    energyBuyer: "Giełda",
    capex: null,
    status: "OPERACYJNY",
    startDate: null,
    endDate: null,
    description:
      "Farma już operacyjna (przychody od sierpnia 2026 — patrz Założenia/harmonogram przychodów). Data uruchomienia historyczna, nieznana z arkusza — do uzupełnienia ręcznego, jeśli potrzebna."
  },
  {
    name: "Dębowiec",
    code: "PV-DEB",
    mwPower: 1,
    energyBuyer: "Giełda",
    capex: 0,
    status: "BUDOWA",
    startDate: "2026-09-01",
    endDate: "2027-02-01",
    description:
      "Budowa: wrzesień–listopad 2026. Odbiór zakładu energetycznego: grudzień 2026–styczeń 2027. Uruchomienie orientacyjnie luty 2027. Finansowanie: Pożyczka LFR (patrz Financing) — Fundusz Inwestycyjny = 0 (finansowanie w całości dłużne wg harmonogramu)."
  },
  {
    name: "Łubno",
    code: "PV-LUB",
    mwPower: 1,
    energyBuyer: "Giełda",
    capex: 210000,
    status: "BUDOWA",
    startDate: "2026-09-01",
    endDate: "2027-03-01",
    description:
      "Budowa: wrzesień–grudzień 2026. Odbiór: styczeń–luty 2027. Uruchomienie orientacyjnie marzec 2027. Fundusz Inwestycyjny: 210 000 zł (2 raty)."
  },
  {
    name: "Skrzypaczowice",
    code: "PV-SKRZYP",
    mwPower: 3,
    energyBuyer: "Spółdzielnia/Klaster",
    capex: 1340000,
    status: "POZWOLENIA",
    startDate: "2026-09-01",
    endDate: "2028-03-01",
    description:
      "Pozwolenie na budowę: wrzesień 2026–luty 2027. Uzgodnienie przyłącza: marzec–czerwiec 2027. Budowa: lipiec–grudzień 2027. Odbiór: styczeń–luty 2028. Fundusz Inwestycyjny: 1 340 000 zł. Finansowanie: Pożyczka SFR, planowana kwota 5 000 000 zł / 7 lat, jeszcze nieuruchomiona (patrz Financing)."
  },
  {
    name: "F8 Wysoka Strzyżowska",
    code: "PV-F8",
    mwPower: 1,
    energyBuyer: "Giełda",
    capex: 312300,
    status: "DEVELOPMENT",
    startDate: "2026-09-01",
    endDate: "2028-06-01",
    description:
      "Etap: warunki przyłączenia (wrzesień 2026–luty 2027), dalej dokumentacja/pozwolenia/budowa do kwietnia–maja 2028 (odbiór zakładu energetycznego). Fundusz Inwestycyjny: 312 300 zł. Finansowanie: wg harmonogramu kontrolera „będziemy szukać finansowania” — jeszcze nieustalone, brak rekordu Financing."
  },
  {
    name: "F9 Chludowo",
    code: "PV-F9",
    mwPower: 2,
    energyBuyer: "Giełda",
    capex: 1002300,
    status: "DEVELOPMENT",
    startDate: "2026-09-01",
    endDate: "2028-06-01",
    description:
      "Etap: warunki przyłączenia (wrzesień 2026–luty 2027), dalej dokumentacja/pozwolenia/budowa do kwietnia–maja 2028 (odbiór zakładu energetycznego). Fundusz Inwestycyjny: 1 002 300 zł. Finansowanie rynkowe — kwota docelowa ok. 3 360 000 zł, jeszcze nieuruchomione."
  },
  {
    name: "Ziempniów",
    code: "PV-ZIE",
    mwPower: 2,
    energyBuyer: "Giełda",
    capex: 162300,
    status: "DEVELOPMENT",
    startDate: "2026-09-01",
    endDate: "2028-06-01",
    description:
      "Etap: warunki przyłączenia (wrzesień 2026–luty 2027), dalej dokumentacja/pozwolenia/budowa do kwietnia–maja 2028 (odbiór zakładu energetycznego). Fundusz Inwestycyjny: 162 300 zł. Finansowanie (Pożyczka LFR) jeszcze nieustalone w arkuszu — brak rekordu Financing."
  },
  {
    name: "Wylewa",
    code: "PV-WYL",
    mwPower: 15,
    energyBuyer: "Spółdzielnia/Klaster",
    capex: 4280000,
    status: "RTB",
    startDate: "2026-09-01",
    endDate: "2027-06-01",
    description:
      "Projekt techniczny i budowlany + uzgodnienia: wrzesień–październik 2026. Budowa: listopad 2026–marzec 2027. Odbiór: kwiecień–maj 2027. Fundusz Inwestycyjny: 4 280 000 zł. Finansowanie: kredyt BOŚ, 10 lat (patrz Financing)."
  },
  {
    name: "Poręba",
    code: "PV-POR",
    mwPower: 6.5,
    energyBuyer: "Spółdzielnia/Klaster",
    capex: 3342000,
    status: "POZWOLENIA",
    startDate: "2026-09-01",
    endDate: "2027-10-01",
    description:
      "Pozwolenie na budowę: wrzesień–grudzień 2026. Projekt techniczny: styczeń–luty 2027. Budowa: marzec–lipiec 2027. Odbiór: sierpień–wrzesień 2027. Fundusz Inwestycyjny: 3 342 000 zł. Finansowanie: Pożyczka LFR, planowana kwota 10 920 000 zł / 10 lat, jeszcze nieuruchomiona (patrz Financing). Projekt do zakupu."
  },
  {
    name: "Kamyk",
    code: "PV-KAM",
    mwPower: 1.4,
    energyBuyer: null,
    capex: 220000,
    status: "RTB",
    startDate: "2026-10-01",
    endDate: "2027-04-01",
    description:
      "PROJEKT DO ZAKUPU (RTB) — jeszcze nie własność FFP, harmonogram poglądowy zakładający zakup i realizację: budowa październik 2026–styczeń 2027, odbiór luty–marzec 2027. Fundusz Inwestycyjny: 220 000 zł. Nie ujęty w zakładce CF ROCZNY (poza głównym modelem finansowym do czasu zakupu)."
  },
  {
    name: "Pieczyska",
    code: "PV-PIE",
    mwPower: 1,
    energyBuyer: null,
    capex: 220000,
    status: "RTB",
    startDate: "2026-10-01",
    endDate: "2027-04-01",
    description:
      "PROJEKT DO ZAKUPU (RTB) — jeszcze nie własność FFP, harmonogram poglądowy zakładający zakup i realizację: budowa październik 2026–styczeń 2027, odbiór luty–marzec 2027. Fundusz Inwestycyjny: 220 000 zł. Nie ujęty w zakładce CF ROCZNY (poza głównym modelem finansowym do czasu zakupu)."
  }
];

export const CF_PORTFOLIO_FINANCINGS: CfPortfolioFinancing[] = [
  {
    projectName: "Miejsce Piastowe",
    lender: "Leasing (CF Farmy — kontroler)",
    subject: "Instalacja PV 2 MW",
    type: "LEASING_FINANSOWY",
    initialAmount: 4104152.25,
    remainingBalance: 4078690.89,
    monthlyPayment: 25601.19,
    numInstallments: 120,
    interestRate: 6.59, // marża 2,78% + WIBOR 1M 3,81% (wrzesień 2026)
    nextPaymentDate: "2026-10-01",
    notes: "10 lat. Stan na wrzesień 2026 wg zakładki „Koszty Finansowe” arkusza kontrolera. Rata rośnie nieznacznie miesiąc do miesiąca (harmonogram malejący z odsetkami od WIBOR 1M)."
  },
  {
    projectName: "Dębowiec",
    lender: "Pożyczka LFR",
    type: "POZYCZKA",
    initialAmount: 1890000,
    remainingBalance: 1890000,
    monthlyPayment: 0,
    numInstallments: 120,
    interestRate: 1.0,
    nextPaymentDate: null,
    notes: "10 lat, okres karencji — spłata kapitału jeszcze nie ruszyła (odsetki bieżące ok. 1 575 zł/mies. przy marży 1%). Stan wg arkusza kontrolera, wrzesień 2026."
  },
  {
    projectName: "Łubno",
    lender: "Pożyczka LFR",
    type: "POZYCZKA",
    initialAmount: 1890000,
    remainingBalance: 1890000,
    monthlyPayment: 0,
    numInstallments: 120,
    interestRate: 1.0,
    nextPaymentDate: null,
    notes: "10 lat, okres karencji — spłata kapitału jeszcze nie ruszyła. Stan wg arkusza kontrolera, październik 2026 (pierwszy miesiąc z danymi)."
  },
  {
    projectName: "Skrzypaczowice",
    lender: "Pożyczka SFR",
    type: "POZYCZKA",
    initialAmount: 5000000,
    remainingBalance: 0,
    monthlyPayment: 0,
    numInstallments: 84,
    interestRate: null,
    nextPaymentDate: null,
    notes: "7 lat, planowana kwota 5 000 000 zł — jeszcze NIEURUCHOMIONA (brak wypłaty wg arkusza kontrolera na wrzesień 2026). Do zaktualizowania po podpisaniu umowy."
  },
  {
    projectName: "F9 Chludowo",
    lender: "Finansowanie rynkowe (do ustalenia)",
    type: "KREDYT_INWESTYCYJNY",
    initialAmount: 3360000,
    remainingBalance: 3360000,
    monthlyPayment: 0,
    numInstallments: 120,
    interestRate: null,
    nextPaymentDate: null,
    notes: "10 lat, kwota docelowa ok. 3 360 000 zł — forma i warunki finansowania jeszcze nieustalone wg arkusza kontrolera (wrzesień 2026). Do zaktualizowania po wyborze finansującego."
  },
  {
    projectName: "Wylewa",
    lender: "BOŚ Bank",
    subject: "Kredyt inwestycyjny — instalacja PV 15 MW + BESS",
    type: "KREDYT_INWESTYCYJNY",
    initialAmount: 28760000,
    remainingBalance: 28520333.33,
    monthlyPayment: 239666.67,
    numInstallments: 120,
    interestRate: 7.31, // marża 3,5% + WIBOR 1M 3,81% (październik 2026)
    nextPaymentDate: "2026-11-01",
    notes: "10 lat. Stan na październik 2026 (pierwszy miesiąc z danymi w arkuszu kontrolera) — kredyt uruchomiony."
  },
  {
    projectName: "Poręba",
    lender: "Pożyczka LFR",
    type: "POZYCZKA",
    initialAmount: 10920000,
    remainingBalance: 10920000,
    monthlyPayment: 0,
    numInstallments: 120,
    interestRate: null,
    nextPaymentDate: null,
    notes: "10 lat, planowana kwota 10 920 000 zł — jeszcze NIEURUCHOMIONA wg arkusza kontrolera (wrzesień 2026). Projekt w akwizycji."
  }
];
