import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRestrictedUser } from "@/lib/access";
import { buildXlsx, type Sheet, type Cell } from "@/lib/xlsxWriter";
import { redactEmployeeSalary } from "@/lib/serverMetrics";
import {
  serializeDepartment, serializeProject, serializeEmployee, serializeVendor,
  serializeCost, serializeContract, serializeFinancing, serializeDocument
} from "@/lib/serialize";

// GET /api/export/xlsx — wszystkie moduły w jednym pliku Excel (2026-09-19).
// Bez zewnętrznych bibliotek (lib/xlsxWriter.ts). Konto ograniczone dostaje
// pracowników bez kwot wynagrodzeń (ta sama redakcja co /api/bootstrap).
function table(rows: Record<string, any>[], columns: Array<[string, string]>): Cell[][] {
  const head = columns.map((c) => c[1]);
  const body = rows.map((r) => columns.map((c) => {
    const v = r[c[0]];
    if (v === null || v === undefined) return "";
    if (typeof v === "number" || typeof v === "boolean") return v;
    if (typeof v === "object") return JSON.stringify(v);
    const s = String(v);
    return /^-?\d+(\.\d+)?$/.test(s) && c[0] !== "code" && c[0] !== "nip" ? Number(s) : s;
  }));
  return [head, ...body];
}

export async function GET(req: Request) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const restricted = await isRestrictedUser(req);

  const [departments, projects, employees, vendors, costs, contracts, financings, documents, settings] = await prisma.$transaction([
    prisma.department.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { deletedAt: null }, include: { allocations: true }, orderBy: { lastName: "asc" } }),
    prisma.vendor.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.cost.findMany({ where: { deletedAt: null }, orderBy: { costDate: "desc" } }),
    prisma.contract.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.financing.findMany({ where: { deletedAt: null }, orderBy: { lender: "asc" } }),
    prisma.document.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.appSetting.findMany()
  ]);
  const settingsMap: Record<string, any> = {};
  for (const s of settings) settingsMap[s.key] = s.value;
  const projName = (id: string | null) => (id ? projects.find((p: any) => p.id === id)?.name ?? id : "");
  const deptName = (id: string | null) => (id ? departments.find((d: any) => d.id === id)?.name ?? id : "");
  const vendName = (id: string | null) => (id ? vendors.find((v: any) => v.id === id)?.name ?? id : "");

  const P = projects.map(serializeProject).map((p: any) => ({ ...p, isDemo: p.isDemo ? "tak" : "" }));
  const E = employees.map(serializeEmployee).map((e: any) => restricted ? redactEmployeeSalary(e) : e).map((e: any) => ({ ...e, departmentName: deptName(e.departmentId), allocationsText: (e.allocations || []).map((a: any) => `${a.projectId === "ADMIN" ? "Centrala" : projName(a.projectId)} ${a.pct}%`).join("; ") }));
  const C = costs.map(serializeCost).map((c: any) => ({ ...c, projectName: projName(c.projectId), departmentName: deptName(c.departmentId), vendorName: vendName(c.vendorId) }));
  const K = contracts.map(serializeContract).map((c: any) => ({ ...c, vendorName: vendName(c.vendorId), projectName: projName(c.projectId) }));
  const F = financings.map(serializeFinancing).map((f: any) => ({ ...f, projectName: projName(f.projectId) }));
  const V = vendors.map(serializeVendor);
  const D = documents.map(serializeDocument);
  const deadlines: any[] = Array.isArray(settingsMap.deadlines) ? settingsMap.deadlines : [];
  const tasks: any[] = Array.isArray(settingsMap.financeWorkspace?.tasks) ? settingsMap.financeWorkspace.tasks : [];

  const sheets: Sheet[] = [
    { name: "Projekty", rows: table(P, [["name", "Nazwa"], ["code", "Kod"], ["assetType", "Rodzaj"], ["status", "Status"], ["mwPower", "Moc MW"], ["location", "Lokalizacja"], ["capex", "CAPEX"], ["revenueMonthly", "Przychód / mies."], ["startDate", "Start prac"], ["endDate", "Uruchomienie"], ["gridOperator", "OSD"], ["energyBuyer", "Odbiorca energii"], ["connectionConditionsStatus", "Warunki przyłączenia"], ["connectionAgreementStatus", "Umowa przyłączeniowa"], ["permitsStatus", "Pozwolenia"], ["environmentalDecisionStatus", "Decyzja środowiskowa"], ["zoningStatus", "MPZP/WZ"], ["owner", "Właściciel"], ["isDemo", "DEMO"], ["description", "Opis"]]) },
    { name: "Koszty", rows: table(C, [["name", "Nazwa"], ["category", "Kategoria"], ["subcategory", "Podkategoria"], ["vendorName", "Dostawca"], ["projectName", "Projekt"], ["departmentName", "Dział"], ["netAmount", "Netto"], ["grossAmount", "Brutto"], ["recurrence", "Cykl"], ["costDate", "Data"], ["dueDate", "Termin płatności"], ["paymentStatus", "Status płatności"], ["necessity", "Konieczność"], ["isFixed", "Stały"], ["docNumber", "Nr dokumentu"], ["notes", "Uwagi"]]) },
    { name: "Pracownicy", rows: table(E, restricted
      ? [["firstName", "Imię"], ["lastName", "Nazwisko"], ["position", "Stanowisko"], ["departmentName", "Dział"], ["status", "Status"], ["contractType", "Forma"], ["allocationsText", "Przypisania"], ["criticalRating", "Ocena stanowiska"]]
      : [["firstName", "Imię"], ["lastName", "Nazwisko"], ["position", "Stanowisko"], ["departmentName", "Dział"], ["status", "Status"], ["contractType", "Forma"], ["grossSalary", "Brutto"], ["employerCost", "Koszt pracodawcy"], ["bonus", "Premia"], ["car", "Auto"], ["otherBenefits", "Inne benefity"], ["allocationsText", "Przypisania"], ["criticalRating", "Ocena stanowiska"], ["responsibilities", "Odpowiedzialność"]]) },
    { name: "Finansowania", rows: table(F, [["lender", "Finansujący"], ["subject", "Przedmiot"], ["type", "Rodzaj"], ["projectName", "Projekt"], ["initialAmount", "Kwota początkowa"], ["remainingBalance", "Saldo"], ["monthlyPayment", "Rata"], ["interestRate", "Oprocentowanie %"], ["numInstallments", "Liczba rat"], ["remainingInstallments", "Pozostałe raty"], ["nextPaymentDate", "Następna rata"], ["endDate", "Koniec"], ["notes", "Uwagi"]]) },
    { name: "Umowy", rows: table(K, [["name", "Nazwa"], ["vendorName", "Kontrahent"], ["projectName", "Projekt"], ["amount", "Kwota"], ["netGross", "Netto/brutto"], ["frequency", "Cykl"], ["startDate", "Start"], ["endDate", "Koniec"], ["noticePeriodDays", "Okres wypowiedzenia (dni)"], ["earliestTerminationDate", "Najwcześniejsze wypowiedzenie"], ["autoRenew", "Auto-odnowienie"], ["owner", "Właściciel"], ["notes", "Uwagi"]]) },
    { name: "Dostawcy", rows: table(V, [["name", "Nazwa"], ["nip", "NIP"], ["serviceType", "Rodzaj usług"], ["contactPerson", "Kontakt"], ["phone", "Telefon"], ["email", "E-mail"], ["notes", "Uwagi"]]) },
    { name: "Dokumenty", rows: table(D, [["name", "Nazwa"], ["docType", "Typ"], ["date", "Data"], ["link", "Link"], ["description", "Opis"]]) },
    { name: "Terminy", rows: table(deadlines.map((d) => ({ ...d, projectName: projName(d.projectId || null), done: d.done ? "tak" : "" })), [["date", "Data"], ["title", "Co"], ["type", "Rodzaj"], ["projectName", "Projekt"], ["owner", "Odpowiada"], ["done", "Zrobione"], ["notes", "Notatka"]]) },
    { name: "Zadania (finansowanie)", rows: table(tasks.map((t) => ({ ...t, done: t.done ? "tak" : "" })), [["due", "Termin"], ["title", "Zadanie"], ["done", "Zrobione"], ["createdAt", "Utworzono"]]) },
    { name: "Działy", rows: table(departments.map(serializeDepartment), [["name", "Nazwa"]]) }
  ];
  const buf = buildXlsx(sheets);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="ffp-cost-control-${stamp}.xlsx"`,
      "cache-control": "no-store"
    }
  });
}
