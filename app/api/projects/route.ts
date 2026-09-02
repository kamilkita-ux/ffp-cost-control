import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeProject, str, numOrNull, toDate, toEnum, PROJECT_STATUS_MAP } from "@/lib/serialize";

function toData(body: any) {
  return {
    name: String(body.name ?? ""),
    code: str(body.code) || null,
    spv: str(body.spv) || null,
    location: str(body.location) || null,
    mwPower: numOrNull(body.mwPower),
    status: toEnum(PROJECT_STATUS_MAP, body.status, "DEVELOPMENT") as any,
    owner: str(body.owner) || null,
    startDate: toDate(body.startDate),
    endDate: toDate(body.endDate),
    description: str(body.description) || null
  };
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name) return NextResponse.json({ error: "invalid_input", message: "Nazwa projektu jest wymagana." }, { status: 400 });
  const created = await prisma.project.create({ data: toData(body) });
  return NextResponse.json(serializeProject(created), { status: 201 });
}
