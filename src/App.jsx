import React, { useState, useEffect, useMemo } from "react";
import {
  Plus, Search, X, Pencil, Trash2, ExternalLink, MapPin,
  Calendar, Building2, Briefcase, ChevronDown, Inbox, Check,
  Bell, Clock, Send, Copy, CheckCircle2, LogOut, User, ArrowRight, Lock,
} from "lucide-react";

/* ---------------------------------------------------------------------------
   Storage adapter.
   The original ran inside Claude and used a hosted `window.storage` API.
   This standalone build persists to the browser's localStorage instead,
   exposing the same get/set/delete shape the app expects.
--------------------------------------------------------------------------- */
const storage = {
  async get(key) {
    const value = localStorage.getItem(key);
    return value === null ? null : { key, value };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return { key, deleted: true };
  },
};

/* ----------------------------- design tokens ----------------------------- */
const T = {
  bg: "#F4F5F8",
  surface: "#FFFFFF",
  ink: "#0E1626",
  chrome: "#141C30",
  muted: "#667085",
  faint: "#98A2B3",
  border: "#E6E8EE",
  borderSoft: "#EFF1F5",
  accent: "#0E7C66",
  accentDark: "#0A5E4D",
};

/* option sets + their palette (bg tint / text) */
const METHOD = {
  "Online Job Portal": { bg: "#EAF0FF", fg: "#3451D1" },
  "Referral": { bg: "#E5F4FB", fg: "#1478A6" },
  "Email": { bg: "#FEF4E2", fg: "#B77112" },
  "Recruitment Agency": { bg: "#F1EAFB", fg: "#7B3FBF" },
};
const STATUS = {
  "Applied": { bg: "#EAF0FF", fg: "#3451D1" },
  "Interview Scheduled": { bg: "#E3F5F3", fg: "#0E7C66" },
  "Offer Received": { bg: "#E6F6EE", fg: "#0A7A47" },
  "Rejected": { bg: "#FDECEC", fg: "#C0392B" },
  "Withdrawn": { bg: "#EEF1F5", fg: "#5B6472" },
};
const STATUS_ORDER = ["Applied", "Interview Scheduled", "Offer Received", "Rejected", "Withdrawn"];

/* reminder schedule, counted from the date applied.
   reminders only run while an application is still "live". */
const REMINDERS = [
  { key: "review", week: 1, days: 7, action: "Review the status", kind: "review" },
  { key: "follow1", week: 2, days: 14, action: "Send a follow-up", kind: "followup" },
  { key: "follow2", week: 3, days: 21, action: "Re-send the follow-up", kind: "followup" },
];
const LIVE_STATUSES = new Set(["Applied", "Interview Scheduled"]);

const SAMPLE = [
  { id: "s1", company: "TechNova Inc", position: "Software Engineer", salary: "95000", location: "Austin, TX", listing: "https://technova.com/jobs/12345", date: "2025-09-01", method: "Online Job Portal", status: "Applied", notes: "" },
  { id: "s2", company: "GreenLeaf Solutions", position: "Data Analyst", salary: "75000", location: "Dallas, TX", listing: "https://greenleaf.com/careers/da-2025", date: "2025-09-02", method: "Online Job Portal", status: "Withdrawn", notes: "" },
  { id: "s3", company: "Horizon Logistics", position: "Operations Manager", salary: "85000", location: "Houston, TX", listing: "https://horizonlog.com/jobs/ops-manager", date: "2025-09-03", method: "Online Job Portal", status: "Interview Scheduled", notes: "Panel interview on the 15th" },
  { id: "s4", company: "Stellar Health", position: "RN", salary: "70000", location: "San Antonio, TX", listing: "https://stellarhealth.com/careers/rn-2025", date: "2025-09-04", method: "Email", status: "Offer Received", notes: "Offer above expectation" },
  { id: "s5", company: "Optima Retail", position: "Store Manager", salary: "65000", location: "San Antonio, TX", listing: "https://optimaretail.com/jobs/storemgr", date: "2025-09-06", method: "Email", status: "Rejected", notes: "" },
];

const EMPTY_FORM = {
  company: "", position: "", salary: "", location: "",
  listing: "", date: new Date().toISOString().slice(0, 10),
  method: "Online Job Portal", status: "Applied", notes: "",
};

/* ------------------------------- helpers ---------------------------------- */
const money = (v) => {
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  if (!v || isNaN(n) || n === 0) return "—";
  return "€" + n.toLocaleString("en-IE", { maximumFractionDigits: 0 });
};
const prettyDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const hostname = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
/* storage keys can't contain whitespace, slashes, or quotes */
const sanitizeKey = (name) => name.trim().toLowerCase().replace(/['"\/\\]/g, "").replace(/\s+/g, "_").slice(0, 60) || "user";
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "?";

/* --- lightweight password protection (client-side lock, not real auth) --- */
async function readUserRecord(key) {
  try { const r = await storage.get(`user:${key}`); return r?.value ? JSON.parse(r.value) : null; }
  catch { return null; }
}
function randomSalt() {
  const a = new Uint8Array(12);
  (window.crypto || {}).getRandomValues?.(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join("") || String(Date.now());
}
async function hashPassword(password, salt) {
  const input = salt + ":" + password;
  try {
    const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // fallback if SubtleCrypto is unavailable — weaker, but this lock isn't real security anyway
    let h = 5381;
    for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
    return "fb" + h.toString(16);
  }
}

/* ---- date math for reminders ---- */
const parseDay = (d) => { const dt = new Date(d + "T00:00:00"); return isNaN(dt) ? null : dt; };
const addDays = (dt, n) => { const c = new Date(dt); c.setDate(c.getDate() + n); return c; };
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const dayDiff = (a, b) => Math.round((a - b) / 86400000); // whole days a - b
const dueLabel = (due) => {
  const n = dayDiff(startOfToday(), due);
  if (n === 0) return { text: "Due today", overdue: true };
  if (n > 0) return { text: `${n} day${n > 1 ? "s" : ""} overdue`, overdue: true };
  return { text: `in ${-n} day${-n > 1 ? "s" : ""}`, overdue: false };
};

/* build a follow-up message for an application */
function followupMessage(app, isSecond) {
  const role = app.position || "the role";
  const co = app.company || "your team";
  const applied = app.date ? prettyDate(app.date) : "recently";
  const opener = isSecond
    ? `I wanted to follow up once more on my application for the ${role} position at ${co}.`
    : `I'm writing to follow up on my application for the ${role} position at ${co}, which I submitted on ${applied}.`;
  return {
    subject: `Following up — ${role} application`,
    body:
`Hi [Hiring Manager / Recruiter name],

${opener}

I'm still very interested in the opportunity and would welcome the chance to discuss how my experience fits the team. Please let me know if there's anything else you need from me.

Thank you for your time and consideration.

Best regards,
[Your name]
[Phone] · [Email]`,
  };
}

/* -------------------------------- badge ----------------------------------- */
function Badge({ text, palette }) {
  const p = palette[text] || { bg: "#EEF1F5", fg: "#5B6472" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", whiteSpace: "nowrap",
      background: p.bg, color: p.fg, fontWeight: 600, fontSize: 12,
      padding: "3px 10px", borderRadius: 999, lineHeight: 1.4,
    }}>{text}</span>
  );
}

/* -------------------------- inline status select -------------------------- */
function InlineStatus({ value, onChange }) {
  const p = STATUS[value] || { bg: "#EEF1F5", fg: "#5B6472" };
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="jt-select" aria-label="Application status"
        style={{
          appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
          background: p.bg, color: p.fg, fontWeight: 600, fontSize: 12,
          border: "1px solid transparent", borderRadius: 999,
          padding: "5px 27px 5px 12px", cursor: "pointer", fontFamily: "inherit", lineHeight: 1.4,
        }}>
        {STATUS_ORDER.map((o) => <option key={o} value={o} style={{ background: "#fff", color: T.ink }}>{o}</option>)}
      </select>
      <ChevronDown size={13} color={p.fg} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
    </div>
  );
}

/* ------------------------------- login ------------------------------------ */
function Login({ existing, lastName, onLookup, onAuth }) {
  const [step, setStep] = useState("name");      // 'name' | 'password'
  const [name, setName] = useState(lastName || "");
  const [exists, setExists] = useState(false);   // account already has a password
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toPassword = async (chosenName) => {
    const n = (chosenName ?? name).trim();
    if (!n) return;
    setName(n); setError(""); setBusy(true);
    const { exists } = await onLookup(n);
    setExists(exists);
    setPw(""); setPw2("");
    setStep("password");
    setBusy(false);
  };

  const submit = async () => {
    if (busy) return;
    if (!exists && pw !== pw2) { setError("Passwords don't match."); return; }
    setBusy(true); setError("");
    const res = await onAuth(name, pw);
    if (!res.ok) { setError(res.error || "Something went wrong."); setBusy(false); }
    // on success the parent unmounts this screen
  };

  const back = () => { setStep("name"); setError(""); setPw(""); setPw2(""); };

  const inStyle = { width: "100%", padding: "12px 12px 12px 40px", borderRadius: 11, border: "1px solid rgba(255,255,255,.16)", background: "rgba(0,0,0,.2)", color: "#fff", fontSize: 15, fontFamily: "inherit" };

  return (
    <div style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", background: T.chrome, color: "#fff", minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        * { box-sizing: border-box; }
        .lg-in:focus { outline: none; border-color: ${T.accent}; box-shadow: 0 0 0 3px rgba(14,124,102,.3); }
        .lg-btn { transition: background .15s, transform .05s; cursor: pointer; }
        .lg-btn:active { transform: translateY(1px); }
        .lg-user:hover { background: rgba(255,255,255,.09); }
      `}</style>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 26 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: T.accent, display: "grid", placeItems: "center" }}>
            <Briefcase size={22} color="#fff" strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700 }}>Job Application Tracker</h1>
            <p style={{ margin: "2px 0 0", fontSize: 13.5, color: "#9AA4B8" }}>
              {step === "name" ? "Enter your name to open your tracker." : exists ? `Welcome back, ${name}.` : `Set a password for ${name}.`}
            </p>
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 22 }}>
          {step === "name" ? (
            <>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#C7CEDC", marginBottom: 8 }}>Your name or username</label>
              <div style={{ position: "relative" }}>
                <User size={17} color={T.faint} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
                <input className="lg-in" autoFocus value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && toPassword()} placeholder="e.g. Aoife or aoife_m" style={inStyle} />
              </div>
              <button className="lg-btn" onClick={() => toPassword()} disabled={!name.trim() || busy}
                style={{ width: "100%", marginTop: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: T.accent, color: "#fff", border: "none", padding: "12px", borderRadius: 11, fontSize: 15, fontWeight: 600, fontFamily: "inherit", opacity: name.trim() && !busy ? 1 : .5, cursor: name.trim() ? "pointer" : "default" }}>
                Continue <ArrowRight size={17} />
              </button>

              {existing.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 12, color: T.faint, marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>Continue as</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {existing.map(u => (
                      <button key={u.key} className="lg-btn lg-user" onClick={() => toPassword(u.name)}
                        style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", color: "#fff", padding: "9px 12px", borderRadius: 10, fontSize: 14, fontWeight: 600, textAlign: "left", fontFamily: "inherit" }}>
                        <span style={{ width: 28, height: 28, borderRadius: "50%", background: T.accent, display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>{initials(u.name)}</span>
                        {u.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#C7CEDC", marginBottom: 8 }}>
                {exists ? "Password" : "Create a password"}
              </label>
              <div style={{ position: "relative" }}>
                <Lock size={16} color={T.faint} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
                <input className="lg-in" autoFocus type="password" value={pw} onChange={e => setPw(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (exists ? submit() : document.getElementById("lg-pw2")?.focus())}
                  placeholder={exists ? "Enter your password" : "At least 4 characters"} style={inStyle} />
              </div>
              {!exists && (
                <div style={{ position: "relative", marginTop: 10 }}>
                  <Lock size={16} color={T.faint} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
                  <input id="lg-pw2" className="lg-in" type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && submit()} placeholder="Confirm password" style={inStyle} />
                </div>
              )}

              {error && <p style={{ margin: "12px 0 0", fontSize: 13, color: "#FF9B8A", fontWeight: 500 }}>{error}</p>}

              <button className="lg-btn" onClick={submit} disabled={busy || !pw}
                style={{ width: "100%", marginTop: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: T.accent, color: "#fff", border: "none", padding: "12px", borderRadius: 11, fontSize: 15, fontWeight: 600, fontFamily: "inherit", opacity: busy || !pw ? .5 : 1, cursor: pw ? "pointer" : "default" }}>
                {busy ? "Please wait…" : exists ? <>Unlock my tracker <ArrowRight size={17} /></> : <>Create account <ArrowRight size={17} /></>}
              </button>
              <button className="lg-btn" onClick={back} disabled={busy}
                style={{ width: "100%", marginTop: 8, background: "transparent", color: "#9AA4B8", border: "none", padding: "8px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit" }}>
                ← Use a different name
              </button>
            </>
          )}
        </div>
        <p style={{ fontSize: 12, color: T.faint, marginTop: 14, textAlign: "center", lineHeight: 1.5 }}>
          Each name keeps its own separate list, protected by a password. This is a lightweight lock, not bank-grade security — avoid storing anything truly sensitive.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------- app ----------------------------------- */
export default function JobTracker() {
  const [user, setUser] = useState(null);       // { key, name, pass }
  const [userList, setUserList] = useState([]);  // [{ key, name }]
  const [lastName, setLastName] = useState("");  // prefill on the login screen
  const [booted, setBooted] = useState(false);   // finished initial storage check
  const [apps, setApps] = useState([]);
  const [loaded, setLoaded] = useState(false);   // finished loading this user's apps
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [modal, setModal] = useState(null); // {mode:'add'|'edit', form, id?}
  const [confirmDel, setConfirmDel] = useState(null);
  const [draft, setDraft] = useState(null); // {app, isSecond}

  /* boot: read the account list and who was last active (for prefill only).
     we intentionally do NOT auto-open — the password must be entered each time. */
  useEffect(() => {
    (async () => {
      let list = [];
      try { const r = await storage.get("userList"); if (r?.value) list = JSON.parse(r.value); } catch {}
      setUserList(list);
      try {
        const r = await storage.get("activeUser");
        if (r?.value) { const f = list.find(u => u.key === r.value); if (f) setLastName(f.name); }
      } catch {}
      setBooted(true);
    })();
  }, []);

  /* persist this user's applications whenever they change (keeping their password hash) */
  useEffect(() => {
    if (!user || !loaded) return;
    (async () => {
      try { await storage.set(`user:${user.key}`, JSON.stringify({ name: user.name, apps, pass: user.pass })); }
      catch (e) { console.error("save failed", e); }
    })();
  }, [apps, user, loaded]);

  /* check whether a name already has an account (so login can ask to create vs enter a password) */
  async function lookup(name) {
    const rec = await readUserRecord(sanitizeKey(name));
    return { exists: !!(rec && rec.pass) };
  }

  /* create a new account, or verify an existing one, then open it.
     returns { ok, isNew?, error? } */
  async function authenticate(name, password) {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "Enter a name." };
    if (!password) return { ok: false, error: "Enter a password." };
    const key = sanitizeKey(trimmed);
    const rec = await readUserRecord(key);

    let u, appsData = [], isNew = false;
    if (rec && rec.pass) {
      const hash = await hashPassword(password, rec.pass.salt);
      if (hash !== rec.pass.hash) return { ok: false, error: "Incorrect password. Try again." };
      u = { key, name: rec.name || trimmed, pass: rec.pass };
      appsData = rec.apps || [];
    } else {
      if (password.length < 4) return { ok: false, error: "Use at least 4 characters." };
      const salt = randomSalt();
      const hash = await hashPassword(password, salt);
      u = { key, name: trimmed, pass: { salt, hash } };
      isNew = true;
      await storage.set(`user:${key}`, JSON.stringify({ name: trimmed, apps: [], pass: u.pass })).catch(() => {});
    }

    setUserList(prev => {
      const entry = { key, name: u.name };
      const next = prev.some(x => x.key === key) ? prev.map(x => x.key === key ? entry : x) : [...prev, entry];
      storage.set("userList", JSON.stringify(next)).catch(() => {});
      return next;
    });
    storage.set("activeUser", key).catch(() => {});

    setApps(appsData);
    setUser(u);
    setLoaded(true);
    return { ok: true, isNew };
  }

  function switchUser() {
    setUser(null);
    setApps([]);
    setLoaded(false);
    setQuery(""); setFilter("All");
  }

  const stats = useMemo(() => ({
    total: apps.length,
    applied: apps.filter(a => a.status === "Applied").length,
    interview: apps.filter(a => a.status === "Interview Scheduled").length,
    offer: apps.filter(a => a.status === "Offer Received").length,
    rejected: apps.filter(a => a.status === "Rejected").length,
  }), [apps]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps
      .filter(a => filter === "All" || a.status === filter)
      .filter(a => !q ||
        a.company.toLowerCase().includes(q) ||
        a.position.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [apps, query, filter]);

  const openAdd = () => setModal({ mode: "add", form: { ...EMPTY_FORM } });
  const openEdit = (a) => setModal({ mode: "edit", id: a.id, form: { ...a } });

  const save = (form) => {
    if (!form.company.trim() || !form.position.trim()) return;
    if (modal.mode === "add") {
      setApps(p => [...p, { ...form, id: "a" + Date.now() + Math.random().toString(36).slice(2, 6) }]);
    } else {
      setApps(p => p.map(a => a.id === modal.id ? { ...form, id: modal.id } : a));
    }
    setModal(null);
  };
  const remove = (id) => { setApps(p => p.filter(a => a.id !== id)); setConfirmDel(null); };
  const updateStatus = (id, status) => setApps(p => p.map(a => a.id === id ? { ...a, status } : a));
  const markReminderDone = (id, key) =>
    setApps(p => p.map(a => a.id === id ? { ...a, done: { ...(a.done || {}), [key]: true } } : a));

  /* every live application generates up to 3 scheduled reminders; surface the
     ones that are due (today or earlier) and not yet checked off. */
  const dueReminders = useMemo(() => {
    const today = startOfToday();
    const out = [];
    apps.forEach((a) => {
      if (!LIVE_STATUSES.has(a.status)) return;
      const applied = parseDay(a.date);
      if (!applied) return;
      REMINDERS.forEach((r) => {
        if (a.done && a.done[r.key]) return;
        const due = addDays(applied, r.days);
        if (dayDiff(today, due) >= 0) out.push({ app: a, r, due });
      });
    });
    // most overdue first
    return out.sort((x, y) => x.due - y.due);
  }, [apps]);

  const statChips = [
    { key: "All", label: "All", n: stats.total, c: T.ink },
    { key: "Applied", label: "Applied", n: stats.applied, c: STATUS["Applied"].fg },
    { key: "Interview Scheduled", label: "Interview", n: stats.interview, c: STATUS["Interview Scheduled"].fg },
    { key: "Offer Received", label: "Offers", n: stats.offer, c: STATUS["Offer Received"].fg },
    { key: "Rejected", label: "Rejected", n: stats.rejected, c: STATUS["Rejected"].fg },
  ];

  if (!booted) {
    return <div style={{ fontFamily: "'Inter', sans-serif", background: T.bg, minHeight: "100vh", display: "grid", placeItems: "center", color: T.faint }}>Loading…</div>;
  }
  if (!user) {
    return <Login existing={userList} lastName={lastName} onLookup={lookup} onAuth={authenticate} />;
  }

  return (
    <div style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", background: T.bg, color: T.ink, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        * { box-sizing: border-box; }
        .jt-btn { transition: background .15s, transform .05s, box-shadow .15s; cursor: pointer; }
        .jt-btn:active { transform: translateY(1px); }
        .jt-row { transition: background .12s; }
        .jt-row:hover { background: #FAFBFC; }
        .jt-icon-btn { opacity: .55; transition: opacity .12s, background .12s; }
        .jt-row:hover .jt-icon-btn { opacity: 1; }
        .jt-icon-btn:hover { background: ${T.borderSoft}; }
        .jt-input:focus, .jt-select:focus, .jt-input:focus-visible { outline: none; border-color: ${T.accent}; box-shadow: 0 0 0 3px rgba(14,124,102,.14); }
        .jt-chip { transition: background .12s, color .12s, border-color .12s; cursor: pointer; }
        .jt-link { color: ${T.accent}; text-decoration: none; }
        .jt-link:hover { text-decoration: underline; }
        .jt-scroll::-webkit-scrollbar { height: 9px; width: 9px; }
        .jt-scroll::-webkit-scrollbar-thumb { background: #D3D8E0; border-radius: 8px; }
        @keyframes jtPop { from { opacity:0; transform: translateY(8px) scale(.99);} to {opacity:1; transform:none;} }
        @keyframes jtFade { from {opacity:0;} to {opacity:1;} }
        .jt-overlay { animation: jtFade .15s ease; }
        .jt-modal { animation: jtPop .2s cubic-bezier(.2,.8,.2,1); }
        @media (prefers-reduced-motion: reduce){ .jt-overlay,.jt-modal{animation:none;} }
      `}</style>

      {/* header */}
      <header style={{ background: T.chrome, color: "#fff", padding: "22px 24px 24px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: T.accent, display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Briefcase size={20} color="#fff" strokeWidth={2.2} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 21, fontWeight: 700, letterSpacing: "-.01em" }}>
                  Job Application Tracker
                </h1>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "#9AA4B8" }}>
                  Signed in as {user.name}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {dueReminders.length > 0 && (
                <span title={`${dueReminders.length} reminder${dueReminders.length > 1 ? "s" : ""} due`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.18)", padding: "9px 12px", borderRadius: 10, fontSize: 14, fontWeight: 600 }}>
                  <Bell size={16} /> {dueReminders.length}
                </span>
              )}
              <button className="jt-btn" onClick={openAdd}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, background: T.accent, color: "#fff", border: "none", padding: "11px 16px", borderRadius: 10, fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>
                <Plus size={17} strokeWidth={2.4} /> Add application
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 4 }}>
                <span title={user.name} style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.2)", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 700, letterSpacing: ".02em", flexShrink: 0 }}>
                  {initials(user.name)}
                </span>
                <button className="jt-btn" onClick={switchUser} title="Switch user"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: "#C7CEDC", border: "1px solid rgba(255,255,255,.18)", padding: "8px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                  <LogOut size={15} /> Switch
                </button>
              </div>
            </div>
          </div>

          {/* pipeline stat chips */}
          <div className="jt-scroll" style={{ display: "flex", gap: 10, marginTop: 20, overflowX: "auto", paddingBottom: 2 }}>
            {statChips.map(s => {
              const active = filter === s.key;
              return (
                <button key={s.key} className="jt-chip jt-btn" onClick={() => setFilter(s.key)}
                  style={{
                    flex: "1 0 auto", minWidth: 104, textAlign: "left", border: "1px solid",
                    borderColor: active ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.12)",
                    background: active ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.05)",
                    borderRadius: 12, padding: "12px 14px", color: "#fff", fontFamily: "inherit",
                  }}>
                  <div style={{ fontSize: 12, color: "#9AA4B8", fontWeight: 500 }}>{s.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.1, marginTop: 2 }}>{s.n}</div>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1160, margin: "0 auto", padding: "20px 24px 60px" }}>
        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 380 }}>
            <Search size={17} color={T.faint} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
            <input className="jt-input" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search company, role, or location"
              style={{ width: "100%", padding: "10px 12px 10px 38px", border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: T.surface, color: T.ink }} />
          </div>
          <div style={{ fontSize: 13, color: T.muted }}>
            {visible.length} {visible.length === 1 ? "application" : "applications"}{filter !== "All" ? ` · ${filter}` : ""}
          </div>
        </div>

        {/* reminders */}
        {loaded && dueReminders.length > 0 && (
          <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.accent}`, borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Bell size={17} color={T.accent} />
              <h2 style={{ margin: 0, fontSize: 15, fontFamily: "'Space Grotesk', sans-serif" }}>
                Reminders <span style={{ color: T.faint, fontWeight: 500 }}>· {dueReminders.length} due</span>
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dueReminders.map(({ app, r, due }) => {
                const dl = dueLabel(due);
                return (
                  <div key={app.id + r.key} style={{
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                    padding: "10px 12px", borderRadius: 10, background: "#FAFBFC", border: `1px solid ${T.borderSoft}`,
                  }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: dl.overdue ? "#C0392B" : T.muted, background: dl.overdue ? "#FDECEC" : "#EEF1F5", padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>
                      <Clock size={12} /> {dl.text}
                    </span>
                    <div style={{ flex: "1 1 200px", minWidth: 160 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{r.action}</div>
                      <div style={{ fontSize: 12.5, color: T.muted }}>
                        Week {r.week} · {app.company} — {app.position}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                      {r.kind === "followup" && (
                        <button className="jt-btn" onClick={() => setDraft({ app, isSecond: r.key === "follow2" })}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.accent, color: "#fff", border: "none", padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                          <Send size={14} /> Draft message
                        </button>
                      )}
                      <button className="jt-btn" onClick={() => markReminderDone(app.id, r.key)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: T.ink, border: `1px solid ${T.border}`, padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                        <Check size={14} /> Done
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* content */}
        {!loaded ? (
          <div style={{ padding: 60, textAlign: "center", color: T.faint }}>Loading…</div>
        ) : apps.length === 0 ? (
          <EmptyState onAdd={openAdd} onSample={() => setApps(SAMPLE)} />
        ) : visible.length === 0 ? (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 48, textAlign: "center", color: T.muted }}>
            No applications match your search. <button className="jt-link jt-btn" onClick={() => { setQuery(""); setFilter("All"); }} style={{ background: "none", border: "none", font: "inherit", cursor: "pointer" }}>Clear filters</button>
          </div>
        ) : (
          <div className="jt-scroll" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  {["Company & Role", "Salary", "Location", "Applied", "Method", "Status", "Link", ""].map((h, i) => (
                    <th key={i} style={{
                      textAlign: i === 1 ? "right" : "left", padding: "12px 16px", fontSize: 11.5,
                      fontWeight: 600, color: T.faint, textTransform: "uppercase", letterSpacing: ".04em",
                      borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", position: "sticky", top: 0, background: "#FAFBFC",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr key={a.id} className="jt-row" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                    <td style={{ padding: "13px 16px", minWidth: 200 }}>
                      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{a.company}</div>
                      <div style={{ fontSize: 13, color: T.muted, marginTop: 1 }}>{a.position}</div>
                      {a.notes ? <div style={{ fontSize: 12, color: T.faint, marginTop: 4, maxWidth: 240 }}>{a.notes}</div> : null}
                    </td>
                    <td style={{ padding: "13px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>{money(a.salary)}</td>
                    <td style={{ padding: "13px 16px", fontSize: 13.5, color: T.ink, whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><MapPin size={14} color={T.faint} />{a.location || "—"}</span>
                    </td>
                    <td style={{ padding: "13px 16px", fontSize: 13.5, color: T.muted, whiteSpace: "nowrap" }}>{prettyDate(a.date)}</td>
                    <td style={{ padding: "13px 16px" }}><Badge text={a.method} palette={METHOD} /></td>
                    <td style={{ padding: "13px 16px" }}><InlineStatus value={a.status} onChange={(s) => updateStatus(a.id, s)} /></td>
                    <td style={{ padding: "13px 16px" }}>
                      {a.listing ? (
                        <a className="jt-link" href={a.listing} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 500 }}>
                          {hostname(a.listing)} <ExternalLink size={13} />
                        </a>
                      ) : <span style={{ color: T.faint }}>—</span>}
                    </td>
                    <td style={{ padding: "13px 10px", whiteSpace: "nowrap" }}>
                      <button className="jt-icon-btn jt-btn" onClick={() => openEdit(a)} title="Edit"
                        style={{ border: "none", background: "none", padding: 7, borderRadius: 8, cursor: "pointer", color: T.muted }}>
                        <Pencil size={16} />
                      </button>
                      <button className="jt-icon-btn jt-btn" onClick={() => setConfirmDel(a)} title="Delete"
                        style={{ border: "none", background: "none", padding: 7, borderRadius: 8, cursor: "pointer", color: "#C0392B" }}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize: 12, color: T.faint, marginTop: 14, textAlign: "center" }}>
          Saved automatically under {user.name}. Use “Switch” up top to open a different person’s list.
        </p>
      </main>

      {modal && <FormModal state={modal} onClose={() => setModal(null)} onSave={save} />}
      {draft && <DraftModal draft={draft} onClose={() => setDraft(null)} onDone={() => {
        markReminderDone(draft.app.id, draft.isSecond ? "follow2" : "follow1");
        setDraft(null);
      }} />}
      {confirmDel && (
        <Overlay onClose={() => setConfirmDel(null)}>
          <div className="jt-modal" style={{ background: T.surface, borderRadius: 14, padding: 24, maxWidth: 380, width: "100%" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontFamily: "'Space Grotesk', sans-serif" }}>Delete this application?</h3>
            <p style={{ margin: "0 0 18px", fontSize: 14, color: T.muted }}>
              {confirmDel.company} — {confirmDel.position}. This can't be undone.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="jt-btn" onClick={() => setConfirmDel(null)} style={ghostBtn}>Keep it</button>
              <button className="jt-btn" onClick={() => remove(confirmDel.id)} style={{ ...primaryBtn, background: "#C0392B" }}>Delete</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/* ----------------------------- empty state -------------------------------- */
function EmptyState({ onAdd, onSample }) {
  return (
    <div style={{ background: T.surface, border: `1px dashed ${T.border}`, borderRadius: 16, padding: "56px 24px", textAlign: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: "#E3F5F3", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
        <Inbox size={26} color={T.accent} />
      </div>
      <h2 style={{ margin: "0 0 6px", fontFamily: "'Space Grotesk', sans-serif", fontSize: 20 }}>No applications yet</h2>
      <p style={{ margin: "0 0 22px", fontSize: 14.5, color: T.muted, maxWidth: 380, marginInline: "auto" }}>
        Add your first application to start tracking where you've applied and what's next.
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <button className="jt-btn" onClick={onAdd} style={primaryBtn}>
          <Plus size={17} strokeWidth={2.4} style={{ marginRight: 6, verticalAlign: "-3px" }} /> Add application
        </button>
        <button className="jt-btn" onClick={onSample} style={ghostBtn}>Load sample data</button>
      </div>
    </div>
  );
}

/* ------------------------------- overlay ---------------------------------- */
function Overlay({ children, onClose }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="jt-overlay" onMouseDown={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(14,22,38,.5)", backdropFilter: "blur(2px)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: "100%", display: "grid", placeItems: "center" }}>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------- follow-up draft ----------------------------- */
function DraftModal({ draft, onClose, onDone }) {
  const msg = followupMessage(draft.app, draft.isSecond);
  const full = `Subject: ${msg.subject}\n\n${msg.body}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked; user can select manually */ }
  };
  return (
    <Overlay onClose={onClose}>
      <div className="jt-modal" style={{ background: T.surface, borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${T.border}` }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 18 }}>
              {draft.isSecond ? "Second follow-up" : "Follow-up message"}
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: T.muted }}>{draft.app.company} — {draft.app.position}</p>
          </div>
          <button className="jt-btn" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", padding: 6, borderRadius: 8, color: T.muted }}><X size={20} /></button>
        </div>

        <div className="jt-scroll" style={{ padding: 22, overflowY: "auto", display: "grid", gap: 14 }}>
          <div>
            <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: T.muted, marginBottom: 6 }}>Subject</span>
            <input className="jt-input" style={inp} readOnly value={msg.subject} onFocus={(e) => e.target.select()} />
          </div>
          <div>
            <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: T.muted, marginBottom: 6 }}>Message</span>
            <textarea className="jt-input" style={{ ...inp, minHeight: 240, resize: "vertical", fontFamily: "inherit", lineHeight: 1.55 }} readOnly value={msg.body} onFocus={(e) => e.target.select()} />
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: T.faint }}>
            Fill in the bracketed parts, then paste it into your email or LinkedIn. If you have the job link saved,
            {draft.app.listing ? <> open it <a className="jt-link" href={draft.app.listing} target="_blank" rel="noreferrer">here</a>.</> : " check the posting for a contact."}
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px", borderTop: `1px solid ${T.border}`, background: "#FAFBFC" }}>
          <button className="jt-btn" onClick={copy} style={ghostBtn}>
            {copied ? <CheckCircle2 size={16} strokeWidth={2.2} style={{ marginRight: 6, verticalAlign: "-3px", color: T.accent }} />
                    : <Copy size={16} style={{ marginRight: 6, verticalAlign: "-3px" }} />}
            {copied ? "Copied" : "Copy message"}
          </button>
          <button className="jt-btn" onClick={onDone} style={primaryBtn}>
            <Check size={17} strokeWidth={2.4} style={{ marginRight: 6, verticalAlign: "-3px" }} /> Mark as sent
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/* ------------------------------ form modal -------------------------------- */
function FormModal({ state, onClose, onSave }) {
  const [f, setF] = useState(state.form);
  const [touched, setTouched] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const valid = f.company.trim() && f.position.trim();
  const submit = () => { setTouched(true); if (valid) onSave(f); };

  return (
    <Overlay onClose={onClose}>
      <div className="jt-modal" style={{ background: T.surface, borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${T.border}` }}>
          <h3 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 18 }}>
            {state.mode === "add" ? "Add application" : "Edit application"}
          </h3>
          <button className="jt-btn" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", padding: 6, borderRadius: 8, color: T.muted }}><X size={20} /></button>
        </div>

        <div className="jt-scroll" style={{ padding: 22, overflowY: "auto", display: "grid", gap: 15 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
            <Field label="Company name" required error={touched && !f.company.trim()}>
              <input className="jt-input" style={inp} value={f.company} onChange={e => set("company", e.target.value)} placeholder="TechNova Inc" />
            </Field>
            <Field label="Position" required error={touched && !f.position.trim()}>
              <input className="jt-input" style={inp} value={f.position} onChange={e => set("position", e.target.value)} placeholder="Software Engineer" />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
            <Field label="Salary (annual, €)">
              <input className="jt-input" style={inp} value={f.salary} onChange={e => set("salary", e.target.value)} placeholder="65000" inputMode="numeric" />
            </Field>
            <Field label="Location">
              <input className="jt-input" style={inp} value={f.location} onChange={e => set("location", e.target.value)} placeholder="Austin, TX" />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
            <Field label="Date applied">
              <input className="jt-input" style={inp} type="date" value={f.date} onChange={e => set("date", e.target.value)} />
            </Field>
            <Field label="Application method"><Select value={f.method} onChange={v => set("method", v)} options={Object.keys(METHOD)} /></Field>
          </div>

          <Field label="Application status"><Select value={f.status} onChange={v => set("status", v)} options={STATUS_ORDER} /></Field>

          <Field label="Job listing (URL)">
            <input className="jt-input" style={inp} value={f.listing} onChange={e => set("listing", e.target.value)} placeholder="https://company.com/jobs/123" />
          </Field>

          <Field label="Notes">
            <textarea className="jt-input" style={{ ...inp, minHeight: 68, resize: "vertical", fontFamily: "inherit" }} value={f.notes} onChange={e => set("notes", e.target.value)} placeholder="Recruiter name, next steps, follow-up dates…" />
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px", borderTop: `1px solid ${T.border}`, background: "#FAFBFC" }}>
          <button className="jt-btn" onClick={onClose} style={ghostBtn}>Cancel</button>
          <button className="jt-btn" onClick={submit} style={{ ...primaryBtn, opacity: valid ? 1 : .55 }}>
            <Check size={17} strokeWidth={2.4} style={{ marginRight: 6, verticalAlign: "-3px" }} />
            {state.mode === "add" ? "Add application" : "Save changes"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Field({ label, required, error, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: error ? "#C0392B" : T.muted, marginBottom: 6 }}>
        {label}{required ? <span style={{ color: "#C0392B" }}> *</span> : null}
        {error ? <span style={{ fontWeight: 500 }}> — required</span> : null}
      </span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options }) {
  return (
    <div style={{ position: "relative" }}>
      <select className="jt-select" value={value} onChange={e => onChange(e.target.value)}
        style={{ ...inp, appearance: "none", paddingRight: 34, cursor: "pointer" }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={16} color={T.faint} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
    </div>
  );
}

/* ------------------------------- styles ----------------------------------- */
const inp = {
  width: "100%", padding: "10px 12px", border: `1px solid ${T.border}`,
  borderRadius: 9, fontSize: 14, fontFamily: "'Inter', sans-serif", color: T.ink, background: "#fff",
};
const primaryBtn = {
  display: "inline-flex", alignItems: "center", background: T.accent, color: "#fff",
  border: "none", padding: "10px 16px", borderRadius: 10, fontSize: 14, fontWeight: 600, fontFamily: "'Inter', sans-serif",
};
const ghostBtn = {
  background: "#fff", color: T.ink, border: `1px solid ${T.border}`,
  padding: "10px 16px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', sans-serif",
};
