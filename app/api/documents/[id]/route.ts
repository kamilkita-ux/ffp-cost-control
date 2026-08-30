import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeDocument, str, toDate } from "@/lib/serialize";

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
    return NextResponse.json(serializeDocument(updated));
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
