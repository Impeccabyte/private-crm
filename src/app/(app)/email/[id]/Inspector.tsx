"use client";

import { useRef, useState, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, Plus, Trash2, Upload } from "lucide-react";
import { notify } from "@/components/confirm";
import {
  ALIGNS, FONTS, FONT_LABEL, MERGE_TAGS, SOCIAL_LABEL, SOCIAL_NETWORKS, type Align, type Block, type Brand, type Cell, type EmailStyle, type FontKey, type SocialNetwork,
} from "@/lib/email/types";
import { uploadImage, type Doc, type MailInfo, type Update } from "./shared";

const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight };

function F({ label, hint, children, id }: { label: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}{hint && <span className="hint">{hint}</span>}</div>;
}

function AlignPicker({ value, onChange, disabled }: { value: Align; onChange: (a: Align) => void; disabled?: boolean }) {
  return (
    <div className="field"><span className="lab" id="al-l">Alignment</span>
      <div className="seg" role="group" aria-labelledby="al-l">
        {ALIGNS.map((a) => { const I = ALIGN_ICON[a]; return <button key={a} type="button" className={value === a ? "on" : ""} aria-pressed={value === a} disabled={disabled} onClick={() => onChange(a)} aria-label={`Align ${a}`}><I size={14} aria-hidden="true" /></button>; })}
      </div>
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="field"><span className="lab">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map(([v, l]) => <button key={v} type="button" className={value === v ? "on" : ""} aria-pressed={value === v} disabled={disabled} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}

function ImageField({ src, onChange, disabled, id, label = "Picture" }: { src: string; onChange: (src: string) => void; disabled?: boolean; id: string; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    try { onChange(await uploadImage(f)); } catch (e) { notify((e as Error).message, { error: true }); } finally { setBusy(false); }
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="row" style={{ gap: 6 }}>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" className="btn sm" disabled={disabled || busy} onClick={() => input.current?.click()}><Upload size={14} aria-hidden="true" />{busy ? "Uploading…" : src ? "Replace" : "Upload"}</button>
        {src && <button type="button" className="btn ghost sm danger" disabled={disabled} onClick={() => onChange("")}>Remove</button>}
      </div>
      <input id={id} className="inp" placeholder="or paste an image address (https://…)" value={src} disabled={disabled} onChange={(e) => onChange(e.target.value.trim())} />
      <span className="hint">PNG, JPG, GIF or WebP, up to 2 MB.</span>
    </div>
  );
}

function Color({ label, value, onChange, disabled, id }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; id: string }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setText(value); } // follow undo / outside changes
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="row" style={{ gap: 6 }}>
        <input type="color" className="em-swatch" aria-label={`${label} picker`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <input id={id} className="inp mono" value={text} disabled={disabled} maxLength={7} spellCheck={false}
          onChange={(e) => { const v = e.target.value.trim(); setText(v); if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toUpperCase()); }} onBlur={() => setText(value)} />
      </div>
    </div>
  );
}

export function Inspector({ doc, update, block, patch, locked, mail, brand, setBrand, company }: {
  doc: Doc; update: Update; block: Block | null; patch: (p: Partial<Block>, key?: string) => void; locked: boolean; mail: MailInfo;
  brand: Brand; setBrand: (p: Partial<Brand>) => void; company: string;
}) {
  if (!block) return <EmailSettings doc={doc} update={update} locked={locked} mail={mail} brand={brand} setBrand={setBrand} company={company} />;
  const b = block;
  const dis = locked;
  const link = (id: string, value: string, onChange: (v: string) => void, label = "Link") => (
    <F label={label} id={id} hint="Starts with https://. Use mailto: for an email address."><input id={id} className="inp" placeholder="https://example.com/page" value={value} disabled={dis} onChange={(e) => onChange(e.target.value.trim())} /></F>
  );

  return (
    <div className="em-insp-b expand-in">
      {b.type === "heading" && <>
        <Seg label="Size" value={String(b.level) as "1" | "2" | "3"} options={[["1", "Large"], ["2", "Medium"], ["3", "Small"]]} disabled={dis} onChange={(v) => patch({ level: Number(v) as 1 | 2 | 3 })} />
        <AlignPicker value={b.align} disabled={dis} onChange={(align) => patch({ align })} />
        <Tags />
      </>}
      {b.type === "text" && <>
        <AlignPicker value={b.align} disabled={dis} onChange={(align) => patch({ align })} />
        <p className="hint" style={{ margin: 0 }}>Click the text in the email to edit it. Select words, then use the toolbar above the block for bold, lists and links.</p>
        <Tags />
      </>}
      {b.type === "image" && <>
        <ImageField id="i-src" src={b.src} disabled={dis} onChange={(src) => patch({ src }, "img-src")} />
        <F label="Description" id="i-alt" hint="Shown if the picture doesn’t load, and read aloud by screen readers."><input id="i-alt" className="inp" value={b.alt} disabled={dis} onChange={(e) => patch({ alt: e.target.value })} /></F>
        {link("i-href", b.href, (href) => patch({ href }), "Link when clicked (optional)")}
        <F label={`Width · ${b.width}%`} id="i-w"><input id="i-w" type="range" min={10} max={100} step={5} value={b.width} disabled={dis} onChange={(e) => patch({ width: Number(e.target.value) })} /></F>
        <AlignPicker value={b.align} disabled={dis} onChange={(align) => patch({ align })} />
      </>}
      {b.type === "button" && <>
        <F label="Label" id="b-l"><input id="b-l" className="inp" value={b.label} disabled={dis} onChange={(e) => patch({ label: e.target.value })} /></F>
        {link("b-href", b.href, (href) => patch({ href }))}
        <Seg label="Style" value={b.fill} options={[["solid", "Solid"], ["outline", "Outline"]]} disabled={dis} onChange={(fill) => patch({ fill })} />
        <Seg label="Corners" value={b.radius} options={[["square", "Square"], ["rounded", "Rounded"], ["pill", "Pill"]]} disabled={dis} onChange={(radius) => patch({ radius })} />
        <Seg label="Width" value={b.width} options={[["auto", "Fit label"], ["full", "Full width"]]} disabled={dis} onChange={(width) => patch({ width })} />
        {b.width === "auto" && <AlignPicker value={b.align} disabled={dis} onChange={(align) => patch({ align })} />}
      </>}
      {b.type === "columns" && (["left", "right"] as const).map((side) => {
        const c: Cell = b[side];
        const set = (p: Partial<Cell>, key: string) => patch({ [side]: { ...c, ...p } } as Partial<Block>, `col:${side}:${key}`);
        return (
          <fieldset key={side} className="em-fs">
            <legend>{side === "left" ? "Left column" : "Right column"}</legend>
            <ImageField id={`c-${side}-src`} src={c.imageSrc} disabled={dis} onChange={(imageSrc) => set({ imageSrc }, "src")} />
            {c.imageSrc && <F label="Picture description" id={`c-${side}-alt`}><input id={`c-${side}-alt`} className="inp" value={c.imageAlt} disabled={dis} onChange={(e) => set({ imageAlt: e.target.value }, "alt")} /></F>}
          </fieldset>
        );
      })}
      {b.type === "columns" && <p className="hint" style={{ margin: 0 }}>Click the text in each column to edit it. On phones the columns stack, left first.</p>}
      {b.type === "divider" && <p className="hint" style={{ margin: 0 }}>A thin line that separates sections. It has no settings.</p>}
      {b.type === "spacer" && <F label={`Height · ${b.height}px`} id="s-h"><input id="s-h" type="range" min={4} max={120} step={4} value={b.height} disabled={dis} onChange={(e) => patch({ height: Number(e.target.value) })} /></F>}
      {b.type === "social" && <>
        {b.links.map((l, i) => (
          <div key={i} className="em-social">
            <label className="sr" htmlFor={`so-n-${i}`}>Network</label>
            <select id={`so-n-${i}`} className="inp" value={l.network} disabled={dis} onChange={(e) => patch({ links: b.links.map((x, j) => (j === i ? { ...x, network: e.target.value as SocialNetwork } : x)) }, `so:${i}:n`)}>
              {SOCIAL_NETWORKS.map((n) => <option key={n} value={n}>{SOCIAL_LABEL[n]}</option>)}
            </select>
            <label className="sr" htmlFor={`so-u-${i}`}>{SOCIAL_LABEL[l.network]} address</label>
            <input id={`so-u-${i}`} className="inp" placeholder="https://…" value={l.url} disabled={dis} onChange={(e) => patch({ links: b.links.map((x, j) => (j === i ? { ...x, url: e.target.value.trim() } : x)) }, `so:${i}:u`)} />
            <button type="button" className="btn ghost sm icon danger" aria-label={`Remove ${SOCIAL_LABEL[l.network]} link`} disabled={dis} onClick={() => patch({ links: b.links.filter((_, j) => j !== i) }, `so:rm:${i}:${b.links.length}`)}><Trash2 size={14} aria-hidden="true" /></button>
          </div>
        ))}
        {b.links.length < 8 && <button type="button" className="btn sm" disabled={dis} style={{ alignSelf: "flex-start" }} onClick={() => patch({ links: [...b.links, { network: SOCIAL_NETWORKS.find((n) => !b.links.some((l) => l.network === n)) ?? "website", url: "" }] }, `so:add:${b.links.length}`)}><Plus size={14} aria-hidden="true" />Add link</button>}
        <AlignPicker value={b.align} disabled={dis} onChange={(align) => patch({ align })} />
      </>}
    </div>
  );
}

function Tags() {
  return (
    <div className="field">
      <span className="lab">Personal details</span>
      <span className="hint">Type these where you want each person’s details to appear:</span>
      <ul className="em-tags">{MERGE_TAGS.map((m) => <li key={m.tag}><code>{m.tag}</code><span>{m.label}</span></li>)}</ul>
    </div>
  );
}

function EmailSettings({ doc, update, locked, mail, brand, setBrand, company }: { doc: Doc; update: Update; locked: boolean; mail: MailInfo; brand: Brand; setBrand: (p: Partial<Brand>) => void; company: string }) {
  const set = <K extends "subject" | "preheader" | "fromName" | "replyTo">(k: K, v: string) => update((d) => ({ ...d, [k]: v }), `doc:${k}`);
  const st = <K extends keyof EmailStyle>(k: K, v: EmailStyle[K]) => update((d) => ({ ...d, style: { ...d.style, [k]: v } }), `style:${k}`);
  return (
    <div className="em-insp-b">
      <F label="Subject line" id="e-subj" hint={`${doc.subject.length} characters. Around 40–60 reads best.`}><input id="e-subj" className="inp" value={doc.subject} maxLength={200} disabled={locked} placeholder="What’s this email about?" onChange={(e) => set("subject", e.target.value)} /></F>
      <F label="Preview text" id="e-pre" hint="The grey line inboxes show after the subject."><input id="e-pre" className="inp" value={doc.preheader} maxLength={200} disabled={locked} onChange={(e) => set("preheader", e.target.value)} /></F>
      <F label="From name" id="e-from" hint={`Sent from ${mail.fromAddress}.`}><input id="e-from" className="inp" value={doc.fromName} maxLength={100} disabled={locked} placeholder={mail.fromName} onChange={(e) => set("fromName", e.target.value)} /></F>
      <F label="Replies go to" id="e-reply"><input id="e-reply" type="email" className="inp" value={doc.replyTo} maxLength={200} disabled={locked} placeholder={mail.replyTo || mail.fromAddress} onChange={(e) => set("replyTo", e.target.value.trim())} /></F>
      <hr className="divider" />
      <fieldset className="em-fs">
        <legend>Header</legend>
        <label className="row" style={{ gap: 10, cursor: locked ? "default" : "pointer" }}>
          <button type="button" className={`switch ${doc.style.showLogo ? "on" : ""}`} role="switch" aria-checked={doc.style.showLogo} aria-label="Show the logo header" disabled={locked} onClick={() => st("showLogo", !doc.style.showLogo)} />
          <span style={{ fontWeight: 500 }}>Show your logo at the top</span>
        </label>
        {doc.style.showLogo && <>
          <ImageField id="br-logo" label="Logo" src={brand.logoUrl} disabled={locked} onChange={(logoUrl) => setBrand({ logoUrl })} />
          <span className="hint" style={{ marginTop: -6 }}>{brand.logoUrl ? "Saved for every newsletter, so you only upload it once. Changing it here changes it everywhere." : `Upload it once and every newsletter uses it. Until then, “${company}” is shown as text.`}</span>
          {brand.logoUrl && <>
            <F label={`Logo width · ${brand.logoWidth}px`} id="br-w"><input id="br-w" type="range" min={40} max={400} step={10} value={brand.logoWidth} disabled={locked} onChange={(e) => setBrand({ logoWidth: Number(e.target.value) })} /></F>
            <F label="Logo links to" id="br-href" hint="Usually your website."><input id="br-href" className="inp" placeholder="https://example.com" value={brand.logoHref} disabled={locked} onChange={(e) => setBrand({ logoHref: e.target.value.trim() })} /></F>
          </>}
          <AlignPicker value={doc.style.logoAlign} disabled={locked} onChange={(a) => st("logoAlign", a)} />
        </>}
      </fieldset>
      <div className="em-colors">
        <Color id="c-accent" label="Buttons & links" value={doc.style.accent} disabled={locked} onChange={(v) => st("accent", v)} />
        <Color id="c-text" label="Text" value={doc.style.text} disabled={locked} onChange={(v) => st("text", v)} />
        <Color id="c-surface" label="Email background" value={doc.style.surface} disabled={locked} onChange={(v) => st("surface", v)} />
        <Color id="c-bg" label="Page background" value={doc.style.bg} disabled={locked} onChange={(v) => st("bg", v)} />
      </div>
      <F label="Font" id="e-font" hint="Email apps only show fonts the reader already has, so these are the safe choices.">
        <select id="e-font" className="inp" value={doc.style.font} disabled={locked} onChange={(e) => st("font", e.target.value as FontKey)}>{FONTS.map((f) => <option key={f} value={f}>{FONT_LABEL[f]}</option>)}</select>
      </F>
      <F label="Footer note" id="e-foot" hint="Shown above your address and the unsubscribe link, which are always included."><input id="e-foot" className="inp" value={doc.style.footerNote} maxLength={300} disabled={locked} onChange={(e) => st("footerNote", e.target.value)} /></F>
    </div>
  );
}
