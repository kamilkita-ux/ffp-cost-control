// Automatyczny backup FFP Cost Control — uruchamiany co kilka godzin jako
// OSOBNY serwis na Railway (harmonogram/cron tego serwisu), niezależny od
// głównej aplikacji webowej ("app"). Łączy się z tą samą bazą PostgreSQL
// (ta sama zmienna DATABASE_URL co aplikacja) i zapisuje pełny obraz
// danych jako nowy wiersz w tabeli "Backup" — bez potrzeby żadnego
// dodatkowego dysku/wolumenu (backup trzyma się w tej samej bazie).
//
// Uruchomienie ręczne (test lokalny):
//   npx tsx scripts/backup-cron.ts
//
// Retencja: zachowuje maksymalnie MAX_BACKUPS najnowszych wpisów w tabeli
// (starsze są usuwane), żeby tabela nie rosła w nieskończoność. Przy
// backupie co 4h to ok. 33 dni historii (200 wpisów).
import { prisma } from "../lib/prisma";
import { buildSnapshot } from "../lib/snapshot";

const MAX_BACKUPS = 200;

async function main() {
  const snapshot = await buildSnapshot(prisma);

  const created = await prisma.backup.create({
    data: { kind: "auto", data: snapshot as any }
  });

  console.log(
    `[backup-cron] Zapisano kopię ${created.id} (${created.createdAt.toISOString()}): ` +
    `projekty=${snapshot.projects.length}, pracownicy=${snapshot.employees.length}, ` +
    `koszty=${snapshot.costs.length}, dostawcy=${snapshot.vendors.length}, ` +
    `umowy=${snapshot.contracts.length}, finansowania=${snapshot.financings.length}, ` +
    `dokumenty=${snapshot.documents.length}.`
  );

  // Retencja: usuń najstarsze wpisy ponad limit MAX_BACKUPS.
  const total = await prisma.backup.count();
  if (total > MAX_BACKUPS) {
    const toRemove = await prisma.backup.findMany({
      orderBy: { createdAt: "asc" },
      take: total - MAX_BACKUPS,
      select: { id: true }
    });
    await prisma.backup.deleteMany({ where: { id: { in: toRemove.map((b) => b.id) } } });
    console.log(`[backup-cron] Usunięto ${toRemove.length} najstarszych kopii (retencja: ${MAX_BACKUPS}).`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[backup-cron] Błąd podczas tworzenia kopii zapasowej:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
