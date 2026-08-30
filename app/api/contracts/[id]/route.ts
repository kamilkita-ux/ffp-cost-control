import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeContract, str, numOrNull, intOrNull, bool, toDate, toEnum, RECURRENCE_MAP } from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

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

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  try {
    const updated = await prisma.contract.update({ where: { id }, data: toData(body) });
    return NextResponse.json(serializeContract(updated));
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await prisma.contract.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
