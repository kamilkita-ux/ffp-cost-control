import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeDocument, str, toDate } from "@/lib/serialize";
import { logChange } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

function toData(body: any) {
  return {
    name: String(body.name ?? ""),
    link: str(body.link) || null,
    docType: str(body.docType) || null,
    date: toDate(body.date),
    description: str(body.description) || null,
    externalSource: str(body.externalSource) || null,
    externalId: str(body.externalId) || null,
    sharePointUrl: str(body.sharePointUrl) || null,
    documentUrl: str(body.documentUrl || body.link) || null
  };
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  try {
    const updated = await prisma.document.update({ where: { id }, data: toData(body) });
    await logChange(req, "document", id, "update", updated.name);
    return NextResponse.json(serializeDocument(updated));
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const updated = await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
    await logChange(req, "document", id, "delete", updated.name);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
