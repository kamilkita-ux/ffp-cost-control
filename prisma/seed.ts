// Dane startowe: domyślne działy, słowniki oraz te same rekordy DEMO,
// które wcześniej były częścią statycznego STATE frontendu. Uruchom raz,
// po pierwszej migracji: `npm run db:seed`.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_DEPARTMENTS = [
  "Zarząd", "Administracja", "Finanse", "Development", "Realizacja",
  "IT", "Prawny", "Projekty PV", "Magazyny energii"
];

const DEFAULT_CATEGORIES = [
  "Pracownicy", "Development", "Dzierżawy", "Projekty budowlane", "Geodezja", "Prawnicy",
  "Notariusz", "Warunki przyłączenia", "Opłaty operatorów", "Administracja", "Środowisko",
  "Banki", "Finansowanie", "Wykonawcy", "Serwis", "IT", "Doradcy", "Inne"
];
const DEFAULT_COST_CENTERS = ["Centrala", "Zarząd", "Development", "Realizacja", "Projekty PV", "Magazyny energii"];

async function main() {
  const existing = await prisma.department.count();
  if (existing > 0) {
    console.log("Baza już zawiera dane — pomijam seed (aby wymusić, wyczyść tabele ręcznie).");
    return;
  }

  const depByName: Record<string, string> = {};
  for (const name of DEFAULT_DEPARTMENTS) {
    const d = await prisma.department.create({ data: { name } });
    depByName[name] = d.id;
  }

  const project = await prisma.project.create({
    data: {
      isDemo: true,
      name: "Skrzypaczowice",
      code: "PV-SKR",
      spv: "SPV Skrzypaczowice sp. z o.o.",
      location: "woj. śląskie",
      mwPower: 12,
      status: "BUDOWA",
      description: "Projekt PV demonstracyjny."
    }
  });

  const vendor = await prisma.vendor.create({
    data: { isDemo: true, name: "Kancelaria Prawna Przykład sp.k.", serviceType: "Usługi prawne" }
  });

  const employee = await prisma.employee.create({
    data: {
      isDemo: true,
      firstName: "Jan",
      lastName: "Kowalski",
      email: "jan.kowalski@ffp.pl",
      position: "Kierownik projektu",
      departmentId: depByName["Development"],
      status: "AKTYWNY",
      contractType: "UMOWA_O_PRACE",
      netSalary: 6000,
      grossSalary: 8500,
      employerCost: 10300,
      phoneCost: 80,
      responsibilities: "Prowadzenie developmentu projektu PV Skrzypaczowice.",
      justification: "Kluczowa osoba odpowiedzialna za harmonogram i pozwolenia.",
      keyTasks: "Pozyskiwanie pozwoleń\nKoordynacja geodezji\nKontakt z operatorem",
      criticalRating: "KRYTYCZNE"
    }
  });
  await prisma.employeeProjectAllocation.createMany({
    data: [
      { employeeId: employee.id, projectId: project.id, pct: 80 },
      { employeeId: employee.id, projectId: null, pct: 20 }
    ]
  });

  await prisma.cost.create({
    data: {
      isDemo: true,
      name: "Obsługa prawna - abonament",
      description: "Stały abonament prawny",
      vendorId: vendor.id,
      netAmount: 5000,
      vat: 23,
      grossAmount: 6150,
      category: "Doradcy",
      subcategory: "Prawnicy",
      departmentId: depByName["Prawny"],
      costCenter: "Centrala",
      costDate: new Date("2026-08-01T00:00:00.000Z"),
      invoiceDate: new Date("2026-08-01T00:00:00.000Z"),
      dueDate: new Date("2026-09-10T00:00:00.000Z"),
      paymentStatus: "DO_ZAPLATY",
      recurrence: "MIESIECZNY",
      docNumber: "FV/2026/08/001",
      necessity: "WAZNY",
      isFixed: true,
      budgetMonthly: 5000
    }
  });

  await prisma.appSetting.createMany({
    data: [
      { key: "costCategories", value: DEFAULT_CATEGORIES },
      { key: "costCenters", value: DEFAULT_COST_CENTERS },
      { key: "currency", value: "PLN" }
    ]
  });

  console.log("Seed zakończony: dane startowe (działy, słowniki, rekordy DEMO) zapisane.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
