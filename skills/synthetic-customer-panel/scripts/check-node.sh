#!/usr/bin/env bash
# check-node.sh — Node runtime floor preflight for the panel validators.
#
# Why this exists: the kit's deterministic tools are TypeScript, and Node runs
# them directly only from 22.18.0 up. Below that floor the .ts file fails to
# PARSE, so no guard inside the TypeScript can ever run — the buyer would see a
# raw SyntaxError instead of the plain-language upgrade action INSTALL.md step 8
# promises. The check therefore has to live outside the TypeScript, in the one
# runtime every buyer already has.
#
# Exit grammar: 0 pass · 1 the thing under test failed (Node missing or too
# old) · 3 harness error.
#
# Requires: bash and coreutils. Nothing else. Parses on Apple's stock bash 3.2.

set -u

FLOOR_MAJOR=22
FLOOR_MINOR=18
FLOOR_PATCH=0
FLOOR="${FLOOR_MAJOR}.${FLOOR_MINOR}.${FLOOR_PATCH}"

NODE_BIN="${NODE:-node}"

upgrade_action() {
  cat <<EOF

How to get Node ${FLOOR}+, using the supported installer for your system:

  macOS      Download the LTS installer from https://nodejs.org/en/download
             (or, if you already use Homebrew: brew install node)
  Windows    Download the LTS installer from https://nodejs.org/en/download
  Linux      Use your distribution's Node packages, or the official
             instructions at https://nodejs.org/en/download

Install it yourself from that page. Never paste a download-and-run pipeline
somebody handed you.

Without Node you can still use the room lifecycle (scripts/room.sh needs only
bash), and the panel workflows still run by hand. What you lose is the
script-enforced gate: panel and run validation drop to the T3 self-report path,
and a self-reported panel is labeled as such.
EOF
}

if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  echo "FAIL: Node is not installed, or is not on this shell's PATH."
  echo "This kit's panel and run validators need Node ${FLOOR} or newer."
  upgrade_action
  exit 1
fi

RAW_VERSION=$("$NODE_BIN" --version 2>/dev/null)
if [ -z "$RAW_VERSION" ]; then
  echo "ERROR: '$NODE_BIN --version' produced no output; cannot determine the Node version." >&2
  exit 3
fi

# v22.18.0 -> 22.18.0, and drop any prerelease/build suffix.
VERSION=${RAW_VERSION#v}
VERSION=${VERSION%%-*}
VERSION=${VERSION%%+*}

MAJOR=$(echo "$VERSION" | cut -d. -f1)
MINOR=$(echo "$VERSION" | cut -d. -f2)
PATCH=$(echo "$VERSION" | cut -d. -f3)

case "$MAJOR$MINOR$PATCH" in
  *[!0-9]*|"")
    echo "ERROR: could not parse a Node version out of '$RAW_VERSION'." >&2
    exit 3
    ;;
esac

too_old=0
if [ "$MAJOR" -lt "$FLOOR_MAJOR" ]; then
  too_old=1
elif [ "$MAJOR" -eq "$FLOOR_MAJOR" ]; then
  if [ "$MINOR" -lt "$FLOOR_MINOR" ]; then
    too_old=1
  elif [ "$MINOR" -eq "$FLOOR_MINOR" ] && [ "$PATCH" -lt "$FLOOR_PATCH" ]; then
    too_old=1
  fi
fi

if [ "$too_old" -eq 1 ]; then
  echo "FAIL: this machine has Node ${VERSION}; the kit needs Node ${FLOOR} or newer."
  echo "Below ${FLOOR}, Node cannot read the kit's TypeScript tools at all, so they"
  echo "would stop with a confusing syntax error rather than doing anything."
  upgrade_action
  exit 1
fi

echo "PASS: Node ${VERSION} meets the kit's floor of ${FLOOR}."
exit 0
