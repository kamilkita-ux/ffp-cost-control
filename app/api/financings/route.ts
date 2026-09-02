import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeFinancing, str, numOrNull, intOrNull, bool, toDate, toEnum, FINANCING_TYPE_MAP } from "@/lib/serialize";
import { logChange } from "@/lib/audit";

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

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.lender) return NextResponse.json({ error: "invalid_input", message: "Bank / leasingodawca jest wymagany." }, { status: 400 });
  const created = await prisma.financing.create({ data: toData(body) });
  await logChange(req, "financing", created.id, "create", created.lender);
  return NextResponse.json(serializeFinancing(created), { status: 201 });
}
