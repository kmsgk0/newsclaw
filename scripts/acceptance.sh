#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
ACCEPTANCE_SOURCE=$(pwd -P)
DOCKER=${DOCKER_BIN:-docker}
ACCEPTANCE_BASE=main
ACCEPTANCE_HEAD=HEAD
while [ "$#" -gt 0 ]; do
  case "$1" in
    --base|--head)
      [ "$#" -ge 2 ] || { echo 'Expected a Git reference after the option.' >&2; exit 2; }
      case "$1" in --base) ACCEPTANCE_BASE=$2 ;; --head) ACCEPTANCE_HEAD=$2 ;; esac
      shift 2 ;;
    *) echo 'Usage: sh scripts/acceptance.sh [--base REF] [--head REF]' >&2; exit 2 ;;
  esac
done
run_id=$(date -u +%Y%m%dT%H%M%SZ)-$$
project="newsclaw-acceptance-$run_id"
project=$(printf '%s' "$project" | tr '[:upper:]' '[:lower:]')
ACCEPTANCE_REPORT_DIR="$ACCEPTANCE_SOURCE/.local/verification/acceptance/$run_id"
ACCEPTANCE_IMAGE=newsclaw-acceptance:local
mkdir -p "$ACCEPTANCE_REPORT_DIR"
export ACCEPTANCE_SOURCE ACCEPTANCE_REPORT_DIR ACCEPTANCE_IMAGE ACCEPTANCE_BASE ACCEPTANCE_HEAD
stage=initialization
image_ready=0
resources=0
failure=''
dc() { "$DOCKER" compose --env-file /dev/null -p "$project" -f compose.acceptance.yaml "$@"; }
finish() {
  result=$?
  report_ready=0
  trap - EXIT INT TERM
  set +e
  if [ "$result" -ne 0 ] && [ -z "$failure" ] && { [ "$stage" != checks ] || [ ! -s "$ACCEPTANCE_REPORT_DIR/report.json" ]; }; then failure="$stage failed"; fi
  if [ "$resources" -eq 1 ]; then
    dc down --volumes --remove-orphans >>"$ACCEPTANCE_REPORT_DIR/infrastructure.log" 2>&1
    if [ "$?" -ne 0 ]; then failure='test environment cleanup failed'; stage=cleanup; result=1; fi
  fi
  if [ "$image_ready" -eq 1 ]; then
    if [ -n "$failure" ]; then
      "$DOCKER" run --rm --network none -v "$ACCEPTANCE_REPORT_DIR:/reports" "$ACCEPTANCE_IMAGE" node /tools/scripts/checks/check.mjs --finalize /reports --failure "$failure" >>"$ACCEPTANCE_REPORT_DIR/infrastructure.log" 2>&1
    else
      "$DOCKER" run --rm --network none -v "$ACCEPTANCE_REPORT_DIR:/reports" "$ACCEPTANCE_IMAGE" node /tools/scripts/checks/check.mjs --finalize /reports >>"$ACCEPTANCE_REPORT_DIR/infrastructure.log" 2>&1
    fi
    if [ "$?" -eq 0 ]; then
      report_ready=1
    else
      result=1
      [ -n "$failure" ] || failure='report finalization failed'
    fi
  fi
  if [ "$report_ready" -ne 1 ] || [ ! -s "$ACCEPTANCE_REPORT_DIR/index.html" ]; then
    result=1
    [ -n "$failure" ] || failure="$stage failed"
    if [ -s "$ACCEPTANCE_REPORT_DIR/report.json" ]; then
      mv "$ACCEPTANCE_REPORT_DIR/report.json" "$ACCEPTANCE_REPORT_DIR/checks-before-finalize.json"
    fi
    printf '{"status":"failed","failure":"%s","source":null,"stages":[]}\n' "$failure" >"$ACCEPTANCE_REPORT_DIR/report.json"
    printf '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>NewsClaw 验收报告</title><style>body{max-width:760px;margin:48px auto;padding:24px;font:16px/1.7 system-ui;color:#20232d}pre{white-space:pre-wrap}</style><h1>NewsClaw 验收未完成</h1><p>阶段：%s。失败原因：%s。</p><p>查看 <a href="infrastructure.log">环境日志</a>，处理问题后重新运行验收。</p>' "$stage" "$failure" >"$ACCEPTANCE_REPORT_DIR/index.html"
    if [ -s "$ACCEPTANCE_REPORT_DIR/checks-before-finalize.json" ]; then
      printf '<p>收尾失败前取得的<a href="checks-before-finalize.json">原始检查结果</a>已保留，本轮验收状态为失败。</p>' >>"$ACCEPTANCE_REPORT_DIR/index.html"
    fi
    printf '</html>\n' >>"$ACCEPTANCE_REPORT_DIR/index.html"
  fi
  printf '\nNewsClaw 验收报告：%s/index.html\n退出码：%s\n' "$ACCEPTANCE_REPORT_DIR" "$result"
  exit "$result"
}
trap finish EXIT
trap 'failure="interrupted"; exit 130' INT
trap 'failure="terminated"; exit 143' TERM
if [ -d .git ]; then
  git_directory="$ACCEPTANCE_SOURCE/.git"
else
  IFS= read -r git_link < .git
  case "$git_link" in 'gitdir: '*) git_directory=${git_link#gitdir: } ;; *) echo 'Git metadata not found.' >&2; exit 1 ;; esac
  case "$git_directory" in /*) ;; *) git_directory="$ACCEPTANCE_SOURCE/$git_directory" ;; esac
fi
git_directory=$(CDPATH= cd "$git_directory" && pwd -P)
ACCEPTANCE_GIT_COMMON=$git_directory
if [ -f "$git_directory/commondir" ]; then
  IFS= read -r common_link < "$git_directory/commondir"
  case "$common_link" in /*) ACCEPTANCE_GIT_COMMON=$common_link ;; *) ACCEPTANCE_GIT_COMMON="$git_directory/$common_link" ;; esac
  ACCEPTANCE_GIT_COMMON=$(CDPATH= cd "$ACCEPTANCE_GIT_COMMON" && pwd -P)
fi
case "$git_directory" in
  "$ACCEPTANCE_GIT_COMMON") SOURCE_GIT_DIRECTORY=/git-source ;;
  "$ACCEPTANCE_GIT_COMMON"/*) SOURCE_GIT_DIRECTORY="/git-source/${git_directory#"$ACCEPTANCE_GIT_COMMON"/}" ;;
  *) echo 'Git worktree metadata is outside its common repository.' >&2; exit 1 ;;
esac
export ACCEPTANCE_GIT_COMMON SOURCE_GIT_DIRECTORY
"$DOCKER" compose version >>"$ACCEPTANCE_REPORT_DIR/infrastructure.log" 2>&1
stage=build
printf 'Building NewsClaw acceptance tools...\n'
"$DOCKER" build -f Dockerfile.acceptance -t "$ACCEPTANCE_IMAGE" . >>"$ACCEPTANCE_REPORT_DIR/infrastructure.log" 2>&1
image_ready=1
stage=startup
resources=1
printf 'Starting isolated test database and queue...\n'
dc up -d --wait --wait-timeout 120 db redis >>"$ACCEPTANCE_REPORT_DIR/infrastructure.log" 2>&1
stage=checks
printf 'Running NewsClaw checks...\n'
set +e
dc run --rm --no-deps acceptance
result=$?
set -e
if [ "$result" -ne 0 ]; then
  [ -s "$ACCEPTANCE_REPORT_DIR/report.json" ] || failure='checks failed before a result was recorded'
  exit "$result"
fi
stage=completed
