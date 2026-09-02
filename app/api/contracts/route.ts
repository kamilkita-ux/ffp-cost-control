import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeContract, str, numOrNull, intOrNull, bool, toDate, toEnum, RECURRENCE_MAP } from "@/lib/serialize";

function toData(body: any) {
  return {
    vendorId: str(body.vendorId) || null,
    name: String(body.name ?? ""),
    description: str(body.description) || null,
    amount: numOrNull(body.amount),
    netGross: str(body.netGross) || "brutto",
    frequency: toEnum(RECURRENCE_MAP, body.frequency, "MIESIECZNY") as any,
    projectId: str(body.projectId) || null,
    startDate: toDate(body.startDate),
    endDate: toDate(body.endDate),
    noticePeriodDays: intOrNull(body.noticePeriodDays),
    earliestTerminationDate: toDate(body.earliestTerminationDate),
    autoRenew: bool(body.autoRenew),
    owner: str(body.owner) || null,
    documentLink: str(body.documentLink) || null,
    notes: str(body.notes) || null,
    excludeFromSimulation: bool(body.excludeFromSimulation)
  };
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name) return NextResponse.json({ error: "invalid_input", message: "Nazwa umowy jest wymagana." }, { status: 400 });
  const created = await prisma.contract.create({ data: toData(body) });
  return NextResponse.json(serializeContract(created), { status: 201 });
}
