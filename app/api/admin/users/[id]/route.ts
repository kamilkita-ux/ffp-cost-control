import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminCaller } from "@/lib/access";
import { hashPassword, generateTempPassword } from "@/lib/passwords";
import { logChange } from "@/lib/audit";

// PUT /api/admin/users/[id] { role?, active?, resetPassword? }
// resetPassword:true generuje nowe hasło startowe (zwrócone raz w
// odpowiedzi, patrz POST w route.ts nadrzędnym) — do przekazania osobie,
// gdy zapomni hasła (nie ma tu maila/SMS-a do resetu, świadomie — to
// wewnętrzne narzędzie dla kilku osób, Kamil przekazuje hasło osobiście).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminCaller(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, any> = {};
  if (body?.role === "full" || body?.role === "restricted") data.role = body.role;
  if (typeof body?.active === "boolean") data.active = body.active;

  let tempPassword: string | undefined;
  if (body?.resetPassword) {
    tempPassword = generateTempPassword();
    data.passwordHash = await hashPassword(tempPassword);
  }

  const updated = await prisma.appUser.update({
    where: { id },
    data,
    select: { id: true, username: true, role: true, active: true, createdAt: true, lastLoginAt: true }
  });
  await logChange(req, "appUser", id, "update", `Zaktualizowano konto: ${updated.username}`);
  return NextResponse.json(tempPassword ? { ...updated, tempPassword } : updated);
}

// DELETE /api/admin/users/[id] — trwałe usunięcie konta. Nigdy nie usuwa
// dostępu Kamila do zarządzania kontami (to zawsze wraca do jego głównego
// loginu Basic Auth, niezależnego od tej tabeli — patrz lib/access.ts).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminCaller(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const user = await prisma.appUser.findUnique({ where: { id } });
  await prisma.appUser.delete({ where: { id } });
  await logChange(req, "appUser", id, "delete", `Usunięto konto: ${user?.username || id}`);
  return NextResponse.json({ ok: true });
}
