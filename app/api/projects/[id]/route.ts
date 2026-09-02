import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeProject, str, numOrNull, toDate, toEnum, PROJECT_STATUS_MAP } from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

function toData(body: any) {
  return {
    name: String(body.name ?? ""),
    code: str(body.code) || null,
    spv: str(body.spv) || null,
    location: str(body.location) || null,
    mwPower: numOrNull(body.mwPower),
    revenueMonthly: numOrNull(body.revenueMonthly),
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
    return NextResponse.json(serializeProject(updated));
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

// Soft delete — projekt jest odwoływany z kosztów/umów/leasingów/przypisań pracowników.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
