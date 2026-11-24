"use client";

import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown, ArrowUp, Bold, Columns2, Copy, GripVertical, Heading as HeadingIcon, Image as ImageIcon, Italic, Link2, List, Minus, MousePointerClick,
  MoveVertical, Share2, SlidersHorizontal, Trash2, Type, Underline, Upload, X, type LucideIcon,
} from "lucide-react";
import { notify } from "@/components/confirm";
import {
  BLOCK_HINT, BLOCK_LABEL, BLOCK_TYPES, FONT_STACK, MERGE_TAGS, SOCIAL_LABEL, blankBlock, newBlockId, validImage, type Block, type BlockType, type Brand, type Cell, type EmailStyle,
} from "@/lib/email/types";
import { contrastOn, mute } from "@/lib/email/render";
import { safeHref } from "@/lib/email/sanitize";
import { Editable } from "./Editable";
import { Inspector } from "./Inspector";
import { uploadImage, type Doc, type MailInfo, type Update } from "./shared";

const ICON: Record<BlockType, LucideIcon> = {
  heading: HeadingIcon, text: Type, image: ImageIcon, button: MousePointerClick, columns: Columns2, divider: Minus, spacer: MoveVertical, social: Share2,
};
const HEAD: Record<number, CSSProperties> = { 1: { fontSize: 28, lineHeight: "34px" }, 2: { fontSize: 22, lineHeight: "28px" }, 3: { fontSize: 17, lineHeight: "24px" } };
const RADIUS: Record<string, string> = { square: "0", rounded: "6px", pill: "999px" };

export function Design({ doc, update, locked, device, mail, company, brand, setBrand }: {
  doc: Doc; update: Update; locked: boolean; device: "desktop" | "mobile"; mail: MailInfo; company: string; brand: Brand; setBrand: (p: Partial<Brand>) => void;
}) {
  const { blocks, style } = doc;
  const [selected, setSelected] = useState<string | null>(null);
  const [inspOpen, setInspOpen] = useState(false);
  const [dragging, setDragging] = useState<{ kind: "new"; type: BlockType } | { kind: "block"; block: Block } | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const insertRef = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const setBlocks = useCallback((fn: (b: Block[]) => Block[], key?: string) => update((d) => ({ ...d, blocks: fn(d.blocks) }), key), [update]);
  const patch = useCallback((id: string, p: Partial<Block>, key?: string) => setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...p } as Block) : b)), key ?? `b:${id}:${Object.keys(p).join()}`), [setBlocks]);
  const addBlock = (type: BlockType, at?: number) => {
    const b = blankBlock(type);
    setBlocks((bs) => { const i = at ?? (selected ? bs.findIndex((x) => x.id === selected) + 1 : bs.length) ; const next = [...bs]; next.splice(i < 0 ? bs.length : i, 0, b); return next; });
    setSelected(b.id);
  };
  const move = (i: number, d: -1 | 1) => setBlocks((bs) => (i + d < 0 || i + d >= bs.length ? bs : arrayMove(bs, i, i + d)));
  const duplicate = (i: number) => { const copy = { ...structuredClone(blocks[i]!), id: newBlockId() }; setBlocks((bs) => { const n = [...bs]; n.splice(i + 1, 0, copy); return n; }); setSelected(copy.id); };
  const remove = (id: string) => { setBlocks((bs) => bs.filter((b) => b.id !== id)); if (selected === id) setSelected(null); };

  const onStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith("new:")) setDragging({ kind: "new", type: id.slice(4) as BlockType });
    else { const block = blocks.find((b) => b.id === id); if (block) setDragging({ kind: "block", block }); }
  };
  // Where a block dragged from the palette would land: above or below the block under it.
  const onMove = (e: DragMoveEvent) => {
    if (!String(e.active.id).startsWith("new:")) return;
    let at: number | null = null;
    if (e.over) {
      if (e.over.id === "canvas-end") at = blocks.length;
      else {
        const i = blocks.findIndex((b) => b.id === e.over!.id);
        const a = e.active.rect.current.translated;
        if (i >= 0) at = a && a.top + a.height / 2 > e.over.rect.top + e.over.rect.height / 2 ? i + 1 : i;
      }
    }
    if (at !== insertRef.current) { insertRef.current = at; setInsertAt(at); }
  };
  const onEnd = (e: DragEndEvent) => {
    const id = String(e.active.id), at = insertRef.current;
    setDragging(null); setInsertAt(null); insertRef.current = null;
    if (id.startsWith("new:")) { if (at !== null) addBlock(id.slice(4) as BlockType, at); return; }
    if (e.over && e.over.id !== e.active.id && e.over.id !== "canvas-end") {
      setBlocks((bs) => { const from = bs.findIndex((b) => b.id === id), to = bs.findIndex((b) => b.id === e.over!.id); return from < 0 || to < 0 ? bs : arrayMove(bs, from, to); });
    } else if (e.over?.id === "canvas-end") {
      setBlocks((bs) => { const from = bs.findIndex((b) => b.id === id); return from < 0 ? bs : arrayMove(bs, from, bs.length - 1); });
    }
  };
  const onCancel = () => { setDragging(null); setInsertAt(null); insertRef.current = null; };

  const sel = blocks.find((b) => b.id === selected) ?? null;
  const paper: CSSProperties = {
    background: style.surface, color: style.text, fontFamily: FONT_STACK[style.font], width: device === "mobile" ? 375 : 600,
    ["--em-accent" as string]: style.accent, ["--em-text" as string]: style.text, ["--em-soft" as string]: mute(style.text, style.surface, 0.18),
  };
  const footInk = mute(contrastOn(style.bg), style.bg);

  return (
    <DndContext id="em-dnd" sensors={sensors} collisionDetection={closestCenter} onDragStart={onStart} onDragMove={onMove} onDragEnd={onEnd} onDragCancel={onCancel}>
      <div className={`em-grid ${locked ? "locked" : ""}`}>
        {!locked && (
          <aside className="em-pal card" aria-label="Blocks">
            <div className="em-pal-h">Blocks <span className="subtle sm">Drag onto the email, or click to add</span></div>
            <div className="em-pal-l">
              {BLOCK_TYPES.map((t) => <PaletteItem key={t} type={t} onAdd={() => addBlock(t)} />)}
            </div>
          </aside>
        )}

        <div className="em-stage" style={{ background: style.bg }} onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className={`em-paper ${device}`} style={paper}>
            {style.showLogo && (
              <button type="button" className={`em-brand ${selected === null ? "on" : ""}`} style={{ textAlign: style.logoAlign, padding: `4px ${device === "mobile" ? 20 : 32}px 12px` }} disabled={locked}
                onClick={() => { setSelected(null); setInspOpen(true); }} aria-label="Header with your logo. Open email settings to change it.">
                {validImage(brand.logoUrl)
                  // eslint-disable-next-line @next/next/no-img-element -- the uploaded workspace logo, shown at its chosen width
                  ? <img src={brand.logoUrl} alt={brand.logoAlt || company} style={{ width: brand.logoWidth, maxWidth: "100%", height: "auto", verticalAlign: "middle" }} draggable={false} />
                  : <span className="em-wordmark">{company}</span>}
              </button>
            )}
            <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              {blocks.map((b, i) => (
                <div key={b.id}>
                  {insertAt === i && <div className="em-drop" aria-hidden="true" />}
                  <SortableBlock
                    block={b} index={i} count={blocks.length} style={style} locked={locked} selected={selected === b.id} narrow={device === "mobile"}
                    onSelect={() => setSelected(b.id)} onMove={(d) => move(i, d)} onDuplicate={() => duplicate(i)} onRemove={() => remove(b.id)}
                    onSettings={() => { setSelected(b.id); setInspOpen(true); }} patch={(p, key) => patch(b.id, p, key)}
                  />
                </div>
              ))}
            </SortableContext>
            {insertAt === blocks.length && blocks.length > 0 && <div className="em-drop" aria-hidden="true" />}
            {!locked && <CanvasEnd empty={blocks.length === 0} active={!!dragging} over={insertAt === blocks.length} />}
          </div>
          <div className="em-foot" style={{ color: footInk, fontFamily: FONT_STACK[style.font], width: device === "mobile" ? 375 : 600 }} aria-label="Footer added to every newsletter">
            {style.footerNote.trim() && <div>{style.footerNote}</div>}
            <div>{company}{mail.postalAddress.trim() ? ` · ${mail.postalAddress}` : <span className="em-warn"> · Add your postal address in Settings → Email</span>}</div>
            <div><u>Unsubscribe</u>&nbsp;&nbsp;·&nbsp;&nbsp;<u>View in browser</u></div>
          </div>
        </div>

        <aside className={`em-insp card ${inspOpen ? "open" : ""}`} aria-label={sel ? `${BLOCK_LABEL[sel.type]} settings` : "Email settings"}>
          <div className="em-insp-h">
            <h2>{sel ? BLOCK_LABEL[sel.type] : "Email settings"}</h2>
            {sel && <button className="btn ghost sm" type="button" onClick={() => setSelected(null)}>Email settings</button>}
            <button className="btn ghost sm icon em-insp-x" type="button" aria-label="Close settings" onClick={() => setInspOpen(false)}><X size={16} aria-hidden="true" /></button>
          </div>
          <Inspector key={sel?.id ?? "email"} doc={doc} update={update} block={sel} patch={(p, key) => sel && patch(sel.id, p, key)} locked={locked} mail={mail} brand={brand} setBrand={setBrand} company={company} />
        </aside>
        {inspOpen && <div className="em-insp-scrim" onClick={() => setInspOpen(false)} aria-hidden="true" />}
        {!locked && <button className="btn em-insp-open" type="button" onClick={() => setInspOpen(true)}><SlidersHorizontal size={16} aria-hidden="true" />{sel ? `${BLOCK_LABEL[sel.type]} settings` : "Email settings"}</button>}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.7,.2,1)" }}>
        {dragging?.kind === "new" && <div className="em-chip lift"><Chip type={dragging.type} /></div>}
        {dragging?.kind === "block" && (
          <div className="em-ghost" style={{ ...paper, width: device === "mobile" ? 375 : 600 }}>
            <BlockView block={dragging.block} style={style} locked narrow={device === "mobile"} selected={false} patch={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function Chip({ type }: { type: BlockType }) {
  const Icon = ICON[type];
  return <><span className="ic"><Icon size={16} aria-hidden="true" /></span><span className="tx"><b>{BLOCK_LABEL[type]}</b><span>{BLOCK_HINT[type]}</span></span></>;
}

function PaletteItem({ type, onAdd }: { type: BlockType; onAdd: () => void }) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: `new:${type}` });
  // Pointer and touch drag only: on the keyboard, Enter or Space adds the block (the button's normal click).
  const { onKeyDown: _keyboardDrag, ...pointer } = listeners ?? {};
  void _keyboardDrag;
  return (
    <button ref={setNodeRef} type="button" className={`em-chip ${isDragging ? "src" : ""}`} onClick={onAdd} {...pointer} aria-label={`Add ${BLOCK_LABEL[type].toLowerCase()} block`}>
      <Chip type={type} />
    </button>
  );
}

function CanvasEnd({ empty, active, over }: { empty: boolean; active: boolean; over: boolean }) {
  const { setNodeRef } = useDroppable({ id: "canvas-end" });
  return (
    <div ref={setNodeRef} className={`em-end ${empty ? "empty" : ""} ${active ? "active" : ""} ${over ? "over" : ""}`}>
      {empty ? <><b>Your email is empty</b><span>Drag a block here, or click one on the left.</span></> : active ? <span>Drop here to add at the end</span> : null}
    </div>
  );
}

type BlockProps = {
  block: Block; style: EmailStyle; locked: boolean; selected: boolean; narrow: boolean;
  patch: (p: Partial<Block>, key?: string) => void;
};

function SortableBlock(p: BlockProps & { index: number; count: number; onSelect: () => void; onMove: (d: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void; onSettings: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: p.block.id, disabled: p.locked });
  const label = BLOCK_LABEL[p.block.type];
  const richBlock = p.block.type === "text" || p.block.type === "columns";
  return (
    <div
      ref={setNodeRef}
      className={`em-block ${p.selected ? "on" : ""} ${isDragging ? "drag" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={p.onSelect}
      onFocusCapture={p.onSelect}
    >
      {!p.locked && (
        <div className="em-tools" role="toolbar" aria-label={`${label} block`} onClick={(e) => e.stopPropagation()}>
          <button ref={setActivatorNodeRef} type="button" className="em-t grip" aria-label={`Drag to move ${label.toLowerCase()} block`} {...attributes} {...listeners}><GripVertical size={14} aria-hidden="true" /></button>
          <span className="em-t-n">{label}</span>
          {richBlock && p.selected && <FormatTools />}
          <span className="sp" />
          <button type="button" className="em-t" aria-label="Move up" disabled={p.index === 0} onClick={() => p.onMove(-1)}><ArrowUp size={14} aria-hidden="true" /></button>
          <button type="button" className="em-t" aria-label="Move down" disabled={p.index === p.count - 1} onClick={() => p.onMove(1)}><ArrowDown size={14} aria-hidden="true" /></button>
          <button type="button" className="em-t em-t-set" aria-label={`${label} settings`} onClick={p.onSettings}><SlidersHorizontal size={14} aria-hidden="true" /></button>
          <button type="button" className="em-t" aria-label="Duplicate" onClick={p.onDuplicate}><Copy size={14} aria-hidden="true" /></button>
          <button type="button" className="em-t danger" aria-label="Delete block" onClick={p.onRemove}><Trash2 size={14} aria-hidden="true" /></button>
        </div>
      )}
      <BlockView {...p} />
    </div>
  );
}

/** Bold / italic / underline / list / link / merge tags for the text being edited. Uses the browser's own editing commands. */
function FormatTools() {
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState("");
  const range = useRef<Range | null>(null);
  const keep = (e: React.MouseEvent) => e.preventDefault(); // don't take focus away from the text
  const cmd = (name: string, value?: string) => document.execCommand(name, false, value);
  const restore = () => {
    const s = window.getSelection(), r = range.current;
    if (!s || !r) return;
    const host = (r.startContainer instanceof Element ? r.startContainer : r.startContainer.parentElement)?.closest<HTMLElement>("[contenteditable]");
    host?.focus();
    s.removeAllRanges(); s.addRange(r);
  };
  const openLink = () => {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0 || s.isCollapsed) { notify("Select the words you want to turn into a link first.", { error: true }); return; }
    range.current = s.getRangeAt(0).cloneRange();
    const a = (s.anchorNode?.parentElement)?.closest("a");
    setUrl(a?.getAttribute("href") ?? "");
    setLinking(true);
  };
  const applyLink = () => {
    restore();
    const href = safeHref(url);
    if (!url.trim()) cmd("unlink");
    else if (!href) { notify("That doesn’t look like a web address. Start with https://", { error: true }); return; }
    else cmd("createLink", href);
    setLinking(false);
  };
  return (
    <span className="em-fmt">
      <button type="button" className="em-t" aria-label="Bold" onMouseDown={keep} onClick={() => cmd("bold")}><Bold size={14} aria-hidden="true" /></button>
      <button type="button" className="em-t" aria-label="Italic" onMouseDown={keep} onClick={() => cmd("italic")}><Italic size={14} aria-hidden="true" /></button>
      <button type="button" className="em-t" aria-label="Underline" onMouseDown={keep} onClick={() => cmd("underline")}><Underline size={14} aria-hidden="true" /></button>
      <button type="button" className="em-t" aria-label="Bulleted list" onMouseDown={keep} onClick={() => cmd("insertUnorderedList")}><List size={14} aria-hidden="true" /></button>
      <button type="button" className="em-t" aria-label="Link" aria-expanded={linking} onMouseDown={keep} onClick={openLink}><Link2 size={14} aria-hidden="true" /></button>
      <select className="em-t-sel" aria-label="Insert a personal detail" value="" onMouseDown={() => { const s = window.getSelection(); range.current = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null; }}
        onChange={(e) => { if (!e.target.value) return; restore(); cmd("insertText", e.target.value); }}>
        <option value="">Insert…</option>
        {MERGE_TAGS.map((m) => <option key={m.tag} value={m.tag}>{m.label}</option>)}
      </select>
      {linking && (
        <form className="em-link pop" onSubmit={(e) => { e.preventDefault(); applyLink(); }}>
          <label className="sr" htmlFor="em-link-url">Link address</label>
          <input id="em-link-url" className="inp" autoFocus placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setLinking(false); }} />
          <button className="btn pri sm" type="submit">{url.trim() ? "Apply" : "Remove link"}</button>
          <button className="btn ghost sm" type="button" onClick={() => setLinking(false)}>Cancel</button>
        </form>
      )}
    </span>
  );
}

function CanvasImage({ src, alt, onUploaded, locked, small }: { src: string; alt: string; onUploaded: (url: string) => void; locked: boolean; small?: boolean }) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pick = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    try { onUploaded(await uploadImage(f)); } catch (e) { notify((e as Error).message, { error: true }); } finally { setBusy(false); }
  };
  // eslint-disable-next-line @next/next/no-img-element -- email pictures are arbitrary remote/uploaded files shown at their own size
  if (src) return <img src={src} alt={alt} style={{ display: "block", width: "100%", height: "auto", borderRadius: 4 }} draggable={false} />;
  if (locked) return null;
  return (
    <div className={`em-imgph ${small ? "sm" : ""}`} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files[0]); }}>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" className="btn sm" disabled={busy} onClick={() => input.current?.click()}><Upload size={14} aria-hidden="true" />{busy ? "Uploading…" : small ? "Add picture" : "Upload a picture"}</button>
      {!small && <span>PNG, JPG, GIF or WebP, up to 2 MB. You can also drop a file here.</span>}
    </div>
  );
}

export function BlockView({ block: b, style, locked, selected, narrow, patch }: BlockProps): ReactNode {
  const pad = narrow ? 20 : 32;
  const box = (v: string): CSSProperties => { const [t, , bm] = (v + " x x").split(" "); return { padding: `${t} ${pad}px ${bm === "x" ? t : bm}` }; };
  switch (b.type) {
    case "heading":
      return <div style={box("10px 32px 6px")}><Editable label="Heading text" value={b.text} onChange={(text) => patch({ text })} disabled={locked} placeholder="Heading" style={{ ...HEAD[b.level], fontWeight: 700, textAlign: b.align, margin: 0 }} /></div>;
    case "text":
      return <div style={box("6px 32px 0px")}><Editable rich label="Text" className="em-rich" value={b.html} onChange={(html) => patch({ html })} disabled={locked} placeholder="Write something…" style={{ textAlign: b.align }} /></div>;
    case "image": {
      const al = b.align === "center" ? "0 auto" : b.align === "right" ? "0 0 0 auto" : "0";
      return <div style={box("10px 32px 10px")}><div style={{ width: b.src ? `${b.width}%` : "100%", margin: al }}><CanvasImage src={b.src} alt={b.alt} locked={locked} onUploaded={(src) => patch({ src }, "img")} /></div></div>;
    }
    case "button": {
      const solid = b.fill !== "outline", full = b.width === "full";
      return (
        <div style={{ ...box("12px 32px 12px"), textAlign: b.align }}>
          <span className="em-btn" style={{ display: full ? "block" : "inline-block", background: solid ? style.accent : "transparent", color: solid ? contrastOn(style.accent) : style.accent, border: `2px solid ${style.accent}`, borderRadius: RADIUS[b.radius] ?? "6px" }}>
            <Editable label="Button label" value={b.label} onChange={(label) => patch({ label })} disabled={locked} placeholder="Button label" />
          </span>
          {!locked && selected && !b.href && <div className="em-note">Add this button’s link in the settings panel.</div>}
        </div>
      );
    }
    case "columns": {
      const cell = (side: "left" | "right", c: Cell) => (
        <div className="em-col">
          {(c.imageSrc || (selected && !locked)) && <div style={{ marginBottom: 10 }}><CanvasImage small src={c.imageSrc} alt={c.imageAlt} locked={locked} onUploaded={(imageSrc) => patch({ [side]: { ...c, imageSrc } } as Partial<Block>, "img")} /></div>}
          <Editable rich label={`${side === "left" ? "Left" : "Right"} column text`} className="em-rich" value={c.html} onChange={(html) => patch({ [side]: { ...c, html } } as Partial<Block>, `col:${side}`)} disabled={locked} placeholder="Write something…" />
        </div>
      );
      return <div className={`em-cols ${narrow ? "stack" : ""}`} style={box("8px 32px 0px")}>{cell("left", b.left)}{cell("right", b.right)}</div>;
    }
    case "divider": return <div style={box("14px 32px 14px")}><div style={{ borderTop: "1px solid var(--em-soft)" }} /></div>;
    case "spacer": return <div className="em-spacer" style={{ height: b.height }} aria-label={`Spacer, ${b.height} pixels`} />;
    case "social": {
      const links = b.links.filter((l) => l.url);
      return (
        <div style={{ ...box("10px 32px 10px"), textAlign: b.align, fontSize: 13, lineHeight: "20px" }}>
          {links.length === 0
            ? <span className="em-note" style={{ margin: 0 }}>Add your profile links in the settings panel.</span>
            : links.map((l, i) => <span key={i}>{i > 0 && <span style={{ opacity: .5 }}>&nbsp;&nbsp;·&nbsp;&nbsp;</span>}<span style={{ color: style.accent, textDecoration: "underline", fontWeight: 600 }}>{SOCIAL_LABEL[l.network]}</span></span>)}
        </div>
      );
    }
  }
}
