#!/bin/bash
# Pasang browser headless untuk adlib (sekali saja, ~110 MB). Aman diulang.
set -e
D=/opt/data/.cache/ms-playwright
PJ=/opt/data/kantor3d/Hermes3D/node_modules/playwright-core/browsers.json
REV=$(python3 -c "import json;print([b['revision'] for b in json.load(open('$PJ'))['browsers'] if b['name']=='chromium-headless-shell'][0])")
VER=$(python3 -c "import json;print([b['browserVersion'] for b in json.load(open('$PJ'))['browsers'] if b['name']=='chromium-headless-shell'][0])")
T=$D/chromium_headless_shell-$REV
if [ -x "$T/chrome-headless-shell-linux64/chrome-headless-shell" ]; then echo "adlib: browser sudah ada"; exit 0; fi
mkdir -p "$T"; Z=$(mktemp /tmp/chs.XXXXXX.zip)
curl -sfL -m 600 -o "$Z" "https://cdn.playwright.dev/chrome-for-testing-public/$VER/linux64/chrome-headless-shell-linux64.zip"
python3 - "$Z" "$T" <<'PY'
import zipfile, os, sys
z = zipfile.ZipFile(sys.argv[1])
for i in z.infolist():
    p = z.extract(i, sys.argv[2]); m = (i.external_attr >> 16) & 0o777
    if m: os.chmod(p, m)
PY
rm -f "$Z"; touch "$T/INSTALLATION_COMPLETE"
"$T/chrome-headless-shell-linux64/chrome-headless-shell" --version
