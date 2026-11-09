#!/bin/sh
set -eu
backup_dir=${BACKUP_DIR:-/backups}
mkdir -p "$backup_dir"
umask 077
backup_file="$backup_dir/newsclaw-$(date -u +%Y%m%dT%H%M%S)-$$.dump"
temporary="$backup_file.tmp"
trap 'rm -f -- "$temporary"' EXIT HUP INT TERM
pg_dump --format=custom --no-owner --file="$temporary"
pg_restore --list "$temporary" >/dev/null
mv "$temporary" "$backup_file"
ls -1t "$backup_dir"/newsclaw-*.dump | tail -n +8 | while IFS= read -r old_backup; do
  rm -- "$old_backup"
done
printf 'Backup verified: %s\n' "$(basename "$backup_file")"
