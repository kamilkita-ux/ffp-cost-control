import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeProject, str, numOrNull, toDate, toEnum, PROJECT_STATUS_MAP } from "@/lib/serialize";
import { logChange } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

function toData(body: any) {
  return {
    name: String(body.name ?? ""),
    code: str(body.code) || null,
    spv: str(body.spv) || null,
    location: str(body.location) || null,
    mwPower: numOrNull(body.mwPower),
    revenueMonthly: numOrNull(body.revenueMonthly),
    gridOperator: str(body.gridOperator) || null,
    energyBuyer: str(body.energyBuyer) || null,
    assetType: str(body.assetType) || "PV",
    capex: numOrNull(body.capex),
    budgetTotal: numOrNull(body.budgetTotal),
    requestedPowerMW: numOrNull(body.requestedPowerMW),
    grantedPowerMW: numOrNull(body.grantedPowerMW),
    connectionConditionsStatus: str(body.connectionConditionsStatus) || null,
    connectionAgreementStatus: str(body.connectionAgreementStatus) || null,
    permitsStatus: str(body.permitsStatus) || null,
    environmentalDecisionStatus: str(body.environmentalDecisionStatus) || null,
    zoningStatus: str(body.zoningStatus) || null,
    status: toEnum(PROJECT_STATUS_MAP, body.status, "DEVELOPMENT") as any,
    owner: str(body.owner) || null,
    startDate: toDate(body.startDate),
    endDate: toDate(body.endDate),
    description: str(body.description) || null
  };
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  try {
    const updated = await prisma.project.update({ where: { id }, data: toData(body) });
    await logChange(req, "project", id, "update", updated.name);
    return NextResponse.json(serializeProject(updated));
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

// Soft delete — projekt jest odwoływany z kosztów/umów/leasingów/przypisań pracowników.
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const updated = await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    await logChange(req, "project", id, "delete", updated.name);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
