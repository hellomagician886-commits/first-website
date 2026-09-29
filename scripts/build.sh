#!/usr/bin/env bash
set -euo pipefail

NODE_BIN="${NODE_BIN:-node}"
"$NODE_BIN" scripts/build-worker.mjs
