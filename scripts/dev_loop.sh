#!/usr/bin/env bash
# Autonomous dev-loop driver for Pro UPI QR.
#
# Mode 1 (default): HEADLESS RUN
#   Launches a fresh headless opencode session that reads AGENTS.md +
#   ROADMAP.md automatically and advances the top backlog item.
#   Designed for cron: */20 * * * *  /path/to/scripts/dev_loop.sh
#
# Mode 2 (--watch): TMUX WATCHDOG
#   Watches a running interactive opencode session in tmux. If the pane has
#   shown no new output for IDLE_MINUTES, injects "continue" into it.
#
# Guardrails:
#   - touch STOP            -> loop exits immediately (both modes)
#   - MIN_INTERVAL_MIN      -> rate-limits headless runs (default 15)
#   - MAX_RUNS_PER_DAY      -> hard daily cap (default 24)
#   - Every headless run ends with a git checkpoint commit (if changes exist)

set -uo pipefail
cd "$(dirname "$0")/.."

STOP_FILE=".devloop-stop"
STATE_DIR=".devloop"
MIN_INTERVAL_MIN="${MIN_INTERVAL_MIN:-15}"
MAX_RUNS_PER_DAY="${MAX_RUNS_PER_DAY:-24}"
IDLE_MINUTES="${IDLE_MINUTES:-10}"
TMUX_SESSION="${TMUX_SESSION:-opencode}"
CONTINUE_PROMPT="Continue development exactly per ROADMAP.md: pick the highest unchecked item, implement fully, test it in the browser, tick the checkbox, then update ROADMAP.md. Follow AGENTS.md conventions strictly. End with a git commit."

now=$(date +%s)

if [ -f "$STOP_FILE" ]; then
  echo "[devloop] $STOP_FILE exists — staying stopped. Remove it to resume."
  exit 0
fi

mkdir -p "$STATE_DIR"

# ---------- Mode 2: tmux watchdog ----------
if [ "${1:-}" = "--watch" ]; then
  while true; do
    [ -f "$STOP_FILE" ] && { echo "[devloop-watch] stopped"; exit 0; }
    last_mod=$(tmux display-message -p -t "$TMUX_SESSION" '#{pane_last_activity}' 2>/dev/null || echo "")
    if [ -z "$last_mod" ]; then
      echo "[devloop-watch] tmux session '$TMUX_SESSION' not found."
      exit 1
    fi
    idle=$(( now - last_mod ))
    if [ "$idle" -ge $(( IDLE_MINUTES * 60 )) ]; then
      echo "[devloop-watch] idle ${idle}s >= ${IDLE_MINUTES}m — injecting continue."
      tmux send-keys -t "$TMUX_SESSION" "$CONTINUE_PROMPT" Enter
      sleep 120  # give the agent time before checking again
    fi
    sleep 60
  done
fi

# ---------- Mode 1: headless cron run ----------
run_count_file="$STATE_DIR/runs_$(date +%Y-%m-%d)"
runs_today=$(cat "$run_count_file" 2>/dev/null || echo 0)
if [ "$runs_today" -ge "$MAX_RUNS_PER_DAY" ]; then
  echo "[devloop] daily cap reached ($MAX_RUNS_PER_DAY). Done for today."
  exit 0
fi

last_run_file="$STATE_DIR/last_run"
if [ -f "$last_run_file" ]; then
  last=$(cat "$last_run_file")
  elapsed=$(( (now - last) / 60 ))
  if [ "$elapsed" -lt "$MIN_INTERVAL_MIN" ]; then
    echo "[devloop] last run ${elapsed}m ago < ${MIN_INTERVAL_MIN}m cap. Skipping."
    exit 0
  fi
fi

echo "[devloop] starting headless session at $(date '+%F %T')"
opencode run "$CONTINUE_PROMPT"
status=$?

echo "$now" > "$last_run_file"
echo $(( runs_today + 1 )) > "$run_count_file"

# Checkpoint: commit whatever the session produced (reviewable history).
if ! git diff --quiet || ! git diff --cached --quiet; then
  git add -A
  git commit -m "devloop: automated development cycle $(date '+%F %R')" --no-verify >/dev/null 2>&1 \
    && echo "[devloop] committed checkpoint." \
    || echo "[devloop] nothing to commit or commit failed."
fi

echo "[devloop] run finished with status $status"
exit $status
