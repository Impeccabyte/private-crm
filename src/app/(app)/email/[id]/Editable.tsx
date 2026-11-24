"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { sanitizeRich } from "@/lib/email/sanitize";

/**
 * In-place text editing on the canvas. `rich` keeps bold / italic / links / lists (cleaned with the same allowlist
 * the server uses); otherwise it's a single line of plain text. The DOM is only overwritten when the value changes
 * from outside (undo, load), never while you type, so the caret stays put.
 */
export function Editable({ value, onChange, rich, disabled, className, style, label, placeholder }: {
  value: string; onChange: (v: string) => void; rich?: boolean; disabled?: boolean; className?: string; style?: CSSProperties; label: string; placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || last.current === value) return;
    if (rich) el.innerHTML = value; else el.textContent = value;
    last.current = value;
  }, [value, rich]);

  const read = (el: HTMLDivElement) => (rich ? el.innerHTML : (el.textContent ?? "").replace(/\s*\n\s*/g, " "));

  return (
    <div
      ref={ref}
      className={`em-edit ${className ?? ""}`}
      style={style}
      role="textbox"
      aria-label={label}
      aria-multiline={!!rich}
      data-placeholder={placeholder}
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck
      onFocus={() => { if (rich) { try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* not supported */ } } }}
      onInput={(e) => { const v = read(e.currentTarget); last.current = v; onChange(v); }}
      onBlur={(e) => {
        if (!rich) return;
        // Focus moved to this block's own toolbar (link field, insert menu): leave the DOM alone so the selection survives.
        if (e.relatedTarget instanceof Element && e.relatedTarget.closest(".em-tools")) return;
        // Normalise what the browser produced (divs, stray spans) so the canvas matches what will be sent.
        const clean = sanitizeRich(e.currentTarget.innerHTML);
        if (clean !== e.currentTarget.innerHTML) { e.currentTarget.innerHTML = clean; last.current = clean; onChange(clean); }
      }}
      onKeyDown={(e) => { if (!rich && e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
      onPaste={(e) => {
        // Paste as plain text: formatting copied from web pages and Word doesn't survive in email.
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, rich ? text : text.replace(/\s*\n\s*/g, " "));
      }}
      onDrop={(e) => e.preventDefault()}
    />
  );
}
