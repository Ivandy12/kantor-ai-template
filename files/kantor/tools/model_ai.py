#!/opt/hermes/.venv/bin/python
# Kantor AI — menu Model AI (dipanggil proxy/model-ai.js). Lokasi: /opt/data/kantor/tools/model_ai.py
"""Pengaturan Model AI Kantor: simpan endpoint + API key (OpenAI-compatible), tes, terapkan ke semua agent.
Usage: model_ai.py status | test | apply | reapply | models | agent_model   (input JSON lewat stdin untuk test/apply). Output JSON.
"""
import json, os, sys, time, glob, shutil, subprocess, urllib.request, urllib.error

STATE = "/opt/data/kantor3d/state/model-ai.json"
PROFILES_DIR = "/opt/data/profiles"
MAIN_HOME = "/opt/data"
PROVIDER_NAME = "Model AI Kantor"
PROVIDER_SLUG = "custom:model-ai-kantor"
KEY_ENV = "MODEL_AI_KANTOR_API_KEY"
PC_NODE_MODULES = "/opt/data/.npm-global/lib/node_modules/paperclipai/node_modules"
LOG = "/opt/data/kantor3d/state/model-ai.log"
def _pg_port():
    try:
        c = json.load(open("/opt/data/home/.paperclip/instances/default/config.json"))
        return int(((c.get("database") or {}).get("embeddedPostgresPort")) or 54329)
    except Exception:
        return 54329
PG_PORT = _pg_port()

def out(o):
    print(json.dumps(o, ensure_ascii=False)); sys.exit(0)

def log(msg):
    with open(LOG, "a") as f: f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")

def load_state():
    try: return json.load(open(STATE))
    except Exception: return {}

def save_state(s):
    tmp = STATE + ".tmp"
    with open(tmp, "w") as f: json.dump(s, f, indent=1)
    os.chmod(tmp, 0o600); os.replace(tmp, STATE)

def mask(k):
    return "" if not k else (k[:4] + "…" + k[-4:] if len(k) > 10 else "****")

def norm_base(u):
    u = (u or "").strip().rstrip("/")
    for suf in ("/chat/completions", "/models"):
        if u.endswith(suf): u = u[: -len(suf)]
    return u

def http(method, url, key, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json", "User-Agent": "KantorAI/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)

def err_text(raw):
    try:
        j = json.loads(raw); e = j.get("error", j)
        m = e.get("message") if isinstance(e, dict) else str(e)
        return (m or raw)[:400]
    except Exception:
        return raw[:400]

def do_test(inp):
    s = load_state()
    base = norm_base(inp.get("base_url") or s.get("base_url"))
    key = (inp.get("api_key") or "").strip() or s.get("api_key", "")
    model = (inp.get("model") or "").strip()
    if not base.startswith(("http://", "https://")): out({"ok": False, "error": "Endpoint harus diawali http:// atau https://"})
    if not key: out({"ok": False, "error": "API key masih kosong."})
    res = {"ok": False, "base_url": base, "models": [], "models_ok": False}
    code, raw = http("GET", base + "/models", key, timeout=20)
    if code == 200:
        try:
            res["models"] = sorted(m.get("id") for m in json.loads(raw).get("data", []) if m.get("id"))[:500]
            res["models_ok"] = True
        except Exception: pass
    else:
        res["models_error"] = f"HTTP {code}: {err_text(raw)}"
    if not model:
        res["ok"] = res["models_ok"]
        if not res["ok"]: res["error"] = res.get("models_error", "Gagal ambil daftar model.")
        out(res)
    t0 = time.time()
    ok, info = chat_ok(base, key, model)
    res["latency_ms"] = int((time.time() - t0) * 1000)
    if ok: res["ok"] = True; res["reply"] = info
    else: res["error"] = info
    out(res)

def parse_reply(raw):
    """Balasan JSON biasa atau SSE (data: ...). Return (teks, error)."""
    raw = raw.strip()
    if raw.startswith("{"):
        j = json.loads(raw)
        if j.get("error"): return "", err_text(raw)
        return msg_text((j.get("choices") or [{}])[0].get("message") or {}), ""
    text, errs = "", []
    for line in raw.splitlines():
        line = line.strip()
        if not line.startswith("data:"): continue
        d = line[5:].strip()
        if d == "[DONE]": break
        try: j = json.loads(d)
        except Exception: continue
        if j.get("error"): errs.append(err_text(d)); continue
        for c in j.get("choices", []):
            text += msg_text(c.get("delta") or c.get("message") or {})
    return text.strip(), "; ".join(errs)

def msg_text(m):
    """Isi teks balasan; content bisa string atau list blok. Kalau cuma ada reasoning, tetap dihitung membalas."""
    c = m.get("content")
    if isinstance(c, list):
        c = "".join((b.get("text") or "") if isinstance(b, dict) else str(b) for b in c)
    c = (c or "").strip()
    if not c:
        c = (m.get("reasoning_content") or m.get("reasoning") or "").strip()
        if c: c = "(model berpikir) " + c[:80]
    return c

def chat_ok(base, key, model, _retry=True):
    """Tes sungguhan: model harus membalas teks. Return (ok, balasan_atau_error)."""
    code, raw = http("POST", base + "/chat/completions", key, {
        "model": model, "messages": [{"role": "user", "content": "Balas satu kata saja: siap"}],
        "max_tokens": 400, "stream": False}, timeout=90)
    if code != 200: return False, f"HTTP {code}: {err_text(raw)}"
    try: text, err = parse_reply(raw)
    except Exception: return False, "Balasan tidak bisa dibaca: " + raw[:200]
    if err: return False, err
    if not text:
        if _retry:
            time.sleep(2); return chat_ok(base, key, model, False)
        return False, "Model tidak membalas (kosong). Coba model lain. Balasan server: " + raw[:150]
    return True, text[:200]

# ---------- YAML
from ruamel.yaml import YAML
yaml = YAML(); yaml.preserve_quotes = True; yaml.width = 4096; yaml.indent(mapping=2, sequence=4, offset=2)

def root_of(base):
    b = (base or "").rstrip("/")
    return b[:-3] if b.endswith("/v1") else b

def messages_ok(base, key, model):
    """v1.5: endpoint yang melayani /v1/messages (format Anthropic) bisa pakai prompt caching -> token jauh lebih hemat."""
    if "claude" not in (model or "").lower(): return False
    body = json.dumps({"model": model, "max_tokens": 8, "messages": [{"role": "user", "content": "tes, jawab: ok"}]}).encode()
    req = urllib.request.Request(root_of(base) + "/v1/messages", data=body, method="POST", headers={
        "x-api-key": key, "Authorization": "Bearer " + key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode("utf8", "replace").strip()
        # beberapa router menambah "data: [DONE]" setelah JSON -> baca objek pertama saja
        d, _ = json.JSONDecoder().raw_decode(raw)
        return isinstance(d, dict) and d.get("type") == "message" and isinstance(d.get("content"), list)
    except Exception:
        return False

def edit_config(home, base, key, model, fallback, mode="chat"):
    path = os.path.join(home, "config.yaml")
    if not os.path.exists(path): return False
    with open(path) as f: cfg = yaml.load(f) or {}
    shutil.copy2(path, path + ".bak-modelai")
    m = cfg.get("model")
    if not isinstance(m, dict): cfg["model"] = m = {}
    anth = mode == "anthropic"
    url = root_of(base) if anth else base
    m["provider"] = PROVIDER_SLUG; m["base_url"] = url; m["default"] = model; m["api_key"] = key
    cps = cfg.get("custom_providers")
    if not isinstance(cps, list): cfg["custom_providers"] = cps = []
    entry = None
    for e in cps:
        if isinstance(e, dict) and str(e.get("name", "")).strip().lower() == PROVIDER_NAME.lower(): entry = e
    if entry is None:
        entry = {}; cps.append(entry)
    entry["name"] = PROVIDER_NAME; entry["base_url"] = url; entry["key_env"] = KEY_ENV
    if anth: entry["api_mode"] = "anthropic_messages"
    else:
        for k in ("api_mode", "transport"): entry.pop(k, None)
    fbs = [f.strip() for f in (fallback or "").split(",") if f.strip()]
    models = {model: {}}
    for f in fbs: models[f] = {}
    entry["models"] = models
    if fbs:
        cfg["fallback_model"] = [{"model": f, "provider": PROVIDER_SLUG} for f in fbs]
    elif "fallback_model" in cfg:
        del cfg["fallback_model"]
    # batas waktu panjang: jawaban besar (rencana bisnis, kode) bisa >30 dtk
    pv = cfg.get("providers")
    if not isinstance(pv, dict): cfg["providers"] = pv = {}
    for pid in ("custom", PROVIDER_SLUG, "model-ai-kantor"):
        e = pv.get(pid)
        if not isinstance(e, dict): pv[pid] = e = {}
        e["request_timeout_seconds"] = 600; e["stale_timeout_seconds"] = 600
    with open(path, "w") as f: yaml.dump(cfg, f)
    # .env
    envp = os.path.join(home, ".env")
    lines = []
    if os.path.exists(envp):
        shutil.copy2(envp, envp + ".bak-modelai")
        lines = [l for l in open(envp).read().splitlines() if not l.startswith(KEY_ENV + "=")]
    lines.append(f"{KEY_ENV}={key}")
    with open(envp, "w") as f: f.write("\n".join(lines) + "\n")
    os.chmod(envp, 0o600)
    return True

NODE_DB = r"""
const pg=require('pg');(async()=>{const c=new pg.Client({host:'127.0.0.1',port:parseInt(process.env.PG_PORT||'54329',10),user:'paperclip',password:'paperclip',database:'paperclip'});await c.connect();
const [mode,model,prov]=process.argv.slice(1);
if(mode==='list'){const r=await c.query("select id,name,status,adapter_type,adapter_config->>'model' model,adapter_config->>'provider' provider,adapter_config->'env'->'HERMES_HOME'->>'value' home from agents order by name");console.log(JSON.stringify(r.rows));}
else if(mode==='one' && model && prov){const r=await c.query("update agents set adapter_config = adapter_config || jsonb_build_object('model',$1::text,'provider','auto'), updated_at=now() where id=$2::uuid and adapter_type='hermes_local' returning name",[model,prov]);console.log(JSON.stringify(r.rows.map(x=>x.name)));}
else if(mode==='apply' && model && prov){const r=await c.query("update agents set adapter_config = adapter_config || jsonb_build_object('model',$1::text,'provider',$2::text), updated_at=now() where adapter_type='hermes_local' returning name",[model,prov]);console.log(JSON.stringify(r.rows.map(x=>x.name)));}else{console.log('null')}
await c.end()})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1)})
"""

def db(*args):
    p = subprocess.run(["node", "-e", NODE_DB, *args], capture_output=True, text=True, timeout=30,
                       env={**os.environ, "NODE_PATH": PC_NODE_MODULES, "PG_PORT": str(PG_PORT)})
    return json.loads(p.stdout.strip() or "null")

def agent_homes():
    homes = set()
    try:
        for a in db("list") or []:
            if a.get("adapter_type") == "hermes_local" and a.get("home"): homes.add(a["home"])
    except Exception: pass
    for d in glob.glob(PROFILES_DIR + "/kantor*"):
        if os.path.exists(d + "/config.yaml"): homes.add(d)
    return sorted(homes)

def restart_gateways(homes, main):
    done = []
    for h in homes:
        svc = "/run/service/gateway-" + os.path.basename(h)
        if os.path.isdir(svc):
            subprocess.run(["/command/s6-svc", "-r", svc], capture_output=True); done.append(os.path.basename(h))
    # gateway tanpa service s6 (mis. bot Telegram kantor "kantortg" lewat kantor-svc): matikan, penjaga menyalakan lagi
    left = [h for h in homes if not os.path.isdir("/run/service/gateway-" + os.path.basename(h))]
    for pid in os.listdir("/proc"):
        if not pid.isdigit() or not left: continue
        try:
            cmd = open(f"/proc/{pid}/cmdline", "rb").read().replace(b"\0", b" ").decode()
            if "gateway run" not in cmd: continue
            env = open(f"/proc/{pid}/environ", "rb").read().split(b"\0")
            hh = next((e[12:].decode() for e in env if e.startswith(b"HERMES_HOME=")), "")
            if hh in left: os.kill(int(pid), 15); done.append(os.path.basename(hh))
        except Exception: pass
    if main and os.path.isdir("/run/service/gateway-default"):
        subprocess.run(["/command/s6-svc", "-r", "/run/service/gateway-default"], capture_output=True); done.append("default")
    return done

# ---------- v1.5.1: model per agent
def endpoint():
    """Endpoint aktif: Model AI kalau sudah diterapkan, kalau belum 9Router lokal (kunci dari profil Hermes)."""
    s = load_state()
    if s.get("applied_at") and s.get("base_url") and s.get("api_key"): return s["base_url"], s["api_key"]
    for envf in (os.path.join(PROFILES_DIR, "kantorceo", ".env"), os.path.join(MAIN_HOME, ".env")):
        try:
            for l in open(envf).read().splitlines():
                if l.startswith("HERMES_CUSTOM_HTTP_127_0_0_1_20128_V1_API_KEY="):
                    k = l.split("=", 1)[1].strip().strip('"').strip("'")
                    if k: return "http://127.0.0.1:20128/v1", k
        except OSError: pass
    return "http://127.0.0.1:20128/v1", ""

def do_models():
    base, key = endpoint()
    code, raw = http("GET", base + "/models", key, timeout=20)
    if code != 200: out({"ok": False, "error": f"HTTP {code}: {err_text(raw)}", "models": []})
    try: models = sorted(m.get("id") for m in json.loads(raw).get("data", []) if m.get("id"))[:500]
    except Exception: models = []
    out({"ok": True, "base_url": base, "models": models})

def apply_overrides(s):
    done = []
    for aid, m in (s.get("agent_models") or {}).items():
        try:
            r = db("one", m, aid)
            if r: done += r
        except Exception: pass
    return done

def do_agent_model(inp):
    aid = str(inp.get("agent_id") or "").strip(); model = str(inp.get("model") or "").strip()
    if not aid: out({"ok": False, "error": "Agent belum dipilih."})
    s = load_state(); am = dict(s.get("agent_models") or {})
    if not model:  # kembali ikut model default
        am.pop(aid, None)
        default = s.get("model") or ""
        if default: db("one", default, aid)
        s["agent_models"] = am; save_state(s); log(f"agent {aid} -> default {default}")
        out({"ok": True, "model": default, "default": True})
    if not inp.get("skip_test"):
        base, key = endpoint()
        ok, info = chat_ok(base, key, model)
        if not ok: out({"ok": False, "error": f"Model {model} tidak membalas, belum dipasang. {info[:200]}"})
    r = db("one", model, aid)
    if not r: out({"ok": False, "error": "Agent tidak ditemukan."})
    am[aid] = model; s["agent_models"] = am; save_state(s); log(f"agent {r} -> {model}")
    out({"ok": True, "model": model, "agent": r[0] if isinstance(r, list) and r else aid})

def do_apply(inp):
    s = load_state()
    base = norm_base(inp.get("base_url") or s.get("base_url"))
    key = (inp.get("api_key") or "").strip() or s.get("api_key", "")
    model = (inp.get("model") or "").strip()
    fallback = ""  # satu model saja, tanpa cadangan (lebih cepat)
    apply_main = bool(inp.get("apply_main", True))
    if not base or not key or not model: out({"ok": False, "error": "Endpoint, API key, dan model wajib diisi."})
    # tes dulu, jangan terapkan kalau gagal
    ok, info = chat_ok(base, key, model)
    if not ok: out({"ok": False, "error": f"Tes model utama gagal, belum diterapkan. {info}"})
    mode = "anthropic" if messages_ok(base, key, model) else "chat"
    warn = []
    for f in [f.strip() for f in fallback.split(",") if f.strip()]:
        ok, info = chat_ok(base, key, f)
        if not ok: warn.append(f"{f}: {info[:120]}")
    homes = agent_homes()
    edited, failed = [], []
    for h in homes:
        try:
            if edit_config(h, base, key, model, fallback, mode): edited.append(os.path.basename(h))
        except Exception as e: failed.append(f"{os.path.basename(h)}: {e}")
    if apply_main:
        try: edit_config(MAIN_HOME, base, key, model, fallback, mode); edited.append("Hermes utama")
        except Exception as e: failed.append(f"Hermes utama: {e}")
    # provider "auto": adapter Paperclip tidak kenal custom:..., jadi biar Hermes pakai provider di profil
    try: agents = db("apply", model, "auto")
    except Exception as e: agents = {"error": str(e)}
    apply_overrides(s)
    restarted = restart_gateways(homes, apply_main)
    s.update({"base_url": base, "api_key": key, "model": model, "fallback_model": fallback,
              "apply_main": apply_main, "api_mode": mode, "applied_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    save_state(s)
    log(f"apply base={base} model={model} fallback={fallback} profiles={len(edited)} failed={failed}")
    out({"ok": not failed, "warnings": warn, "hemat_cache": mode == "anthropic", "profiles": edited, "failed": failed, "agents": agents, "restarted": restarted})

def do_reapply():
    """Pasang ulang setting tersimpan tanpa tes (dipakai install.sh --update supaya model tidak tertimpa)."""
    s = load_state()
    if not (s.get("applied_at") and s.get("base_url") and s.get("api_key") and s.get("model")):
        out({"ok": True, "skipped": "Model AI belum pernah diterapkan"})
    mode = s.get("api_mode")
    if mode != "anthropic":  # cek ulang tiap update: endpoint bisa jadi sudah mendukung mode hemat
        mode = "anthropic" if messages_ok(s["base_url"], s["api_key"], s["model"]) else "chat"
        s["api_mode"] = mode; save_state(s)
    homes = agent_homes(); edited, failed = [], []
    for h in homes:
        try:
            if edit_config(h, s["base_url"], s["api_key"], s["model"], "", mode): edited.append(os.path.basename(h))
        except Exception as e: failed.append(f"{os.path.basename(h)}: {e}")
    if s.get("apply_main", True):
        try: edit_config(MAIN_HOME, s["base_url"], s["api_key"], s["model"], "", mode)
        except Exception as e: failed.append(f"Hermes utama: {e}")
    try: agents = db("apply", s["model"], "auto")
    except Exception as e: agents = {"error": str(e)}
    apply_overrides(s)
    log(f"reapply profiles={len(edited)} failed={failed}")
    out({"ok": not failed, "profiles": edited, "failed": failed, "agents": agents})

def do_status():
    s = load_state()
    try: agents = db("list") or []
    except Exception: agents = []
    out({"ok": True, "saved": bool(s.get("api_key")), "base_url": s.get("base_url", ""), "api_key_masked": mask(s.get("api_key", "")),
         "model": s.get("model", ""), "fallback_model": "", "apply_main": s.get("apply_main", True),
         "applied_at": s.get("applied_at", ""), "hemat_cache": s.get("api_mode") == "anthropic",
         "agents": [{"id": a["id"], "name": a["name"], "model": a.get("model"), "custom": a["id"] in (s.get("agent_models") or {}),
                     "provider": (PROVIDER_SLUG if a.get("provider") == "auto" and s.get("model") else a.get("provider"))}
                    for a in agents if a.get("adapter_type") == "hermes_local" and a.get("status") not in ("terminated", "pending_approval")]})

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    inp = {}
    if cmd in ("test", "apply", "agent_model"):
        try: inp = json.loads(sys.stdin.read() or "{}")
        except Exception: out({"ok": False, "error": "Input tidak valid."})
    {"status": lambda: do_status(), "test": lambda: do_test(inp), "apply": lambda: do_apply(inp), "reapply": lambda: do_reapply(), "models": lambda: do_models(), "agent_model": lambda: do_agent_model(inp)}.get(cmd, lambda: out({"ok": False, "error": "perintah?"}))()
