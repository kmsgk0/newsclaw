#!/bin/sh
set -eu
while true; do
  sh /scripts/backup.sh
  sleep 86400 &
  sleep_pid=$!
  trap 'kill "$sleep_pid" 2>/dev/null || true; exit 0' TERM INT
  wait "$sleep_pid"
done
