#!/usr/bin/env bash
# Backup bazy PostgreSQL dla FFP Cost Control.
#
# Użycie ręczne:
#   bash scripts/backup.sh
#   (albo: npm run db:backup)
#
# Wymaga zmiennej środowiskowej DATABASE_URL (ta sama, z której korzysta
# aplikacja — patrz .env). Tworzy skompresowany plik pg_dump w katalogu
# backups/, nazwany datą i godziną, i usuwa kopie starsze niż 30 dni.
#
# Automatyzacja (Linux/serwer własny): dodaj do crontaba, np. codziennie o 2:00:
#   0 2 * * *  cd /sciezka/do/ffp-nextjs && bash scripts/backup.sh >> backups/backup.log 2>&1
#
# Automatyzacja (hosting zarządzany — Neon / Supabase / Railway / Render):
# każdy z tych dostawców ma WBUDOWANY automatyczny backup bazy (point-in-time
# recovery) włączany w panelu administracyjnym providera, bez potrzeby
# uruchamiania tego skryptu — patrz README.md, sekcja "Backup".
# Ten skrypt jest dodatkowym, niezależnym zabezpieczeniem (kopia poza
# providerem), przydatnym zwłaszcza przy hostingu bez wbudowanego PITR.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -f .env ]; then
    export "$(grep -E '^DATABASE_URL=' .env | xargs)"
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Błąd: brak zmiennej DATABASE_URL (ani w środowisku, ani w .env)." >&2
  exit 1
fi

BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/ffp_cost_control_${TIMESTAMP}.dump"

echo "Tworzę backup bazy do: $OUT_FILE"
pg_dump --dbname="$DATABASE_URL" --format=custom --file="$OUT_FILE"

echo "Backup zakończony ($(du -h "$OUT_FILE" | cut -f1))."

# Usuń kopie starsze niż 30 dni, zachowując miejsce na dysku.
find "$BACKUP_DIR" -name 'ffp_cost_control_*.dump' -mtime +30 -delete || true

echo ""
echo "Przywracanie z tego pliku (w razie potrzeby):"
echo "  pg_restore --dbname=\"\$DATABASE_URL\" --clean --if-exists \"$OUT_FILE\""
