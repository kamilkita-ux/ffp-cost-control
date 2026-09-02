import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeVendor, str } from "@/lib/serialize";
import { logChange } from "@/lib/audit";

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

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name) return NextResponse.json({ error: "invalid_input", message: "Nazwa dostawcy jest wymagana." }, { status: 400 });
  const created = await prisma.vendor.create({ data: toData(body) });
  await logChange(req, "vendor", created.id, "create", created.name);
  return NextResponse.json(serializeVendor(created), { status: 201 });
}
