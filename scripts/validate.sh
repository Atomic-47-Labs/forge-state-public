#!/usr/bin/env bash
# validate.sh — walk ~/forge/experiments/*/experiment.yaml and validate each
# against plugin/schemas/experiment.schema.yaml. Pure bash + python3 (PyYAML, jsonschema).
set -euo pipefail

ROOT="${FORGE_ROOT:-$HOME/forge}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Schemas ship inside plugin/schemas/ so they're actually present in an
# installed plugin, not just in this dev repo (2026-09-20 audit: the old
# top-level schemas/ directory was never packaged with the plugin at all —
# validation silently never ran anywhere except a full dev checkout).
SCHEMA="$(cd "$HERE/.." && pwd)/plugin/schemas/experiment.schema.yaml"
MANIFEST_SCHEMA="$(cd "$HERE/.." && pwd)/plugin/schemas/manifest.schema.yaml"

if [[ ! -d "$ROOT" ]]; then
  echo "facility not initialized: $ROOT (run init-facility.sh)" >&2
  exit 2
fi

python3 - "$ROOT" "$SCHEMA" "$MANIFEST_SCHEMA" <<'PY'
import sys, os, glob, json, datetime
try:
    import yaml
except ImportError:
    print("missing dep: pip install pyyaml", file=sys.stderr); sys.exit(3)
try:
    import jsonschema
except ImportError:
    print("missing dep: pip install jsonschema", file=sys.stderr); sys.exit(3)

root, schema_path, manifest_schema_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(schema_path) as f: exp_schema = yaml.safe_load(f)
with open(manifest_schema_path) as f: man_schema = yaml.safe_load(f)

def normalize(obj):
    """PyYAML's implicit resolvers turn unquoted ISO timestamps into native
    datetime/date objects and bare numeric-looking version strings (e.g.
    `version: 0.1`) into floats — both real, dated findings from the
    2026-09-20 audit (every experiment.yaml in this facility uses unquoted
    timestamps; jsonschema's `type: string` check fails on the resulting
    datetime object rather than the YAML content actually being wrong).
    Recursively coerce those back to strings so validation reflects the
    YAML's real, intended meaning instead of a PyYAML/jsonschema interop
    quirk."""
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: normalize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [normalize(v) for v in obj]
    return obj

errors = 0
total  = 0

# Validate manifest
mpath = os.path.join(root, "manifest.yaml")
if os.path.exists(mpath):
    with open(mpath) as f: doc = normalize(yaml.safe_load(f))
    if isinstance(doc.get("version"), (int, float)):
        doc["version"] = str(doc["version"])
    try:
        jsonschema.validate(doc, man_schema)
        print(f"ok: manifest.yaml")
    except jsonschema.ValidationError as e:
        errors += 1
        print(f"FAIL: manifest.yaml — {e.message}")
else:
    print("FAIL: manifest.yaml missing"); errors += 1

# Validate each experiment
for path in sorted(glob.glob(os.path.join(root, "experiments", "*", "experiment.yaml"))):
    total += 1
    rel = os.path.relpath(path, root)
    with open(path) as f: doc = normalize(yaml.safe_load(f))
    try:
        jsonschema.validate(doc, exp_schema)
        print(f"ok: {rel}")
    except jsonschema.ValidationError as e:
        errors += 1
        print(f"FAIL: {rel} — {e.message}")

print(f"\n{total} experiments validated, {errors} errors")
sys.exit(1 if errors else 0)
PY
