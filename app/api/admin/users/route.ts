import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminCaller } from "@/lib/access";
import { hashPassword, generateTempPassword } from "@/lib/passwords";
import { logChange } from "@/lib/audit";

// GET /api/admin/users — lista kont (bez hashy haseł). Kto może
// zarządzać kontami: patrz lib/access.ts (isAdminCaller).
export async function GET(req: Request) {
  if (!(await isAdminCaller(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const users = await prisma.appUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, role: true, active: true, createdAt: true, lastLoginAt: true }
  });
  return NextResponse.json(users);
}

// POST /api/admin/users { username, role, password? }
// Jeśli "password" nie podane, generowane jest hasło startowe i zwracane
// W ODPOWIEDZI TEGO JEDNEGO WYWOŁANIA (nigdzie nie jest zapisywane jawnym
// tekstem) — Kamil przekazuje je danej osobie, a ta może je potem
// zmienić przez /api/auth/change-password.
export async function POST(req: Request) {
  if (!(await isAdminCaller(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const username = String(body?.username || "").trim();
  const role = body?.role === "full" ? "full" : "restricted";
  if (!username) return NextResponse.json({ error: "missing_username" }, { status: 400 });

  const existing = await prisma.appUser.findUnique({ where: { username } });
  if (existing) return NextResponse.json({ error: "username_taken" }, { status: 409 });

  const tempPassword = typeof body?.password === "string" && body.password.length >= 8 ? body.password : generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const created = await prisma.appUser.create({
    data: { username, passwordHash, role },
    select: { id: true, username: true, role: true, active: true, createdAt: true }
  });
  await logChange(req, "appUser", created.id, "create", `Utworzono konto: ${username} (${role})`);
  return NextResponse.json({ ...created, tempPassword }, { status: 201 });
}
