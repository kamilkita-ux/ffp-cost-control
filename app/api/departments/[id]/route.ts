import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeDepartment } from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  try {
    const updated = await prisma.department.update({
      where: { id },
      data: { name: String(body.name ?? "") }
    });
    return NextResponse.json(serializeDepartment(updated));
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

// Soft delete — działy mogą być odwoływane historycznie z pracowników/kosztów.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await prisma.department.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
