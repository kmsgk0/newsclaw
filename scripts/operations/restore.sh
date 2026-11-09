#!/bin/sh
set -eu
if [ "$#" -ne 2 ]; then
  printf 'Usage: restore.sh <backup-file> <empty-target-database>\n' >&2
  exit 2
fi
backup_file=$1
target_database=$2
test -r "$backup_file" || { printf 'Backup is not readable\n' >&2; exit 1; }
pg_restore --list "$backup_file" >/dev/null
table_count=$(psql --dbname="$target_database" -At --command="SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
test "$table_count" = 0 || { printf 'Restore requires an empty target database; existing data was preserved\n' >&2; exit 1; }
pg_restore --dbname="$target_database" --single-transaction --exit-on-error --no-owner "$backup_file"
printf 'Restore completed; verify records and account access before switching application configuration\n'
