import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logChange } from "@/lib/audit";
import { isAdminCaller } from "@/lib/access";

// DELETE /api/demo — usuwa wszystkie rekordy oznaczone jako DEMO
// (pracownicy, projekty, koszty, dostawcy), zgodnie z przyciskiem
// "Usuń wszystkie dane DEMO" w Ustawieniach. Operacja trwała (dane DEMO
// z założenia są jednorazowe i nie podlegają odzyskiwaniu).
// AUDYT 2026-09-19: admin-only; przed skasowaniem projektów DEMO odpinane
// są od nich rekordy NIE-demo (finansowania/umowy/koszty), żeby usunięcie
// nie wywaliło się na kluczu obcym.
export async function DELETE(req: Request) {
  if (!(await isAdminCaller(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const demoProjects = await prisma.project.findMany({ where: { isDemo: true }, select: { id: true } });
  const ids = demoProjects.map((p: { id: string }) => p.id);
  await prisma.$transaction([
    prisma.cost.deleteMany({ where: { isDemo: true } }),
    ...(ids.length ? [
      prisma.cost.updateMany({ where: { projectId: { in: ids } }, data: { projectId: null } }),
      prisma.contract.updateMany({ where: { projectId: { in: ids } }, data: { projectId: null } }),
      prisma.financing.updateMany({ where: { projectId: { in: ids } }, data: { projectId: null } })
    ] : []),
    prisma.employee.deleteMany({ where: { isDemo: true } }),
    prisma.vendor.deleteMany({ where: { isDemo: true } }),
    prisma.project.deleteMany({ where: { isDemo: true } })
  ]);
  await logChange(req, "demo", null, "delete", "Usunięto dane DEMO");
  return NextResponse.json({ ok: true });
}
