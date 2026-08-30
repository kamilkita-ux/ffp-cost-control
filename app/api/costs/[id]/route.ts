import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  serializeCost, str, numOrNull, bool, toDate,
  toEnum, PAYMENT_STATUS_MAP, RECURRENCE_MAP, NECESSITY_MAP
} from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

function toData(body: any) {
  return {
    name: String(body.name ?? ""),
    description: str(body.description) || null,
    vendorId: str(body.vendorId) || null,
    netAmount: numOrNull(body.netAmount),
    vat: numOrNull(body.vat) ?? 23,
    grossAmount: numOrNull(body.grossAmount) ?? 0,
    currency: str(body.currency) || "PLN",
    category: String(body.category ?? "Inne"),
    subcategory: str(body.subcategory) || null,
    departmentId: str(body.departmentId) || null,
    projectId: str(body.projectId) || null,
    costCenter: str(body.costCenter) || null,
    costDate: toDate(body.costDate),
    invoiceDate: toDate(body.invoiceDate),
    dueDate: toDate(body.dueDate),
    paymentStatus: toEnum(PAYMENT_STATUS_MAP, body.paymentStatus, "PLANOWANY") as any,
    recurrence: toEnum(RECURRENCE_MAP, body.recurrence, "JEDNORAZOWY") as any,
    docNumber: str(body.docNumber) || null,
    notes: str(body.notes) || null,
    necessity: toEnum(NECESSITY_MAP, body.necessity, "DO_ANALIZY") as any,
    isFixed: bool(body.isFixed),
    excludeFromSimulation: bool(body.excludeFromSimulation),
    budgetMonthly: numOrNull(body.budgetMonthly),
    documentLink: str(body.documentLink) || null
  };
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  try {
    const updated = await prisma.cost.update({ where: { id }, data: toData(body) });
    return NextResponse.json(serializeCost(updated));
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

// Koszt to pojedynczy zapis księgowy bez odwołań z innych tabel — ale mimo to
// stosujemy soft delete, żeby żaden zapis finansowy nigdy nie znikał bezpowrotnie
// przez pomyłkę (zgodnie z zasadą "brak bezpowrotnego kasowania danych").
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await prisma.cost.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
