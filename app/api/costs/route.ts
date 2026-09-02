import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  serializeCost, str, numOrNull, bool, toDate,
  toEnum, PAYMENT_STATUS_MAP, RECURRENCE_MAP, NECESSITY_MAP
} from "@/lib/serialize";

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

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name) return NextResponse.json({ error: "invalid_input", message: "Nazwa kosztu jest wymagana." }, { status: 400 });
  const created = await prisma.cost.create({ data: toData(body) });
  return NextResponse.json(serializeCost(created), { status: 201 });
}
