import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logChange } from "@/lib/audit";

// DELETE /api/demo — usuwa wszystkie rekordy oznaczone jako DEMO
// (pracownicy, projekty, koszty, dostawcy), zgodnie z przyciskiem
// "Usuń wszystkie dane DEMO" w Ustawieniach. Operacja trwała (dane DEMO
// z założenia są jednorazowe i nie podlegają odzyskiwaniu).
export async function DELETE(req: Request) {
  await prisma.$transaction([
    prisma.cost.deleteMany({ where: { isDemo: true } }),
    prisma.employee.deleteMany({ where: { isDemo: true } }),
    prisma.vendor.deleteMany({ where: { isDemo: true } }),
    prisma.project.deleteMany({ where: { isDemo: true } })
  ]);
  await logChange(req, "demo", null, "delete", "Usunięto dane DEMO");
  return NextResponse.json({ ok: true });
}
