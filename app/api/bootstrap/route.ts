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

export const dynamic = "force-dynamic";

const DEFAULT_CATEGORIES = [
  "Pracownicy", "Development", "Dzierżawy", "Projekty budowlane", "Geodezja", "Prawnicy",
  "Notariusz", "Warunki przyłączenia", "Opłaty operatorów", "Administracja", "Środowisko",
  "Banki", "Finansowanie", "Wykonawcy", "Serwis", "IT", "Doradcy", "Inne"
];
const DEFAULT_COST_CENTERS = ["Centrala", "Zarząd", "Development", "Realizacja", "Projekty PV", "Magazyny energii"];

// GET /api/bootstrap — pełny odczyt danych do hydratacji interfejsu (STATE).
// To jedyny endpoint typu "odczytaj wszystko" — wszystkie zapisy idą przez
// dedykowane endpointy CRUD per encja (patrz app/api/<encja>/route.ts).
export async function GET() {
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

  return NextResponse.json({
    departments: departments.map(serializeDepartment),
    projects: projects.map(serializeProject),
    employees: employees.map(serializeEmployee),
    vendors: vendors.map(serializeVendor),
    costs: costs.map(serializeCost),
    contracts: contracts.map(serializeContract),
    financings: financings.map(serializeFinancing),
    documents: documents.map(serializeDocument),
    costCategories: settingsMap.costCategories ?? DEFAULT_CATEGORIES,
    costCenters: settingsMap.costCenters ?? DEFAULT_COST_CENTERS,
    currency: settingsMap.currency ?? "PLN"
  });
}
