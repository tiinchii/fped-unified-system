#!/usr/bin/env bash
# Gabi-gabing backup ng database. Itinatago ang huling 30 araw.
#
#   sudo install -m 750 deploy/backup.sh /usr/local/bin/fped-portal-backup
#   sudo crontab -e   ->   15 1 * * * /usr/local/bin/fped-portal-backup
#
# Tumatakbo bilang root (unix socket login ng MariaDB), kaya walang password dito.
# MAHALAGA: kopyahin din ang folder sa labas ng server (ibang server o Drive); ang backup na nasa
# parehong disk ay nawawala kasabay ng server.
set -euo pipefail

DB="${FPED_DB:-fped_portal}"
DIR="${FPED_BACKUP_DIR:-/var/backups/fped-portal}"
KEEP_DAYS="${FPED_BACKUP_KEEP_DAYS:-30}"

mkdir -p "$DIR"
chmod 700 "$DIR"
FILE="$DIR/$DB-$(date +%Y-%m-%d_%H%M).sql.gz"

mariadb-dump --single-transaction --routines --databases "$DB" | gzip > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
find "$DIR" -name "$DB-*.sql.gz" -mtime +"$KEEP_DAYS" -delete
echo "Backup: $FILE ($(du -h "$FILE" | cut -f1))"
