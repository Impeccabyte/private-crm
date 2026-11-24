"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Copy, Eye, LayoutTemplate, LoaderCircle, Monitor, MoreHorizontal, Redo2, Smartphone, Trash2, Undo2, X } from "lucide-react";
import { confirmDialog, notify } from "@/components/confirm";
import { Pill, type Tone } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { renderEmail } from "@/lib/email/render";
import type { Brand } from "@/lib/email/types";
import { deleteCampaign, duplicateCampaign, saveAsTemplate, saveBrand, saveCampaign, sendTest } from "../actions";
import { Design } from "./Design";
import { AudiencePanel, ReportPanel, SendPanel, useAudience } from "./Panels";
import { useLocalTime, type CampaignProps, type Doc, type MailInfo, type Report, type Update } from "./shared";

type Tab = "design" | "audience" | "send" | "report";
type Device = "desktop" | "mobile";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" }, scheduled: { label: "Scheduled", tone: "amber" }, sending: { label: "Sending", tone: "blue" },
  sent: { label: "Sent", tone: "green" }, cancelled: { label: "Stopped", tone: "gray" },
};

// ── Document state with undo / redo ──────────────────────────────────────────
type Hist = { doc: Doc; past: Doc[]; future: Doc[]; key?: string; at: number; version: number };
type Act = { t: "update"; fn: (d: Doc) => Doc; key?: string; at: number } | { t: "undo" } | { t: "redo" };

function reduce(s: Hist, a: Act): Hist {
  if (a.t === "update") {
    const next = a.fn(s.doc);
    if (next === s.doc) return s;
    // Rapid edits of the same thing (typing in one field) collapse into one undo step.
    const merge = !!a.key && a.key === s.key && a.at - s.at < 1200 && s.past.length > 0;
    return { doc: next, past: merge ? s.past : [...s.past.slice(-99), s.doc], future: [], key: a.key, at: a.at, version: s.version + 1 };
  }
  if (a.t === "undo") {
    const prev = s.past[s.past.length - 1];
    return prev ? { doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], at: 0, version: s.version + 1 } : s;
  }
  const next = s.future[0];
  return next ? { doc: next, past: [...s.past, s.doc], future: s.future.slice(1), at: 0, version: s.version + 1 } : s;
}

export function Builder({ campaign, owners, forms, mailProblems, mail, company, brand: brand0, user, report }: {
  campaign: CampaignProps; owners: { id: string; name: string }[]; forms: { id: string; name: string }[]; mailProblems: string[];
  mail: MailInfo; company: string; brand: Brand; user: { name: string; email: string }; report: Report | null;
}) {
  const router = useRouter();
  const locked = campaign.status !== "draft";
  const [h, dispatch] = useReducer(reduce, null, (): Hist => ({
    doc: { name: campaign.name, subject: campaign.subject, preheader: campaign.preheader, fromName: campaign.fromName, replyTo: campaign.replyTo, blocks: campaign.blocks, style: campaign.style, audience: campaign.audience },
    past: [], future: [], at: 0, version: 0,
  }));
  const doc = h.doc;
  const update: Update = useCallback((fn, key) => { if (!locked) dispatch({ t: "update", fn, key, at: Date.now() }); }, [locked]);

  const [tab, setTab] = useState<Tab>(report ? "report" : locked ? "send" : "design");
  const [device, setDevice] = useState<Device>("desktop");
  const [preview, setPreview] = useState(false);
  const [menu, setMenu] = useState(false);
  const [pending, start] = useTransition();

  // ── Autosave ──
  const [saved, setSaved] = useState<{ version: number; state: "idle" | "saving" | "error"; error?: string }>({ version: 0, state: "idle" });
  const latest = useRef(h);
  const savedVersion = useRef(0);
  const inflight = useRef<Promise<boolean> | null>(null);
  useEffect(() => { latest.current = h; });
  const persist = useCallback(async (): Promise<boolean> => {
    if (inflight.current) await inflight.current;
    const s = latest.current;
    if (s.version === savedVersion.current) return true;
    setSaved((p) => ({ ...p, state: "saving" }));
    const p = saveCampaign(campaign.id, s.doc).then((r) => {
      if (r.error) { setSaved((x) => ({ ...x, state: "error", error: r.error })); return false; }
      savedVersion.current = s.version;
      setSaved({ version: s.version, state: "idle" });
      return true;
    }).catch(() => { setSaved((x) => ({ ...x, state: "error", error: "You may be offline." })); return false; });
    inflight.current = p;
    const ok = await p;
    inflight.current = null;
    return ok;
  }, [campaign.id]);
  useEffect(() => {
    if (h.version === 0 || locked) return;
    const t = setTimeout(() => void persist(), 900);
    return () => clearTimeout(t);
  }, [h.version, locked, persist]);
  const dirty = !locked && h.version !== saved.version;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ── Workspace logo: shared by every newsletter, saved on its own (not part of this newsletter's undo history) ──
  const [brand, setBrandState] = useState<Brand>(brand0);
  const brandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setBrand = useCallback((patch: Partial<Brand>) => {
    setBrandState((b) => {
      const next = { ...b, ...patch };
      if (brandTimer.current) clearTimeout(brandTimer.current);
      brandTimer.current = setTimeout(async () => { const r = await saveBrand(next); if (r.error) notify(r.error, { error: true }); }, 500);
      return next;
    });
  }, []);

  // ── Undo / redo shortcuts (plain inputs keep the browser's own undo) ──
  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      e.preventDefault();
      dispatch({ t: e.shiftKey ? "redo" : "undo" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked]);

  const audience = useAudience(doc.audience);
  const scheduledFor = useLocalTime(campaign.scheduledAt, `${fmtDateTime(campaign.scheduledAt)} ET`);
  const st = STATUS[campaign.status] ?? STATUS.draft!;
  const act = (fn: () => Promise<{ ok?: string; error?: string } | void>) => start(async () => {
    setMenu(false);
    if (!locked && !(await persist())) { notify("Couldn’t save your latest changes. Try again.", { error: true }); return; }
    const r = await fn();
    if (r) notify(r.ok ?? r.error ?? "", { error: !!r.error });
  });

  const tabs: { key: Tab; label: string; count?: string }[] = [
    { key: "design", label: "Design" },
    { key: "audience", label: "Audience", count: (doc.audience.leads.on || doc.audience.merchants.on) && audience.data && !locked ? audience.data.count.toLocaleString("en-US") : undefined },
    { key: "send", label: locked ? "Status" : "Review & send" },
    ...(report ? [{ key: "report" as const, label: "Report" }] : []),
  ];

  return (
    <div className="content em" style={{ gap: 14 }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/email">Email</Link><span aria-hidden="true">/</span><b aria-current="page">{doc.name || "Untitled newsletter"}</b></nav>

      <header className="row w em-head" style={{ gap: 10, alignItems: "center" }}>
        <label className="sr" htmlFor="em-name">Newsletter name (only you see this)</label>
        <input id="em-name" className="inp em-name" value={doc.name} disabled={locked} maxLength={120} onChange={(e) => update((d) => ({ ...d, name: e.target.value }), "doc:name")} />
        <Pill status={campaign.status} label={st.label} tone={st.tone} />
        {!locked && (
          <span className={`em-save ${saved.state === "error" ? "err" : ""}`} role="status">
            {saved.state === "error" ? <><CircleAlert size={14} aria-hidden="true" />Not saved. {saved.error} <button type="button" className="btn ghost sm" onClick={() => void persist()}>Retry</button></>
              : dirty || saved.state === "saving" ? <><LoaderCircle size={14} className="em-spin" aria-hidden="true" />Saving…</>
              : h.version > 0 ? <><Check size={14} aria-hidden="true" />Saved</> : null}
          </span>
        )}
        <span className="sp" />
        <button className="btn" type="button" onClick={() => setPreview(true)} disabled={doc.blocks.length === 0}><Eye size={16} aria-hidden="true" />Preview</button>
        <div style={{ position: "relative" }}>
          <button className="btn icon" type="button" aria-label="More actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><MoreHorizontal size={16} aria-hidden="true" /></button>
          {menu && (
            <div className="pop" role="menu" onKeyDown={(e) => { if (e.key === "Escape") setMenu(false); }}>
              <button className="mi" role="menuitem" type="button" disabled={pending} onClick={() => act(() => duplicateCampaign(campaign.id))}><Copy size={16} aria-hidden="true" />Duplicate</button>
              <button className="mi" role="menuitem" type="button" disabled={pending || doc.blocks.length === 0} onClick={() => act(async () => { const r = await saveAsTemplate(campaign.id, doc.name); router.refresh(); return r; })}><LayoutTemplate size={16} aria-hidden="true" />Save design as a template</button>
              {campaign.status === "draft" && <button className="mi" role="menuitem" type="button" disabled={pending} style={{ color: "var(--r-ink)" }} onClick={async () => {
                setMenu(false);
                if (await confirmDialog("The design and its settings are removed for good.", { title: `Delete “${doc.name}”?`, confirmLabel: "Delete draft", danger: true })) start(async () => { const r = await deleteCampaign(campaign.id); if (r?.error) notify(r.error, { error: true }); });
              }}><Trash2 size={16} aria-hidden="true" />Delete draft</button>}
            </div>
          )}
        </div>
      </header>

      {campaign.status === "scheduled" && <div className="banner amber" role="status"><div><div className="bt">Scheduled for {scheduledFor}</div><div className="bd sm">It’s locked while it waits. To change it, cancel the schedule on the Status tab.</div></div></div>}
      {(campaign.status === "sent" || campaign.status === "sending" || campaign.status === "cancelled") && tab === "design" && <div className="banner blue" role="status"><div><div className="bt">This is what was sent</div><div className="bd sm">It can’t be edited. Use Duplicate in the ••• menu to start a new one from it.</div></div></div>}

      <div className="row w em-bar">
        <div className="tabs" role="tablist" style={{ flex: 1 }}>
          {tabs.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? "on" : ""}`} onClick={() => setTab(t.key)}>{t.label}{t.count !== undefined && <span className="c">{t.count}</span>}</button>)}
        </div>
        {tab === "design" && (
          <div className="row em-bar-r" style={{ gap: 8 }}>
            {!locked && <>
              <button className="btn ghost sm icon" type="button" aria-label="Undo" title="Undo (⌘Z)" disabled={h.past.length === 0} onClick={() => dispatch({ t: "undo" })}><Undo2 size={16} aria-hidden="true" /></button>
              <button className="btn ghost sm icon" type="button" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={h.future.length === 0} onClick={() => dispatch({ t: "redo" })}><Redo2 size={16} aria-hidden="true" /></button>
            </>}
            <div className="seg" role="group" aria-label="Preview width">
              <button type="button" className={device === "desktop" ? "on" : ""} aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor size={14} aria-hidden="true" />Desktop</button>
              <button type="button" className={device === "mobile" ? "on" : ""} aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><Smartphone size={14} aria-hidden="true" />Phone</button>
            </div>
          </div>
        )}
      </div>

      {tab === "design" && <Design doc={doc} update={update} locked={locked} device={device} mail={mail} company={company} brand={brand} setBrand={setBrand} />}
      {tab === "audience" && <AudiencePanel doc={doc} update={update} locked={locked} owners={owners} forms={forms} summary={audience.data} loading={audience.loading} />}
      {tab === "send" && <SendPanel campaign={campaign} doc={doc} mail={mail} mailProblems={mailProblems} summary={audience.data} user={user} flush={persist} report={report} />}
      {tab === "report" && report && <ReportPanel report={report} live={campaign.status === "sending"} />}

      {preview && <Preview doc={doc} mail={mail} company={company} brand={brand} user={user} onClose={() => setPreview(false)} onTest={() => act(() => sendTest(campaign.id))} busy={pending} />}
    </div>
  );
}

/** The real email HTML (the same function the send job uses), shown in a sandboxed frame. */
function Preview({ doc, mail, company, brand, user, onClose, onTest, busy }: { doc: Doc; mail: MailInfo; company: string; brand: Brand; user: { name: string; email: string }; onClose: () => void; onTest: () => void; busy: boolean }) {
  const [device, setDevice] = useState<Device>("desktop");
  const closeRef = useRef<HTMLButtonElement>(null);
  const out = useMemo(() => renderEmail(doc, {
    merge: { first_name: user.name.split(/\s+/)[0] ?? "", name: user.name, business_name: "Harbor Coffee Co." },
    companyName: company, postalAddress: mail.postalAddress || "Your postal address (set it in Settings → Email)", unsubscribeUrl: "#", viewUrl: "#", link: () => "#", brand,
  }), [doc, mail.postalAddress, company, user.name, brand]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="em-prev" role="dialog" aria-modal="true" aria-label="Email preview">
      <div className="scrim" onClick={onClose} />
      <div className="em-prev-p">
        <div className="em-prev-h">
          <div className="em-inbox">
            <b>{doc.fromName || mail.fromName}</b>
            <span className="s">{out.subject || <i>No subject yet</i>}</span>
            {doc.preheader && <span className="p">{doc.preheader}</span>}
          </div>
          <div className="seg" role="group" aria-label="Preview width">
            <button type="button" className={device === "desktop" ? "on" : ""} aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor size={14} aria-hidden="true" />Desktop</button>
            <button type="button" className={device === "mobile" ? "on" : ""} aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><Smartphone size={14} aria-hidden="true" />Phone</button>
          </div>
          <button className="btn" type="button" disabled={busy} onClick={onTest}>Send a test to me</button>
          <button ref={closeRef} className="btn ghost icon" type="button" aria-label="Close preview" onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </div>
        <div className="em-prev-b">
          {/* No scripts are allowed in the frame. allow-same-origin only lets it load the uploaded pictures, which a fully isolated frame was refusing. */}
          <iframe title="Email preview" sandbox="allow-same-origin" srcDoc={out.html} style={{ width: device === "mobile" ? 375 : "100%" }} />
        </div>
        <div className="em-prev-f subtle sm">Shown with sample details ({user.name}, Harbor Coffee Co.). Links are switched off in the preview.</div>
      </div>
    </div>
  );
}
