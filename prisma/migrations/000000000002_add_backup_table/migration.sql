-- Tabela automatycznych/ręcznych punktów przywracania (backup).
-- Przechowuje pełny obraz danych aplikacji (JSON, ten sam kształt co
-- /api/bootstrap) w chwili wykonania kopii — pozwala przywrócić stan
-- sprzed kilku godzin bez konieczności ręcznego eksportu/importu pliku.
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL DEFAULT 'auto',
    "data" JSONB NOT NULL,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Backup_createdAt_idx" ON "Backup"("createdAt");
