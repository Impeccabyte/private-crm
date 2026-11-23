"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Archive, Copy, ExternalLink, Monitor, Smartphone, Trash2 } from "lucide-react";
import { CopyButton } from "@/components/forms";
import { Pill } from "@/components/ui";
import { confirmDialog, notify } from "@/components/confirm";
import { renderFormHtml } from "@/lib/lead-forms/render";
import { blankField, FIELD_TYPE_LABEL, FIELD_TYPES, MAP_LABEL, MAP_TARGETS, publishProblems, type FieldType, type FormField, type FormSettings } from "@/lib/lead-forms/types";
import { duplicateForm, saveForm, setArchived, setPublished } from "../actions";

type Sub = { id: string; at: string; outcome: string; leadId: string | null; lead: string | null; pageUrl: string | null; data: Record<string, string> };
type Props = {
  form: { id: string; publicId: string; name: string; status: "draft" | "published"; archived: boolean; fields: FormField[]; settings: FormSettings };
  owners: { id: string; name: string }[];
  defaultAccent: string;
  baseUrl: string;
  submissions: Sub[];
};
type Tab = "build" | "settings" | "share" | "submissions";

export function Builder({ form, owners, defaultAccent, baseUrl, submissions }: Props) {
  const router = useRouter();
  const [name, setName] = useState(form.name);
  const [fields, setFields] = useState<FormField[]>(form.fields);
  const [settings, setSettings] = useState<FormSettings>(form.settings);
  const [selected, setSelected] = useState<string | null>(form.fields[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>("build");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [dirty, setDirty] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const live = form.status === "published";

  const touch = () => setDirty(true);
  const setField = (id: string, patch: Partial<FormField>) => { setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f))); touch(); };
  const setS = <K extends keyof FormSettings>(k: K, v: FormSettings[K]) => { setSettings((s) => ({ ...s, [k]: v })); touch(); };
  const move = (i: number, d: -1 | 1) => { setFields((fs) => { const n = [...fs]; const j = i + d; if (j < 0 || j >= n.length) return fs; [n[i], n[j]] = [n[j]!, n[i]!]; return n; }); touch(); };
  const add = (t: FieldType) => { const f = blankField(t); setFields((fs) => [...fs, f]); setSelected(f.id); touch(); };
  const remove = (id: string) => { setFields((fs) => fs.filter((f) => f.id !== id)); if (selected === id) setSelected(null); touch(); };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Live preview: the exact HTML the public page serves, debounced.
  const [previewHtml, setPreviewHtml] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setPreviewHtml(renderFormHtml({ publicId: form.publicId, name, fields, settings }, { action: "#", embed: false, preview: true, defaultAccent })), 150);
    return () => clearTimeout(t);
  }, [form.publicId, name, fields, settings, defaultAccent]);

  const localProblems = useMemo(() => publishProblems(fields), [fields]);

  const save = () => start(async () => {
    const r = await saveForm(form.id, { name, fields, settings });
    setProblems(r.problems && r.error ? r.problems : []);
    if (r.error) notify(r.error + (r.problems?.length ? " " + r.problems.join(" ") : ""), { error: true });
    else { setDirty(false); notify(r.ok ?? "Saved."); router.refresh(); }
  });
  const publish = (on: boolean) => start(async () => {
    if (dirty) {
      const s = await saveForm(form.id, { name, fields, settings });
      if (s.error) { setProblems(s.problems ?? []); notify(s.error, { error: true }); return; }
      setDirty(false);
    }
    if (!on && !(await confirmDialog("Sites that embed this form will show “This form isn’t available” until you publish it again. Existing leads are kept.", { title: "Unpublish this form?", confirmLabel: "Unpublish" }))) return;
    const r = await setPublished(form.id, on);
    setProblems(r.problems ?? []);
    if (r.error) notify(r.error + (r.problems?.length ? " " + r.problems.join(" ") : ""), { error: true });
    else { notify(r.ok ?? "Done."); if (on) setTab("share"); router.refresh(); }
  });
  const archive = (on: boolean) => start(async () => {
    if (on && !(await confirmDialog("It’s unpublished and moved to Archived. Leads it created are kept, and you can restore it later.", { title: "Archive this form?", confirmLabel: "Archive" }))) return;
    const r = await setArchived(form.id, on);
    if (r.error) notify(r.error, { error: true }); else { notify(r.ok ?? "Done."); router.refresh(); }
  });

  const sel = fields.find((f) => f.id === selected) ?? null;
  const snippet = `<div data-ib-form="${form.publicId}"></div>\n<script src="${baseUrl}/embed/${form.publicId}.js" async></script>`;
  const iframeSnippet = `<iframe src="${baseUrl}/f/${form.publicId}?embed=1" title="${(settings.title || name).replace(/"/g, "&quot;")}" style="width:100%;height:760px;border:0" loading="lazy"></iframe>`;
  const hosted = `${baseUrl}/f/${form.publicId}`;
  const localhostUrl = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseUrl);

  return (
    <div className="content" style={{ gap: 16 }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/leads">Leads</Link><span aria-hidden="true">/</span><Link href="/leads/forms">Forms</Link><span aria-hidden="true">/</span><b aria-current="page">{name || "Untitled form"}</b></nav>

      <header className="row w" style={{ gap: 10, alignItems: "center" }}>
        <label className="sr" htmlFor="form-name">Form name</label>
        <input id="form-name" className="inp" value={name} onChange={(e) => { setName(e.target.value); touch(); }} style={{ fontSize: 18, fontWeight: 600, height: 38, flex: "1 1 260px", maxWidth: 480 }} />
        {form.archived ? <Pill status="Inactive" label="Archived" /> : live ? <Pill status="Live" label="Published" /> : <Pill status="draft" label="Draft" />}
        {dirty && <span className="subtle sm">Unsaved changes</span>}
        <span className="sp" />
        <button className="btn" onClick={save} disabled={pending || !dirty}>{pending ? "Saving…" : "Save"}</button>
        {!form.archived && (live
          ? <button className="btn" onClick={() => publish(false)} disabled={pending}>Unpublish</button>
          : <button className="btn pri" onClick={() => publish(true)} disabled={pending}>{dirty ? "Save & publish" : "Publish"}</button>)}
      </header>

      {problems.length > 0 && (
        <div className="banner amber" role="alert"><div><div className="bt">Before this can go live</div><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{problems.map((p) => <li key={p} className="bd">{p}</li>)}</ul></div></div>
      )}

      <div className="tabs" role="tablist" aria-label="Form editor">
        {([["build", "Fields"], ["settings", "Settings"], ["share", "Embed & share"], ["submissions", `Submissions`]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}{k === "submissions" && <span className="c">{submissions.length}</span>}</button>
        ))}
      </div>

      {(tab === "build" || tab === "settings") && (
        <div className="lf-grid">
          <div className="stack" style={{ gap: 16 }}>
            {tab === "build" ? (
              <>
                <section className="card">
                  <div className="card-h"><h2>Fields <span className="ct">{fields.length}</span></h2>
                    <label className="row" style={{ gap: 6 }}><span className="sr">Add a field</span>
                      <select className="inp" value="" onChange={(e) => { if (e.target.value) add(e.target.value as FieldType); }} style={{ height: 28 }} aria-label="Add a field">
                        <option value="">+ Add field…</option>{FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
                      </select>
                    </label>
                  </div>
                  {fields.length === 0 && <div className="card-b subtle">No fields yet. Add one to get started.</div>}
                  <ol className="lf-list" aria-label="Fields in order">
                    {fields.map((f, i) => (
                      <li key={f.id} className={`lf-item ${selected === f.id ? "on" : ""}`}>
                        <button type="button" className="lf-sel" onClick={() => setSelected(f.id)} aria-current={selected === f.id}>
                          <span className="lf-l">{f.label || <i className="subtle">No label</i>}{f.required && <span className="tx-red" aria-label="required"> *</span>}</span>
                          <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                            <span className="tag">{FIELD_TYPE_LABEL[f.type]}</span>
                            {f.mapTo !== "none" && <span className="tag acc">{MAP_LABEL[f.mapTo].replace("Lead · ", "→ ")}</span>}
                            {f.width === "half" && <span className="tag">Half width</span>}
                            {f.type === "file" && <span className="tag">Up to {f.maxFiles ?? 3} file{(f.maxFiles ?? 3) > 1 ? "s" : ""}</span>}
                          </span>
                        </button>
                        <span className="row" style={{ gap: 2 }}>
                          <button type="button" className="btn ghost sm icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${f.label} up`}><ArrowUp size={14} aria-hidden="true" /></button>
                          <button type="button" className="btn ghost sm icon" onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label={`Move ${f.label} down`}><ArrowDown size={14} aria-hidden="true" /></button>
                          <button type="button" className="btn ghost sm icon danger" onClick={() => remove(f.id)} aria-label={`Remove ${f.label}`}><Trash2 size={14} aria-hidden="true" /></button>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
                {sel && (
                  <section className="card expand-in" key={sel.id}>
                    <div className="card-h"><h2>Field settings</h2><span className="subtle sm">{FIELD_TYPE_LABEL[sel.type]}</span></div>
                    <div className="card-b form-grid">
                      <label className="field full"><span className="lab">Label</span><input className="inp" value={sel.label} onChange={(e) => setField(sel.id, { label: e.target.value })} /></label>
                      <label className="field"><span className="lab">Type</span>
                        <select className="inp" value={sel.type} onChange={(e) => { const t = e.target.value as FieldType; setField(sel.id, { type: t, ...(t === "select" && !sel.options?.length ? { options: ["Option 1", "Option 2"] } : {}), ...(t === "file" ? { mapTo: "none", width: "full", maxFiles: sel.maxFiles ?? 3 } : {}) }); }}>
                          {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
                        </select></label>
                      {sel.type === "file" ? (
                        <label className="field"><span className="lab">Files allowed</span>
                          <select className="inp" value={sel.maxFiles ?? 3} onChange={(e) => setField(sel.id, { maxFiles: Number(e.target.value) })}>
                            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n === 1 ? "1 file" : `Up to ${n} files`}</option>)}
                          </select></label>
                      ) : (
                      <label className="field"><span className="lab">Saves to</span>
                        <select className="inp" value={sel.mapTo} onChange={(e) => setField(sel.id, { mapTo: e.target.value as FormField["mapTo"] })}>
                          {MAP_TARGETS.map((t) => <option key={t} value={t}>{MAP_LABEL[t]}</option>)}
                        </select></label>
                      )}
                      {sel.type === "file" && <p className="hint full" style={{ margin: 0 }}>Accepts PDF, JPG, PNG, HEIC, CSV and Excel, up to 10 MB each. Files are encrypted and attached to the lead; only staff who can see the lead can download them.</p>}
                      {sel.type !== "checkbox" && sel.type !== "file" && <label className="field full"><span className="lab">{sel.type === "select" ? "Empty choice text" : "Placeholder"}</span><input className="inp" value={sel.placeholder ?? ""} onChange={(e) => setField(sel.id, { placeholder: e.target.value })} /></label>}
                      <label className="field full"><span className="lab">Help text</span><input className="inp" value={sel.help ?? ""} onChange={(e) => setField(sel.id, { help: e.target.value })} placeholder="Shown under the field" /></label>
                      {sel.type === "select" && (
                        <label className="field full"><span className="lab">Options (one per line)</span>
                          <textarea className="inp" rows={5} value={(sel.options ?? []).join("\n")} onChange={(e) => setField(sel.id, { options: e.target.value.split("\n").map((x) => x.trimStart()).filter((x, i, a) => x || i === a.length - 1) })} />
                        </label>
                      )}
                      <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={sel.required} onChange={(e) => setField(sel.id, { required: e.target.checked })} />Required</label>
                      {sel.type !== "checkbox" && sel.type !== "file" && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={sel.width === "half"} onChange={(e) => setField(sel.id, { width: e.target.checked ? "half" : "full" })} />Half width (pairs with the next field)</label>}
                    </div>
                  </section>
                )}
                {localProblems.length > 0 && <p className="subtle sm" style={{ margin: 0 }}>To publish: {localProblems.join(" ")}</p>}
              </>
            ) : (
              <section className="card">
                <div className="card-h"><h2>Form settings</h2></div>
                <div className="card-b form-grid">
                  <label className="field full"><span className="lab">Heading</span><input className="inp" value={settings.title} onChange={(e) => setS("title", e.target.value)} /></label>
                  <label className="field full"><span className="lab">Intro</span><textarea className="inp" rows={3} value={settings.intro} onChange={(e) => setS("intro", e.target.value)} /></label>
                  <label className="field"><span className="lab">Button label</span><input className="inp" value={settings.submitLabel} onChange={(e) => setS("submitLabel", e.target.value)} /></label>
                  <label className="field"><span className="lab">Lead owner</span>
                    <select className="inp" value={settings.ownerId} onChange={(e) => setS("ownerId", e.target.value)}><option value="">Unassigned</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
                  <label className="field"><span className="lab">Thank-you heading</span><input className="inp" value={settings.successTitle} onChange={(e) => setS("successTitle", e.target.value)} /></label>
                  <label className="field"><span className="lab">Thank-you message</span><input className="inp" value={settings.successMessage} onChange={(e) => setS("successMessage", e.target.value)} /></label>
                  <label className="field full"><span className="lab">Redirect after submitting (optional)</span><input className="inp" value={settings.redirectUrl} onChange={(e) => setS("redirectUrl", e.target.value)} placeholder="https://example.com/thanks" /><span className="hint">Sends the visitor to this page instead of showing the thank-you message.</span></label>
                  <label className="field full"><span className="lab">Email me new submissions</span><input className="inp" value={settings.notifyEmails} onChange={(e) => setS("notifyEmails", e.target.value)} placeholder="sales@impeccabyte.com, you@impeccabyte.com" /><span className="hint">Uses Settings → Email.</span></label>
                  <label className="field full"><span className="lab">Only allow on these sites (optional)</span><input className="inp" value={settings.allowedDomains} onChange={(e) => setS("allowedDomains", e.target.value)} placeholder="example.com, *.example.com" /><span className="hint">Leave empty to allow any site. Browsers refuse to show the form anywhere else.</span></label>
                  <label className="field full"><span className="lab">Consent checkbox (optional)</span><input className="inp" value={settings.consentText} onChange={(e) => setS("consentText", e.target.value)} placeholder="I agree to be contacted about payment processing." /><span className="hint">When set, visitors must tick it to submit.</span></label>
                  <label className="field"><span className="lab">Button color</span>
                    <span className="row" style={{ gap: 8 }}><input type="color" value={settings.accentColor || defaultAccent} onChange={(e) => setS("accentColor", e.target.value)} aria-label="Button color" style={{ width: 40, height: 30, padding: 0, border: 0, background: "none" }} /><input className="inp mono" value={settings.accentColor} onChange={(e) => setS("accentColor", e.target.value)} placeholder={defaultAccent} style={{ flex: 1 }} /></span></label>
                  <label className="field"><span className="lab">Theme</span><select className="inp" value={settings.theme} onChange={(e) => setS("theme", e.target.value as "light" | "dark")}><option value="light">Light</option><option value="dark">Dark</option></select></label>
                </div>
              </section>
            )}
          </div>

          <section className="card lf-preview" aria-label="Live preview">
            <div className="card-h"><h2>Preview</h2>
              <div className="seg" role="group" aria-label="Preview size">
                <button type="button" className={device === "desktop" ? "on" : ""} onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"}><Monitor size={13} aria-hidden="true" />Desktop</button>
                <button type="button" className={device === "mobile" ? "on" : ""} onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"}><Smartphone size={13} aria-hidden="true" />Phone</button>
              </div>
            </div>
            <div className="lf-stage" style={{ background: settings.theme === "dark" ? "#0C0E12" : "#F1F3F6" }}>
              <iframe title="Form preview" srcDoc={previewHtml} sandbox="allow-scripts" style={{ width: device === "mobile" ? 375 : "100%", maxWidth: "100%" }} />
            </div>
          </section>
        </div>
      )}

      {tab === "share" && (
        <section className="card">
          <div className="card-h"><h2>Embed &amp; share</h2>{live && <a className="btn sm" href={hosted} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" />Open hosted form</a>}</div>
          <div className="card-b stack">
            {form.archived ? <p className="muted" style={{ margin: 0 }}>This form is archived. Restore it to publish and embed it.</p>
              : !live ? (
                <div className="stack" style={{ gap: 10 }}>
                  <p className="muted" style={{ margin: 0 }}>Publish the form to get its embed snippet. Until then, nothing is public.</p>
                  {localProblems.length > 0 && <ul style={{ margin: 0, paddingLeft: 18 }}>{localProblems.map((p) => <li key={p} className="sm tx-amber">{p}</li>)}</ul>}
                  <div><button className="btn pri" onClick={() => publish(true)} disabled={pending}>{dirty ? "Save & publish" : "Publish"}</button></div>
                </div>
              ) : (
                <>
                  {localhostUrl && <div className="banner amber"><div><div className="bt">These links point at localhost</div><div className="bd sm">Set <span className="mono">APP_URL</span> in <span className="mono">.env</span> to the CRM’s public address before embedding on a real site, then copy the snippet again.</div></div></div>}
                  <div className="stack" style={{ gap: 8 }}>
                    <div className="row"><b>Embed snippet</b><span className="tag acc">Recommended</span><span className="sp" /><CopyButton text={snippet} label="Copy snippet" /></div>
                    <pre className="code">{snippet}</pre>
                    <span className="hint">Paste where the form should appear. It sizes itself to fit, follows your redirect after submitting, and fires an <span className="mono">ib-form-submitted</span> event you can use for analytics.</span>
                  </div>
                  <hr className="divider" />
                  <div className="stack" style={{ gap: 8 }}>
                    <div className="row"><b>Plain iframe</b><span className="subtle sm">For site builders that don’t allow scripts</span><span className="sp" /><CopyButton text={iframeSnippet} label="Copy iframe" /></div>
                    <pre className="code">{iframeSnippet}</pre>
                  </div>
                  <hr className="divider" />
                  <div className="stack" style={{ gap: 8 }}>
                    <div className="row"><b>Direct link</b><span className="subtle sm">For emails, ads or QR codes</span><span className="sp" /><CopyButton text={hosted} label="Copy link" /></div>
                    <pre className="code">{hosted}</pre>
                  </div>
                  <p className="subtle sm" style={{ margin: 0 }}>Edits go live as soon as you save. {settings.allowedDomains ? `Only shown on: ${settings.allowedDomains}.` : "Can be embedded on any site (restrict it in Settings)."}</p>
                </>
              )}
          </div>
        </section>
      )}

      {tab === "submissions" && (
        <section className="card lv">
          {submissions.length === 0 ? <div className="card-b subtle">No submissions yet.{live ? " They’ll appear here and in Leads." : " Publish the form to start collecting them."}</div> : (
            <div className="tblw">
              <table className="tbl">
                <thead><tr><th>When</th><th>Lead</th><th>Result</th><th>Answers</th><th>Page</th></tr></thead>
                <tbody>
                  {submissions.map((s) => (
                    <tr key={s.id}>
                      <td className="muted">{new Date(s.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                      <td>{s.leadId ? <Link className="rl" href={`/leads?lead=${s.leadId}`}>{s.lead ?? "Lead"}</Link> : <span className="subtle">Deleted</span>}</td>
                      <td>{s.outcome === "created" ? <span className="tag acc">New lead</span> : <span className="tag">Added to existing</span>}</td>
                      <td style={{ whiteSpace: "normal", minWidth: 260 }} className="sm">{Object.entries(s.data).slice(0, 4).map(([k, v]) => <div key={k}><span className="subtle">{k}:</span> {v}</div>)}</td>
                      <td className="sm subtle"><span className="trunc" title={s.pageUrl ?? ""}>{s.pageUrl ? s.pageUrl.replace(/^https?:\/\//, "") : "Hosted page"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="row w" style={{ gap: 8 }}>
        <form action={duplicateForm.bind(null, form.id)}><button className="btn sm" type="submit"><Copy size={14} aria-hidden="true" />Duplicate</button></form>
        {form.archived
          ? <button className="btn sm" onClick={() => archive(false)} disabled={pending}>Restore</button>
          : <button className="btn sm" onClick={() => archive(true)} disabled={pending}><Archive size={14} aria-hidden="true" />Archive</button>}
        <span className="sp" />
        <span className="subtle sm">Form ID <span className="mono">{form.publicId}</span></span>
      </div>
    </div>
  );
}
