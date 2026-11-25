#!/usr/bin/env python3
"""Kantor 3D: pastikan koneksi gateway tetap ke adapter kantor (ws://localhost:18790).
Kadang tampilan 3D menyimpan pengaturan bawaan Hermes3D (http://localhost:3000/api/runtime/custom)
saat adapter sempat mati -> kantor 3D macet di layar "HERMES3D". Aman dijalankan berulang."""
import json, os, sys, time

F = os.environ.get("HERMES3D_SETTINGS", "/opt/data/home/.hermes/hermes3d/settings.json")
URL = "ws://localhost:18790"
if not os.path.exists(F):
    sys.exit(0)
try:
    d = json.load(open(F))
except Exception:
    sys.exit(0)
g = d.get("gateway") or {}
floors = d.get("officeFloors") or {}
bad = g.get("url") != URL or g.get("adapterType") != "hermes" or any(
    (fl or {}).get("gatewayUrl") not in (None, URL) for fl in floors.values())
if not bad:
    sys.exit(0)
d["gateway"] = {"url": URL, "token": g.get("token", "") if g.get("adapterType") == "hermes" else "", "adapterType": "hermes"}
for fl in floors.values():
    if isinstance(fl, dict):
        fl["gatewayUrl"] = URL
        fl["status"] = "disconnected"
        fl.pop("lastErrorCode", None)
        fl.pop("lastErrorMessage", None)
tmp = F + ".tmp"
json.dump(d, open(tmp, "w"), indent=2)
os.replace(tmp, F)
print(time.strftime("%Y-%m-%d %H:%M:%S"), "kantor3d: gateway dikembalikan ke", URL)
