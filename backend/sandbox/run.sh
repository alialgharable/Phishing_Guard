#!/usr/bin/env sh
set -eu
: "${PHISHGUARD_SANDBOX_IMAGE:=phishguard-sandbox}"
: "${PHISHGUARD_SANDBOX_NETWORK:=pg-sandbox}"
: "${PHISHGUARD_SANDBOX_TIMEOUT:=120}"
exec timeout --signal=KILL "${PHISHGUARD_SANDBOX_TIMEOUT}" docker run --rm \
  --read-only --cap-drop=ALL --security-opt=no-new-privileges \
  --pids-limit=256 --memory=1g --cpus=1 \
  --tmpfs /tmp:rw,size=256m --tmpfs /profile:rw,size=128m \
  --network "${PHISHGUARD_SANDBOX_NETWORK}" \
  "${PHISHGUARD_SANDBOX_IMAGE}" "$@"
