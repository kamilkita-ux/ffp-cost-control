import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeFinancing, str, numOrNull, intOrNull, bool, toDate, toEnum, FINANCING_TYPE_MAP } from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

function toData(body: any) {
  return {
    lender: String(body.lender ?? ""),
    subject: str(body.subject) || null,
    type: toEnum(FINANCING_TYPE_MAP, body.type, "LEASING_OPERACYJNY") as any,
    initialAmount: numOrNull(body.initialAmount),
    remainingBalance: numOrNull(body.remainingBalance),
    monthlyPayment: numOrNull(body.monthlyPayment) ?? 0,
    numInstallments: intOrNull(body.numInstallments),
    remainingInstallments: intOrNull(body.remainingInstallments),
    nextPaymentDate: toDate(body.nextPaymentDate),
    endDate: toDate(body.endDate),
    interestRate: numOrNull(body.interestRate),
    projectId: str(body.projectId) || null,
    notes: str(body.notes) || null,
    excludeFromSimulation: bool(body.excludeFromSimulation)
  };
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  try {
    const updated = await prisma.financing.update({ where: { id }, data: toData(body) });
    return NextResponse.json(serializeFinancing(updated));
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await prisma.financing.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
