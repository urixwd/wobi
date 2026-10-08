#!/bin/sh
# Start the WOBI dev server from the repo root, wherever this is called from.
cd "$(dirname "$0")/.." || exit 1
exec bun run dev
