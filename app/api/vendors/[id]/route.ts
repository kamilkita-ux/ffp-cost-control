import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeVendor, str } from "@/lib/serialize";
import { logChange } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

function toData(body: any) {
  return {
    name: String(body.name ?? ""),
    nip: str(body.nip) || null,
    contactPerson: str(body.contactPerson) || null,
    phone: str(body.phone) || null,
    email: str(body.email) || null,
    serviceType: str(body.serviceType) || null,
    notes: str(body.notes) || null
  };
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  try {
    const updated = await prisma.vendor.update({ where: { id }, data: toData(body) });
    await logChange(req, "vendor", id, "update", updated.name);
    return NextResponse.json(serializeVendor(updated));
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const updated = await prisma.vendor.update({ where: { id }, data: { deletedAt: new Date() } });
    await logChange(req, "vendor", id, "delete", updated.name);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
