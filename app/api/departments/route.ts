import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeDepartment } from "@/lib/serialize";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name) {
    return NextResponse.json({ error: "invalid_input", message: "Nazwa działu jest wymagana." }, { status: 400 });
  }
  const created = await prisma.department.create({ data: { name: String(body.name) } });
  return NextResponse.json(serializeDepartment(created), { status: 201 });
}
