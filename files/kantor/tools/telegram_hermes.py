#!/usr/bin/env python3
"""Kantor AI — sambungkan Hermes UTAMA (bot Telegram pribadi) dari web kantor.
Perintah (input JSON lewat stdin):
  status            -> {connected, bot, users, ...}
  detect  {token}   -> cek token + ambil ID Telegram dari pesan terakhir ke bot
  apply   {token, user_id} -> simpan ke /opt/data/.env, restart gateway Hermes utama
  off               -> lepas bot Telegram dari Hermes utama
Token tidak pernah ditampilkan utuh di keluaran.
"""
import json, os, re, sys, time, shutil, subprocess, urllib.request, urllib.error

DATA = "/opt/data"
ENVF = os.path.join(DATA, ".env")
KANTOR_TG_ENV = os.path.join(DATA, "profiles", "kantortg", ".env")
LOG = os.path.join(DATA, "kantor3d", "state", "telegram-hermes.log")
TOKEN_RE = re.compile(r"^\d{5,15}:[A-Za-z0-9_-]{30,60}$")


def out(o):
    print(json.dumps(o, ensure_ascii=False)); sys.exit(0)


def log(msg):
    try:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        with open(LOG, "a") as f: f.write(time.strftime("%F %T ") + msg + "\n")
    except OSError: pass


def mask(t):
    return (t.split(":")[0] + ":…" + t[-4:]) if t and ":" in t else ""


def read_env(path):
    d = {}
    try:
        for l in open(path).read().splitlines():
            if "=" in l and not l.lstrip().startswith("#"):
                k, v = l.split("=", 1); d[k.strip()] = v.strip().strip('"').strip("'")
    except OSError: pass
    return d


def write_env(path, updates):
    lines = open(path).read().splitlines() if os.path.exists(path) else []
    if os.path.exists(path): shutil.copy2(path, path + ".bak-telegram")
    seen = set(); new = []
    for l in lines:
        k = l.split("=", 1)[0].strip() if "=" in l else None
        if k in updates:
            seen.add(k)
            if updates[k] is not None: new.append(f"{k}={updates[k]}")
            continue
        new.append(l)
    for k, v in updates.items():
        if k not in seen and v is not None: new.append(f"{k}={v}")
    with open(path, "w") as f: f.write("\n".join(new) + "\n")
    os.chmod(path, 0o600)


def tg(token, method, params=None, timeout=20):
    url = f"https://api.telegram.org/bot{token}/{method}"
    data = json.dumps(params or {}).encode()
    req = urllib.request.Request(url, data=data, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try: return json.loads(e.read().decode())
        except Exception: return {"ok": False, "description": f"HTTP {e.code}"}
    except Exception as e:
        return {"ok": False, "description": f"Tidak bisa menghubungi Telegram: {e}"}


def check_token(token):
    token = (token or "").strip()
    if not TOKEN_RE.match(token):
        return None, "Format token salah. Contoh: 123456789:AAH... (salin utuh dari @BotFather)."
    me = tg(token, "getMe")
    if not me.get("ok"):
        return None, "Token ditolak Telegram: " + str(me.get("description", ""))[:150]
    if token == read_env(KANTOR_TG_ENV).get("TELEGRAM_BOT_TOKEN"):
        return None, "Token ini sudah dipakai bot Telegram kantor (Arga). Buat bot baru di @BotFather untuk Hermes utama."
    return me["result"], None


def gateway_restart():
    for slot in ("/run/hermes-service/gateway-default", "/run/service/gateway-default"):
        if os.path.isdir(slot):
            r = subprocess.run(["/command/s6-svc", "-r", slot], capture_output=True, text=True)
            if r.returncode == 0: return slot
    # tanpa slot s6: matikan gateway utama, supervisor akan menyalakan ulang
    for pid in os.listdir("/proc"):
        if not pid.isdigit(): continue
        try:
            cmd = open(f"/proc/{pid}/cmdline", "rb").read().replace(b"\0", b" ")
            env = open(f"/proc/{pid}/environ", "rb").read().split(b"\0")
        except OSError: continue
        if b"gateway run" in cmd and (b"HERMES_HOME=/opt/data" in env or not any(e.startswith(b"HERMES_HOME=") for e in env)):
            os.kill(int(pid), 15); return "kill"
    return None


def gateway_telegram_state():
    try:
        st = json.load(open(os.path.join(DATA, "gateway_state.json")))
    except Exception:
        return None
    s = json.dumps(st).lower()
    if "telegram" not in s: return None
    plats = st.get("platforms") if isinstance(st, dict) else None
    if isinstance(plats, dict) and isinstance(plats.get("telegram"), dict):
        p = plats["telegram"]
        return str(p.get("state") or p.get("status") or p.get("connected"))
    return "ada"


def do_status():
    e = read_env(ENVF)
    tok = e.get("TELEGRAM_BOT_TOKEN", "")
    res = {"ok": True, "connected": bool(tok), "token_masked": mask(tok), "users": e.get("TELEGRAM_ALLOWED_USERS", ""),
           "gateway": gateway_telegram_state()}
    if tok:
        me = tg(tok, "getMe", timeout=10)
        if me.get("ok"): res["bot"] = "@" + me["result"].get("username", "")
        else: res["warning"] = "Token tersimpan tapi ditolak Telegram: " + str(me.get("description", ""))[:120]
    out(res)


def do_detect(inp):
    token = (inp.get("token") or "").strip() or read_env(ENVF).get("TELEGRAM_BOT_TOKEN", "")
    me, err = check_token(token) if inp.get("token") else (tg(token, "getMe").get("result"), None)
    if err or not me: out({"ok": False, "error": err or "Token belum ada."})
    up = tg(token, "getUpdates", {"limit": 50, "timeout": 0})
    users = {}
    if up.get("ok"):
        for u in up.get("result", []):
            m = u.get("message") or u.get("edited_message") or {}
            f = m.get("from") or {}
            if f.get("id") and not f.get("is_bot"):
                users[str(f["id"])] = {"id": str(f["id"]), "nama": " ".join(x for x in (f.get("first_name"), f.get("last_name")) if x),
                                       "username": f.get("username", "")}
    note = None if users else (f"Belum ada pesan. Buka @{me.get('username')} di Telegram, kirim /start, lalu klik Cari ID lagi."
                              if up.get("ok") else "Bot sedang dipakai Hermes, jadi ID tidak bisa dibaca otomatis. Isi ID manual (cek di @userinfobot).")
    out({"ok": True, "bot": "@" + me.get("username", ""), "users": list(users.values()), "note": note})


def do_apply(inp):
    token = (inp.get("token") or "").strip()
    cur = read_env(ENVF)
    if not token: token = cur.get("TELEGRAM_BOT_TOKEN", "")
    uid = re.sub(r"[^\d,]", "", str(inp.get("user_id") or ""))
    if not uid: out({"ok": False, "error": "ID Telegram wajib diisi (angka), supaya bot tidak bisa dipakai orang lain."})
    me, err = check_token(token)
    if err: out({"ok": False, "error": err})
    first = uid.split(",")[0]
    write_env(ENVF, {"TELEGRAM_BOT_TOKEN": token, "TELEGRAM_ALLOWED_USERS": uid,
                     "TELEGRAM_HOME_CHANNEL": cur.get("TELEGRAM_HOME_CHANNEL") or first})
    how = gateway_restart()
    log(f"apply bot=@{me.get('username')} users={uid} restart={how}")
    # tunggu gateway nyala lagi, lalu kirim pesan sapaan
    sent = False
    for _ in range(12):
        time.sleep(5)
        if gateway_telegram_state() is not None: break
    r = tg(token, "sendMessage", {"chat_id": first, "text": "✅ Hermes sudah tersambung ke Telegram. Silakan chat di sini."})
    sent = bool(r.get("ok"))
    out({"ok": True, "bot": "@" + me.get("username", ""), "users": uid, "restarted": bool(how), "sapaan_terkirim": sent,
         "note": None if sent else "Pesan tes belum terkirim: kirim /start ke bot dulu, lalu coba chat."})


def do_off():
    write_env(ENVF, {"TELEGRAM_BOT_TOKEN": "", "TELEGRAM_ALLOWED_USERS": ""})
    how = gateway_restart(); log("off")
    out({"ok": True, "restarted": bool(how)})


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    inp = {}
    if cmd in ("detect", "apply"):
        try: inp = json.loads(sys.stdin.read() or "{}")
        except Exception: out({"ok": False, "error": "Input tidak valid."})
    {"status": do_status, "detect": lambda: do_detect(inp), "apply": lambda: do_apply(inp), "off": do_off}.get(
        cmd, lambda: out({"ok": False, "error": "perintah?"}))()
