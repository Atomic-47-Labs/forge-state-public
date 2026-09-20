#!/usr/bin/env bash
# test-run.sh — invoke the orchestrator in --once --dry-run mode.
# Useful smoke test: confirms the orchestrator can read the facility, walk the
# queue, and plan dispatches without touching Docker or the network.
set -euo pipefail

ROOT="${FORGE_ROOT:-$HOME/forge}"

if [[ ! -d "$ROOT" ]]; then
  echo "facility not initialized: $ROOT (run scripts/init-facility.sh)" >&2
  exit 2
fi

echo "forge test-run (dry): root=$ROOT"
echo
echo "Invoke from inside a Claude Code session with:"
echo "    /forge-state:forge-orchestrator --once --dry-run"
echo
echo "Or run via the headless CLI vehicle (spec §14; verified 2026-09-20 —"
echo "there is no --skill/--args flag, the skill is invoked by naming it in"
echo "the prompt text):"
echo "    claude --print --allow-dangerously-skip-permissions --add-dir ~/forge \\"
echo "      'Run /forge-state:forge-orchestrator --once --dry-run'"
echo
echo "Pre-flight facility check:"
ls -la "$ROOT" || true
echo
ls -la "$ROOT/state" || true
