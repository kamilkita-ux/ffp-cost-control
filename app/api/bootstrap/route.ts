import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  serializeDepartment,
  serializeProject,
  serializeEmployee,
  serializeVendor,
  serializeCost,
  serializeContract,
  serializeFinancing,
  serializeDocument
} from "@/lib/serialize";
import { currentLogin, isRestrictedUser } from "@/lib/access";
import { computeServerMetrics, redactEmployeeSalary, redactFixedCostLineItem } from "@/lib/serverMetrics";

export const dynamic = "force-dynamic";

const DEFAULT_CATEGORIES = [
  "Pracownicy", "Development", "Dzierżawy", "Projekty budowlane", "Geodezja", "Prawnicy",
  "Notariusz", "Warunki przyłączenia", "Opłaty operatorów", "Administracja", "Środowisko",
  "Banki", "Finansowanie", "Wykonawcy", "Serwis", "IT", "Doradcy", "Inne"
];
const DEFAULT_COST_CENTERS = ["Centrala", "Zarząd", "Development", "Realizacja", "Projekty PV", "Magazyny energii"];

// Założenia finansowe — wartości domyślne przeniesione z arkusza kontrolera
// "CF Farmy.xlsx" (zakładka: Założenia), stan na wrzesień 2026. Edytowalne
// z modułu "Założenia" (zapis: PUT /api/settings, key="assumptions").
const DEFAULT_ASSUMPTIONS = {
  source: "Arkusz kontrolera — CF Farmy.xlsx, zakładka „Założenia” (wrzesień 2026)",
  productionProfile: {
    "styczeń": 0.02, "luty": 0.03, "marzec": 0.08, "kwiecień": 0.11,
    "maj": 0.14, "czerwiec": 0.13, "lipiec": 0.14, "sierpień": 0.11,
    "wrzesień": 0.09, "październik": 0.08, "listopad": 0.04, "grudzień": 0.03
  },
  cenaEnergiiGielda: 340, // zł/MWh
  cenaEnergiiSpoldzielnia: 450, // zł/MWh (Spółdzielnia/Klaster)
  podatekOdBudowliWartoscInwestycji: 600000, // zł/MW — wartość inwestycji do opodatkowania
  podatekOdBudowliOprocentowanie: 0.02, // %
  podatekOdNieruchomosci: 10000, // zł/MW
  sredniKosztDzierzawy: 18500, // zł/ha
  kosztyObslugiTechnicznej: { "1MW": 3000, "2MW": 2500, "3MW": 1600, "4MW": 1500 }, // zł/MW, wg wielkości farmy
  ubezpieczenieMajatkowe: 3750, // zł/MW
  ubezpieczenieOC: 2500, // zł
  kursEUR: 4.4,
  inflacja: 0.03
};

// Harmonogram kosztów stałych — wartości domyślne z arkusza kontrolera
// "CF Farmy.xlsx" (zakładka: Koszty Stałe), stan na wrzesień 2026.
// UWAGA: to dane REFERENCYJNE/budżetowe od kontrolera — nie są automatycznie
// wliczane do bieżących wskaźników (Koszty pracowników / mies. itp.), żeby
// uniknąć podwójnego liczenia z danymi już wprowadzonymi w Pracownikach/
// Kosztach. Do potwierdzenia z kontrolerem, czy pozycje osobowe poniżej
// (Michał, Maciek, Natalia, Marek, Grzegorz Woźniak) mają odpowiedniki w
// module Pracownicy — jeśli tak, dane są tam, nie tutaj.
const DEFAULT_FIXED_COST_SCHEDULE = {
  asOfLabel: "wrzesień 2026",
  source: "Arkusz kontrolera — CF Farmy.xlsx, zakładka „Koszty Stałe”",
  lineItems: [
    { name: "Koszty pracownicze 10 osób Rzeszów", current: 50000, future12m: 100000, note: "Koszty pracownicze EVERCON od września 2026 płatne 50 kPLN miesięcznie. Dzisiaj 50% kosztów pokrywają FFP, 50% LC ENERGY. Po osiągnięciu odpowiedniego poziomu rozwoju FFP nastąpi rezygnacja ze współpracy ze LC ENERGY, co spowoduje przejęcie całości finansowania 100 kPLN. Planowane za 12 miesięcy." },
    { name: "Biuro Zarządu / Michał B2B", current: 12000, future12m: 12000, note: "" },
    { name: "Kontroling - Maciek B2B", current: 15000, future12m: 15000, note: "" },
    { name: "Katowice Księgowość B2B", current: 8000, future12m: 8000, note: "Przy większej ilości spółek fotowoltaicznych nastąpi wzrost kosztów księgowych, ok 400 zł za spółkę." },
    { name: "Handlowiec Gdańsk / Natalia B2B", current: 5000, future12m: 5000, note: "Do zastanowienia się nad zasadnością utrzymywania Pani Natalii. Celem jest pozyskiwanie nowych projektów i sprzedaż energii." },
    { name: "Kierownik budowy - Rzeszów B2B", current: 0, future12m: 10000, note: "Na razie koszt pokrywany przez EVERCON. Docelowo przy zwiększonej ilości farm przejście do FFP." },
    { name: "IT - Marek - B2B", current: 10000, future12m: 15000, note: "Umówiony koszt miesięczny. Na dzisiaj nie płacony regularnie. Zaległości będą rozliczone akcjami. Określić poziom zaległości." },
    { name: "Prawnik Rzeszów B2B", current: 0, future12m: 5000, note: "Na razie koszt pokrywany przez EVERCON. Docelowo przejście do FFP." },
    { name: "Koszty Giełdowe/Biura itp.", current: 10000, future12m: 10000, note: "Koszty obsługi giełdy, biura zarządu administracji. Przyjęta średnia wartość." },
    { name: "Najem Lokalu", current: 4000, future12m: 10000, note: "Zwiększenie do 10 kPLN, docelowo po uzyskaniu BEP." },
    { name: "Grzegorz Woźniak", current: 24638.4, future12m: 24638.4, note: "" }
  ],
  monthlySchedule: [
    { period: "2026-09", label: "Wrzesień 2026", wynagrodzenia: 106638.4, uslugi: 18000, biuro: 10000, najem: 4000, suma: 138638.4 },
    { period: "2026-10", label: "Październik 2026", wynagrodzenia: 106638.4, uslugi: 18000, biuro: 10000, najem: 4000, suma: 138638.4 },
    { period: "2026-11", label: "Listopad 2026", wynagrodzenia: 106638.4, uslugi: 18000, biuro: 10000, najem: 4000, suma: 138638.4 },
    { period: "2026-12", label: "Grudzień 2026", wynagrodzenia: 106638.4, uslugi: 18000, biuro: 10000, najem: 4000, suma: 138638.4 },
    { period: "2027-01", label: "Styczeń 2027", wynagrodzenia: 106638.4, uslugi: 18000, biuro: 10000, najem: 4000, suma: 138638.4 },
    { period: "2027-02", label: "Luty 2027", wynagrodzenia: 106638.4, uslugi: 18000, biuro: 10000, najem: 4000, suma: 138638.4 },
    { period: "2027-03", label: "Marzec 2027", wynagrodzenia: 106638.4, uslugi: 18000, biuro: 10000, najem: 4000, suma: 138638.4 },
    { period: "2027-04", label: "Kwiecień 2027", wynagrodzenia: 106638.4, uslugi: 18000, biuro: 10000, najem: 4000, suma: 138638.4 },
    { period: "2027-05", label: "Maj 2027", wynagrodzenia: 106638.4, uslugi: 18000, biuro: 10000, najem: 4000, suma: 138638.4 },
    { period: "2027-06", label: "Czerwiec 2027", wynagrodzenia: 106638.4, uslugi: 18000, biuro: 10000, najem: 4000, suma: 138638.4 },
    { period: "2027-07", label: "Lipiec 2027", wynagrodzenia: 106638.4, uslugi: 18000, biuro: 10000, najem: 4000, suma: 138638.4 },
    { period: "2027-08", label: "Sierpień 2027", wynagrodzenia: 106638.4, uslugi: 18000, biuro: 10000, najem: 4000, suma: 138638.4 },
    { period: "2027-09", label: "Wrzesień 2027", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2027-10", label: "Październik 2027", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2027-11", label: "Listopad 2027", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2027-12", label: "Grudzień 2027", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2028-01", label: "Styczeń 2028", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2028-02", label: "Luty 2028", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2028-03", label: "Marzec 2028", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2028-04", label: "Kwiecień 2028", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2028-05", label: "Maj 2028", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2028-06", label: "Czerwiec 2028", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2028-07", label: "Lipiec 2028", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2028-08", label: "Sierpień 2028", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2028-09", label: "Wrzesień 2028", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2028-10", label: "Październik 2028", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2028-11", label: "Listopad 2028", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 },
    { period: "2028-12", label: "Grudzień 2028", wynagrodzenia: 156638.4, uslugi: 38000, biuro: 10000, najem: 10000, suma: 214638.4 }
  ],
  // Harmonogram PRZYCHODÓW — z arkusza kontrolera "CF Farmy.xlsx", zakładka
  // "CF Miesięczny" (suma przychodów wszystkich projektów wg zakładanego
  // uruchomienia — Miejsce Piastowe już działa, kolejne wg planu rozwoju).
  // UWAGA: to ZAŁOŻENIE kontrolera co do tempa uruchamiania kolejnych farm,
  // nie dane z kart projektów w module Projekty — używane WYŁĄCZNIE w
  // projekcji okresowej na Dashboardzie (Wyniki wg okresu) dla miesięcy,
  // które ten harmonogram obejmuje (2026-08 do 2028-12); poza tym zakresem
  // projekcja wraca do bieżącego, płaskiego run-rate.
  revenueMonthlySchedule: [
    { period: "2026-08", label: "Sierpień 2026", suma: 74800 },
    { period: "2026-09", label: "Wrzesień 2026", suma: 61200 },
    { period: "2026-10", label: "Październik 2026", suma: 54400 },
    { period: "2026-11", label: "Listopad 2026", suma: 27200 },
    { period: "2026-12", label: "Grudzień 2026", suma: 20400 },
    { period: "2027-01", label: "Styczeń 2027", suma: 14008 },
    { period: "2027-02", label: "Luty 2027", suma: 21012 },
    { period: "2027-03", label: "Marzec 2027", suma: 84048 },
    { period: "2027-04", label: "Kwiecień 2027", suma: 154088 },
    { period: "2027-05", label: "Maj 2027", suma: 196112 },
    { period: "2027-06", label: "Czerwiec 2027", suma: 182104 },
    { period: "2027-07", label: "Lipiec 2027", suma: 196112 },
    { period: "2027-08", label: "Sierpień 2027", suma: 154088 },
    { period: "2027-09", label: "Wrzesień 2027", suma: 126072 },
    { period: "2027-10", label: "Październik 2027", suma: 112064 },
    { period: "2027-11", label: "Listopad 2027", suma: 56032 },
    { period: "2027-12", label: "Grudzień 2027", suma: 42024 },
    { period: "2028-01", label: "Styczeń 2028", suma: 28856.48 },
    { period: "2028-02", label: "Luty 2028", suma: 43284.72 },
    { period: "2028-03", label: "Marzec 2028", suma: 115425.92 },
    { period: "2028-04", label: "Kwiecień 2028", suma: 316254.29 },
    { period: "2028-05", label: "Maj 2028", suma: 402505.46 },
    { period: "2028-06", label: "Czerwiec 2028", suma: 373755.07 },
    { period: "2028-07", label: "Lipiec 2028", suma: 654999.66 },
    { period: "2028-08", label: "Sierpień 2028", suma: 514642.59 },
    { period: "2028-09", label: "Wrzesień 2028", suma: 421071.21 },
    { period: "2028-10", label: "Październik 2028", suma: 374285.52 },
    { period: "2028-11", label: "Listopad 2028", suma: 187142.76 },
    { period: "2028-12", label: "Grudzień 2028", suma: 140357.07 }
  ]
};

// Struktura akcjonariatu / wycena spółki — WARTOŚCI DOMYŚLNE SĄ PUSTE (0),
// bo nie mamy jeszcze realnych danych (kurs akcji, liczba akcji, lista
// akcjonariuszy, wycena księgowa aktywów) — Kamil zapowiedział, że poda je
// zespół. Edytowalne z modułu "Akcjonariat" (zapis: PUT /api/settings,
// key="shareholderStructure"). Kapitalizacja giełdowa i wskaźnik C/WK
// (cena/wartość księgowa) liczone są w interfejsie z tych pól, nie trzymane
// tu jako osobna wartość, żeby nie rozjeżdżały się z inputami po edycji.
const DEFAULT_SHAREHOLDER_STRUCTURE = {
  asOfLabel: "", // uzupełnić: data aktualności struktury akcjonariatu
  sharePrice: 0, // zł/akcję — bieżący kurs z NewConnect, do uzupełnienia
  totalShares: 33260017, // suma z podanej struktury akcjonariatu
  bookValueAssets: 0, // wycena księgowa aktywów spółki, zł — do uzupełnienia
  shareholders: [
    { name: "Theo Investment Sp. z o.o.", shares: 6612452 },
    { name: "Berg Holding S.A.", shares: 5966494 },
    { name: "Evercon Sp. z o.o.", shares: 5488002 },
    { name: "Grupa TMT Sp. z o.o.", shares: 5317389 },
    { name: "Dariusz Cisak", shares: 2533000 },
    { name: "Biolabinvest Sp. z o.o.", shares: 2500607 },
    { name: "Pozostali (free float, poniżej 5%)", shares: 4842073 }
  ] as { name: string; shares: number }[] // lista akcjonariuszy: nazwa + liczba akcji
};

// GET /api/bootstrap — pełny odczyt danych do hydratacji interfejsu (STATE).
// To jedyny endpoint typu "odczytaj wszystko" — wszystkie zapisy idą przez
// dedykowane endpointy CRUD per encja (patrz app/api/<encja>/route.ts).
//
// Zwraca też restricted:true dla kont z listy APP_BASIC_AUTH_RESTRICTED_USERS
// (patrz lib/access.ts).
//
// 2026-09-06/07 — POPRAWKA BEZPIECZEŃSTWA (na wyraźne polecenie Kamila):
// wcześniej ten endpoint zwracał PEŁNE kwoty wynagrodzeń kontom
// ograniczonym, tylko UKRYWAJĄC je w interfejsie — czyli ktoś z wiedzą
// o narzędziach deweloperskich przeglądarki mógł je i tak zobaczyć w
// surowej odpowiedzi. Teraz dla kont z listy "restricted":
//   1) kwoty wynagrodzeń/benefitów każdego pracownika są usuwane z
//      odpowiedzi (redactEmployeeSalary — patrz lib/serverMetrics.ts),
//   2) nazwane pozycje w harmonogramie kosztów stałych ("Michał B2B",
//      "Kontroling - Maciek" itp. w Założenia -> Koszty Stałe) mają
//      usuniętą nazwę/notatkę (redactFixedCostLineItem) — to było
//      widoczne wprost w interfejsie (bez żadnych devtools), więc to
//      w praktyce WAŻNIEJSZY z dwóch problemów,
//   3) żeby mimo to wszystkie SUMY (koszt projektu, wynik firmy, koszty
//      działów, prognoza) dalej się zgadzały, serwer sam liczy je z
//      PEŁNYCH (nieukrytych) danych i wysyła gotowe w polu
//      "serverMetrics" — frontend (app-shell.html, funkcja metrics())
//      używa tych gotowych sum zamiast liczyć je z (teraz ukrytych)
//      kwot per-pracownik, gdy STATE.restricted===true. Dla kont
//      pełnych nic się nie zmienia — liczą jak dotychczas w przeglądarce.
export async function GET(req: Request) {
  const [departments, projects, employees, vendors, costs, contracts, financings, documents, settings] =
    await prisma.$transaction([
      prisma.department.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
      prisma.project.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
      prisma.employee.findMany({
        where: { deletedAt: null },
        include: { allocations: true },
        orderBy: { createdAt: "asc" }
      }),
      prisma.vendor.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
      prisma.cost.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
      prisma.contract.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
      prisma.financing.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
      prisma.document.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
      prisma.appSetting.findMany()
    ]);

  const settingsMap: Record<string, any> = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  const departmentsOut = departments.map(serializeDepartment);
  const projectsOut = projects.map(serializeProject);
  const employeesFull = employees.map(serializeEmployee); // PEŁNE dane — do liczenia serverMetrics, NIE wysyłane wprost restricted
  const costsOut = costs.map(serializeCost);
  const contractsOut = contracts.map(serializeContract);
  const financingsOut = financings.map(serializeFinancing);
  const fixedCostScheduleFull = settingsMap.fixedCostSchedule ?? DEFAULT_FIXED_COST_SCHEDULE;

  // Liczone ZAWSZE z pełnych, nieukrytych danych — patrz komentarz przy
  // GET wyżej. Frontend korzysta z tego tylko dla kont "restricted".
  const serverMetrics = computeServerMetrics({
    projects: projectsOut,
    costs: costsOut,
    employees: employeesFull,
    departments: departmentsOut,
    financings: financingsOut,
    contracts: contractsOut
  });

  const restricted = isRestrictedUser(req);
  const employeesOut = restricted ? employeesFull.map(redactEmployeeSalary) : employeesFull;
  const fixedCostSchedule = restricted
    ? {
        ...fixedCostScheduleFull,
        lineItems: (fixedCostScheduleFull.lineItems || []).map((li: any, i: number) => redactFixedCostLineItem(li, i))
      }
    : fixedCostScheduleFull;

  return NextResponse.json({
    departments: departmentsOut,
    projects: projectsOut,
    employees: employeesOut,
    vendors: vendors.map(serializeVendor),
    costs: costsOut,
    contracts: contractsOut,
    financings: financingsOut,
    documents: documents.map(serializeDocument),
    costCategories: settingsMap.costCategories ?? DEFAULT_CATEGORIES,
    costCenters: settingsMap.costCenters ?? DEFAULT_COST_CENTERS,
    currency: settingsMap.currency ?? "PLN",
    assumptions: settingsMap.assumptions ?? DEFAULT_ASSUMPTIONS,
    fixedCostSchedule,
    shareholderStructure: settingsMap.shareholderStructure ?? DEFAULT_SHAREHOLDER_STRUCTURE,
    serverMetrics,
    currentUser: currentLogin(req),
    restricted
  });
}
