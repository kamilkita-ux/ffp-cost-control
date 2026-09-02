import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  serializeEmployee, str, numOrNull, bool,
  toEnum, EMPLOYEE_STATUS_MAP, CONTRACT_TYPE_MAP, CRITICAL_RATING_MAP
} from "@/lib/serialize";
import { logChange } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

function toData(body: any) {
  return {
    firstName: String(body.firstName ?? ""),
    lastName: String(body.lastName ?? ""),
    email: str(body.email) || null,
    phone: str(body.phone) || null,
    position: String(body.position ?? ""),
    departmentId: str(body.departmentId) || null,
    managerId: str(body.managerId) || null,
    status: toEnum(EMPLOYEE_STATUS_MAP, body.status, "AKTYWNY") as any,
    contractType: toEnum(CONTRACT_TYPE_MAP, body.contractType, "UMOWA_O_PRACE") as any,
    netSalary: numOrNull(body.netSalary),
    grossSalary: numOrNull(body.grossSalary),
    employerCost: numOrNull(body.employerCost),
    otherMonthlyCost: numOrNull(body.otherMonthlyCost) ?? 0,
    bonus: numOrNull(body.bonus) ?? 0,
    car: numOrNull(body.car) ?? 0,
    phoneCost: numOrNull(body.phoneCost) ?? 0,
    computer: numOrNull(body.computer) ?? 0,
    otherBenefits: numOrNull(body.otherBenefits) ?? 0,
    responsibilities: str(body.responsibilities) || null,
    justification: str(body.justification) || null,
    keyTasks: str(body.keyTasks) || null,
    criticalRating: toEnum(CRITICAL_RATING_MAP, body.criticalRating, "WAZNE") as any,
    presidentNotes: str(body.presidentNotes) || null,
    excludeFromSimulation: bool(body.excludeFromSimulation)
  };
}

function allocationsData(body: any) {
  const allocations = Array.isArray(body.allocations) ? body.allocations : [];
  return allocations
    .filter((a: any) => a && a.projectId)
    .map((a: any) => ({
      projectId: a.projectId === "ADMIN" ? null : String(a.projectId),
      pct: numOrNull(a.pct) ?? 0
    }));
}

// Aktualizacja pracownika + PEŁNA wymiana jego przypisań do projektów —
// w jednej transakcji (usunięcie starych alokacji i wstawienie nowych musi
// być atomowe, inaczej krótkotrwale zniknęłyby wszystkie przypisania danej osoby).
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const allocations = allocationsData(body);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.update({ where: { id }, data: toData(body) });
      await tx.employeeProjectAllocation.deleteMany({ where: { employeeId: emp.id } });
      if (allocations.length) {
        await tx.employeeProjectAllocation.createMany({
          data: allocations.map((a: any) => ({ ...a, employeeId: emp.id }))
        });
      }
      return tx.employee.findUniqueOrThrow({ where: { id: emp.id }, include: { allocations: true } });
    });
    await logChange(req, "employee", id, "update", `${updated.firstName} ${updated.lastName}`);
    return NextResponse.json(serializeEmployee(updated));
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const updated = await prisma.employee.update({ where: { id }, data: { deletedAt: new Date() } });
    await logChange(req, "employee", id, "delete", `${updated.firstName} ${updated.lastName}`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
