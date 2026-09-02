import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeDocument, str, toDate } from "@/lib/serialize";

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

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name) return NextResponse.json({ error: "invalid_input", message: "Nazwa dokumentu jest wymagana." }, { status: 400 });
  const created = await prisma.document.create({ data: toData(body) });
  return NextResponse.json(serializeDocument(created), { status: 201 });
}
