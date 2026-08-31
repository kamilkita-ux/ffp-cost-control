import { prisma } from "./prisma";
import {
  serializeDepartment,
  serializeProject,
  serializeEmployee,
  serializeVendor,
  serializeCost,
  serializeContract,
  serializeFinancing,
  serializeDocument
} from "./serialize";

// Buduje pełny obraz danych aplikacji — dokładnie ten sam kształt, jaki
// zwraca /api/bootstrap i jaki przyjmuje /api/restore. Używane przez
// automatyczne kopie zapasowe (scripts/backup-json.ts, uruchamiane co kilka
// godzin jako osobny serwis na Railway) oraz przez /api/admin/backups
// (ręczna kopia "na żądanie" + podgląd/przywracanie punktów backupu).
//
// Celowo NIEZALEŻNE od app/api/bootstrap/route.ts — ten plik nie zmienia
// już działającego, zweryfikowanego kodu /api/bootstrap i /api/restore.
export async function buildSnapshot(db: typeof prisma = prisma) {
  const [departments, projects, employees, vendors, costs, contracts, financings, documents, settings] =
    await db.$transaction([
      db.department.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
      db.project.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
      db.employee.findMany({
        where: { deletedAt: null },
        include: { allocations: true },
        orderBy: { createdAt: "asc" }
      }),
      db.vendor.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
      db.cost.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
      db.contract.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
      db.financing.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
      db.document.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
      db.appSetting.findMany()
    ]);

  const settingsMap: Record<string, any> = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  return {
    departments: departments.map(serializeDepartment),
    projects: projects.map(serializeProject),
    employees: employees.map(serializeEmployee),
    vendors: vendors.map(serializeVendor),
    costs: costs.map(serializeCost),
    contracts: contracts.map(serializeContract),
    financings: financings.map(serializeFinancing),
    documents: documents.map(serializeDocument),
    costCategories: settingsMap.costCategories ?? [],
    costCenters: settingsMap.costCenters ?? [],
    currency: settingsMap.currency ?? "PLN"
  };
}
