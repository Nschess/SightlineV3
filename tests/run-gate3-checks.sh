#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 tests/source-integrity.py evidence/gate3-preservation-audit.json
node --check AndroidProject/app/src/main/assets/phone-host/server.js
node tests/two-clients.mjs AndroidProject/app/src/main/assets/phone-host evidence/gate3-protocol.json
node tests/authoritative-combat.mjs AndroidProject/app/src/main/assets/phone-host/server.js
python3 tests/run-game-regressions.py
python3 tests/private-bind-smoke.py
printf '%s\n' 'Desktop-source Gate 3 checks passed. Native Android / APK gates remain blocked.'
