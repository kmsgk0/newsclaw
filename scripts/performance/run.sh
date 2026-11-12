#!/bin/bash
set -euo pipefail
# Requires the repository's Dockerfile.acceptance image and the listed runtime images.
source_dir=$(cd "$(dirname "$0")/../.." && pwd -P)
phase=${1:?Use baseline or optimized}
case "$phase" in baseline) pool=12;; optimized) pool=4;; *) echo 'Use baseline or optimized' >&2; exit 2;; esac
output_root=${PERF_OUTPUT:-"$source_dir/.local/verification/performance"}
mkdir -p "$output_root/$phase"
out=$(cd "$output_root/$phase" && pwd -P)
network="newsclaw-perf-$phase-$$"
pg="$network-pg"; redis="$network-redis"; api="$network-api"
docker_bin=${DOCKER_BIN:-docker}
docker() { "$docker_bin" "$@"; }
created=0
cleanup() {
  if [ "$created" = 1 ]; then
    docker exec "$api" rm -f /reports/performance-fixture.json >/dev/null 2>&1 || true
    docker rm -fv "$api" "$pg" "$redis" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
docker network create "$network" >/dev/null
created=1
docker run -d --name "$pg" --network "$network" --network-alias db --cpus .75 --memory 512m -e POSTGRES_USER=newsclaw_test -e POSTGRES_DB=newsclaw_test -e POSTGRES_PASSWORD=isolated-performance pgvector/pgvector:pg17 >/dev/null
docker run -d --name "$redis" --network "$network" --network-alias redis --cpus .25 --memory 128m redis:7.4-alpine >/dev/null
for n in $(seq 1 60); do
  if docker exec "$pg" pg_isready -U newsclaw_test -d newsclaw_test >/dev/null 2>&1 && docker exec "$redis" redis-cli ping 2>/dev/null | grep -q PONG; then break; fi
  if [ "$n" = 60 ]; then echo 'Dependencies failed' >&2; exit 1; fi
  sleep 1
done
docker run -d --name "$api" --network "$network" --cpus .75 --memory 768m \
  -v "$source_dir:/source:ro" -v "$out:/reports" \
  -e DB_POOL_MAX="$pool" -e NODE_ENV=test -e DATABASE_URL=postgresql://newsclaw_test:isolated-performance@db:5432/newsclaw_test \
  -e REDIS_URL=redis://redis:6379 -e CHAT_BASE_URL=http://127.0.0.1:4999/v1 -e CHAT_API_KEY=fixture -e CHAT_MODEL=fixture \
  -e EMBEDDING_BASE_URL=http://127.0.0.1:4999/v1 -e EMBEDDING_API_KEY=fixture -e EMBEDDING_MODEL=fixture \
  --entrypoint sh "${PERF_TOOLS_IMAGE:-newsclaw-acceptance:local}" -c 'mkdir -p /work && cd /source && tar --exclude=./.env --exclude="./.env.*" --exclude=./.git --exclude=./.local --exclude=./node_modules --exclude=./backups -cf - . | tar -C /work -xf - && ln -s /tools/node_modules /work/node_modules && cd /work && node --import tsx scripts/performance/server.ts' >/dev/null
for n in $(seq 1 120); do
  if docker exec "$api" test -s /reports/performance-fixture.json 2>/dev/null; then break; fi
  if ! docker inspect -f '{{.State.Running}}' "$api" | grep -q true; then docker logs "$api"; exit 1; fi
  if [ "$n" = 120 ]; then echo 'Fixture startup timed out' >&2; exit 1; fi
  sleep 1
done
token=$(docker exec "$api" node -e 'process.stdout.write(require("/reports/performance-fixture.json").token)')
source_id=$(docker exec "$api" node -e 'process.stdout.write(require("/reports/performance-fixture.json").sourceId)')
task_id=$(docker exec "$api" node -e 'process.stdout.write(require("/reports/performance-fixture.json").taskId)')
for scenario in submit task search; do
  for vus in ${PERF_VUS_LIST:-1 4 8}; do
    printf '%s %s %s VUs\n' "$phase" "$scenario" "$vus"
    if [ -e "$out/${scenario}-${vus}.json" ] || [ -e "$out/${scenario}-${vus}.log" ]; then
      echo "Results already exist in $out; set PERF_OUTPUT to a new directory" >&2; exit 1
    fi
    docker run --rm --user "$(id -u):$(id -g)" --network "container:$api" --cpus .5 --memory 256m \
      -v "$source_dir/scripts/performance/benchmark.js:/bench.js:ro" -v "$out:/reports" \
      -e SCENARIO="$scenario" -e VUS="$vus" -e DURATION="${PERF_DURATION:-8s}" -e RUN_ID="${phase}-${scenario}-${vus}" \
      -e TOKEN="$token" -e SOURCE_ID="$source_id" -e TASK_ID="$task_id" \
      "${PERF_K6_IMAGE:-grafana/k6:0.54.0}" run --quiet --summary-export "/reports/${scenario}-${vus}.json" /bench.js >"$out/${scenario}-${vus}.log" 2>&1
    test -s "$out/${scenario}-${vus}.json" || { echo 'k6 summary missing' >&2; exit 1; }
  done
done
printf '%s complete\n' "$phase"
