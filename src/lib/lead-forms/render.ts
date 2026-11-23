/**
 * Renders a lead form as a complete, self-contained HTML document (inline CSS + a small inline script).
 * The public page at /f/{publicId} serves this, and the builder shows the same output in an iframe preview,
 * so what you build is exactly what visitors see. Every user-provided string goes through esc().
 */
import type { FormField, FormSettings } from "./types";

// Kept in sync with src/lib/files.ts (that module is server-only).
const FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.csv,.xlsx,.xls";
const FILE_HINT = "PDF, JPG, PNG, HEIC, CSV or Excel · up to 10 MB each";

export type RenderOpts = {
  /** URL the form posts to. */
  action: string;
  /** Signed anti-spam token (omitted in preview). */
  token?: string;
  /** Inside an iframe on another site: transparent background, reports its height to the embed script. */
  embed: boolean;
  /** Builder preview: never submits. */
  preview?: boolean;
  /** Script nonce matching the page's Content-Security-Policy. */
  nonce?: string;
  /** Show the thank-you state (no-JS fallback after submitting). */
  sent?: boolean;
  /** Page the form is embedded on (from the embed script), stored with the submission. */
  pageUrl?: string;
  /** Fallback accent when the form has none (the CRM's accent color). */
  defaultAccent: string;
  /** Shown instead of the form (e.g. not allowed on this site). */
  notice?: string;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const hex = (s: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(s) ? s : fallback);

// Button options are looked up, never interpolated, so a stored value can't reach the stylesheet.
// Unknown or missing values (forms saved before these existed) fall back to the original button.
const BTN_RADIUS: Record<string, string> = { square: "0", rounded: "8px", extra: "14px", pill: "999px" };
const BTN_SIZE: Record<string, string> = { small: "height:40px;padding:0 16px;font-size:14px", medium: "height:46px;padding:0 22px;font-size:15px", large: "height:54px;padding:0 28px;font-size:16px" };
const pick = (table: Record<string, string>, key: unknown, fallback: string) => (typeof key === "string" && Object.hasOwn(table, key) ? table[key] : table[fallback]);

function fieldHtml(f: FormField) {
  const id = `f_${f.id}`;
  const req = f.required ? " required" : "";
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : "";
  const help = f.help ? `<span class="help" id="${id}_h">${esc(f.help)}</span>` : "";
  const desc = ` aria-describedby="${f.help ? `${id}_h ` : ""}${id}_e"`;
  const star = f.required ? ` <span class="req" aria-hidden="true">*</span>` : "";
  const err = `<span class="err" id="${id}_e" role="alert"></span>`;
  if (f.type === "file") {
    const max = f.maxFiles ?? 3;
    return `<div class="fld full"><span class="lbl" id="${id}_l">${esc(f.label)}${star}</span>
<div class="drop" data-max="${max}">
  <input type="file" id="${id}" name="${id}" accept="${FILE_ACCEPT}"${max > 1 ? " multiple" : ""}${req} aria-labelledby="${id}_l ${id}_c"${desc}>
  <div class="drop-in" id="${id}_c" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>
    <span><b>Choose ${max > 1 ? "files" : "a file"}</b> or drag ${max > 1 ? "them" : "it"} here</span>
    <span class="dh">${FILE_HINT}${max > 1 ? ` · up to ${max} files` : ""}</span>
  </div>
</div>
<ul class="files" id="${id}_list" aria-live="polite"></ul>${help}${err}</div>`;
  }
  if (f.type === "checkbox") {
    return `<div class="fld full chk"><label><input type="checkbox" id="${id}" name="${id}" value="yes"${req}${desc}> <span>${esc(f.label)}${star}</span></label>${help}${err}</div>`;
  }
  let input: string;
  switch (f.type) {
    case "textarea": input = `<textarea id="${id}" name="${id}" rows="4"${req}${ph}${desc} maxlength="5000"></textarea>`; break;
    case "select": input = `<select id="${id}" name="${id}"${req}${desc}><option value="">${esc(f.placeholder || "Choose…")}</option>${(f.options ?? []).map((o) => `<option>${esc(o)}</option>`).join("")}</select>`; break;
    default: {
      // Website fields are plain text so "example.com" works without https:// (the server adds it).
      const t = { text: "text", email: "email", phone: "tel", number: "text", url: "text" }[f.type] ?? "text";
      const ac = { email: ' autocomplete="email"', phone: ' autocomplete="tel"', url: ' autocomplete="url"' }[f.type as string] ?? (f.mapTo === "contactName" ? ' autocomplete="name"' : f.mapTo === "businessName" ? ' autocomplete="organization"' : "");
      const mode = f.type === "number" ? ' inputmode="decimal"' : f.type === "url" ? ' inputmode="url" pattern="(https?://)?[^\\s.]+\\.[^\\s]+" data-kind="url" autocapitalize="off" spellcheck="false"' : "";
      input = `<input type="${t}" id="${id}" name="${id}"${req}${ph}${desc}${ac}${mode} maxlength="500">`;
    }
  }
  return `<div class="fld ${f.width === "half" ? "half" : "full"}"><label for="${id}">${esc(f.label)}${star}</label>${input}${help}${err}</div>`;
}

export function renderFormHtml(form: { publicId: string; name: string; fields: FormField[]; settings: FormSettings }, o: RenderOpts) {
  const s = form.settings;
  const accent = hex(s.accentColor, hex(o.defaultAccent, "#5B5BD6"));
  const dark = s.theme === "dark";
  const outline = s.buttonFill === "outline";
  const btnCss = `border-radius:${pick(BTN_RADIUS, s.buttonRadius, "rounded")};${pick(BTN_SIZE, s.buttonSize, "medium")};${s.buttonWidth === "full" ? "width:100%;" : ""}${
    outline ? `color:${dark ? "color-mix(in srgb,var(--a) 60%,#fff)" : "var(--a)"};background:transparent;border:1.5px solid currentColor` : "color:#fff;background:var(--a);border:0"}`;
  const nonce = o.nonce ? ` nonce="${esc(o.nonce)}"` : "";
  const body = o.notice
    ? `<div class="box"><p class="intro">${esc(o.notice)}</p></div>`
    : `<div class="box">
  ${s.title ? `<h1>${esc(s.title)}</h1>` : ""}${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ""}
  <form id="ibf" method="post" action="${esc(o.action)}" novalidate${o.sent ? " hidden" : ""}>
    <div class="grid">${form.fields.map(fieldHtml).join("")}</div>
    ${s.consentText ? `<div class="fld full chk"><label><input type="checkbox" name="consent" value="yes" required aria-describedby="consent_e"> <span>${esc(s.consentText)} <span class="req" aria-hidden="true">*</span></span></label><span class="err" id="consent_e" role="alert"></span></div>` : ""}
    <div class="hp" aria-hidden="true"><label>Leave this empty<input type="text" name="website_url" tabindex="-1" autocomplete="off"></label></div>
    ${o.token ? `<input type="hidden" name="t" value="${esc(o.token)}">` : ""}
    <input type="hidden" name="page_url" value="${esc(o.pageUrl ?? "")}">
    ${o.embed ? `<input type="hidden" name="embed" value="1">` : ""}
    <p class="formerr" role="alert" id="ibf_err"></p>
    <button type="submit" class="btn">${esc(s.submitLabel || "Send")}</button>
    ${o.preview ? `<p class="pv">Preview: submissions are turned off here.</p>` : ""}
  </form>
  <div id="ibf_done" class="done"${o.sent ? "" : " hidden"} role="status" tabindex="-1">
    <div class="tick" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
    <h2>${esc(s.successTitle || "Thanks!")}</h2>${s.successMessage ? `<p>${esc(s.successMessage)}</p>` : ""}
  </div>
</div>`;

  const css = `
:root{--a:${accent};--bg:${dark ? "#14171C" : "#FFFFFF"};--ink:${dark ? "#E8EAEE" : "#111827"};--ink2:${dark ? "#B0B6C1" : "#475163"};--line:${dark ? "#39404B" : "#C9CED6"};--field:${dark ? "#191C22" : "#FFFFFF"};--err:${dark ? "#FF928A" : "#B42318"};color-scheme:${dark ? "dark" : "light"}}
*{box-sizing:border-box}html,body{margin:0}
body{font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:${o.embed ? "transparent" : "var(--bg)"};-webkit-font-smoothing:antialiased}
.box{max-width:640px;margin:0 auto;padding:${o.embed ? "4px 2px 8px" : "40px 20px"};${o.embed ? "" : ""}}
h1{font-size:22px;line-height:1.3;margin:0 0 6px;letter-spacing:-.01em}h2{font-size:19px;margin:12px 0 4px}
.intro{color:var(--ink2);margin:0 0 20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 14px}
.fld{display:flex;flex-direction:column;gap:6px;min-width:0}.full{grid-column:1/-1}
@media (max-width:480px){.grid{grid-template-columns:1fr}.half{grid-column:1/-1}}
label{font-size:13px;font-weight:600;color:var(--ink)}.req{color:var(--err)}
input[type=text],input[type=email],input[type=tel],input[type=url],select,textarea{width:100%;font:inherit;color:var(--ink);background:var(--field);border:1px solid var(--line);border-radius:8px;padding:10px 12px;min-height:44px}
textarea{resize:vertical}
select{-webkit-appearance:none;-moz-appearance:none;appearance:none;padding-right:40px;cursor:pointer;line-height:1.4;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='${dark ? "%23B0B6C1" : "%23475163"}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;background-size:16px}
select[data-empty]{color:var(--ink2)}select option{color:var(--ink);background:var(--field)}
select::-ms-expand{display:none}
input:focus,select:focus,textarea:focus{outline:2px solid var(--a);outline-offset:-1px;border-color:var(--a)}
[aria-invalid=true]{border-color:var(--err)!important}
.lbl{font-size:13px;font-weight:600;color:var(--ink)}
.drop{position:relative;display:flex;align-items:center;justify-content:center;min-height:96px;border:1px dashed var(--line);border-radius:8px;background:var(--field);transition:border-color .15s,background-color .15s}
.drop:hover,.drop.over{border-color:var(--a);background:color-mix(in srgb,var(--a) 6%,var(--field))}
.drop:focus-within{outline:2px solid var(--a);outline-offset:-1px;border-color:var(--a);border-style:solid}
.drop input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:0}
.drop-in{display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 16px;text-align:center;color:var(--ink2);pointer-events:none;font-size:14px}
.drop-in svg{color:var(--a)}.drop-in b{color:var(--a);font-weight:600}.dh{font-size:12.5px}
.drop[aria-invalid=true],.drop:has(input[aria-invalid=true]){border-color:var(--err);border-style:solid}
.files{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}.files:empty{display:none}
.files li{display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:8px;padding:8px 8px 8px 12px;background:var(--field);font-size:13.5px;min-height:44px}
.files .fn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.files .fs{color:var(--ink2);font-size:12.5px;flex:none}
.files button{flex:none;width:28px;height:28px;border:0;border-radius:6px;background:transparent;color:var(--ink2);cursor:pointer;font-size:18px;line-height:1}
.files button:hover{background:color-mix(in srgb,var(--ink) 8%,transparent);color:var(--ink)}
.files button:focus-visible{outline:2px solid var(--a);outline-offset:1px}
.chk label{display:flex;gap:10px;align-items:flex-start;font-weight:500;cursor:pointer}.chk input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--a);flex:none}
.help{font-size:12.5px;color:var(--ink2)}.err{font-size:12.5px;color:var(--err);min-height:0}.err:empty{display:none}
.formerr{color:var(--err);font-size:13.5px;margin:14px 0 0}.formerr:empty{display:none}
.btn{margin-top:18px;font-family:inherit;font-weight:600;line-height:1;cursor:pointer;min-width:120px;transition:filter .15s,background-color .15s,transform .1s;${btnCss}}
.btn:hover{${outline ? "background:color-mix(in srgb,var(--a) 10%,transparent)" : "filter:brightness(.93)"}}.btn:active{transform:scale(.98)}.btn[disabled]{opacity:.6;cursor:progress}
.btn:focus-visible{outline:2px solid var(--a);outline-offset:3px}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.pv{font-size:12.5px;color:var(--ink2);margin:10px 0 0}
.done{text-align:center;padding:24px 8px;animation:in .3s ease-out}.done p{color:var(--ink2);margin:0}
.tick{width:44px;height:44px;border-radius:50%;margin:0 auto;display:grid;place-items:center;color:#fff;background:var(--a)}
@keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
[hidden]{display:none!important}`;

  const js = `(function(){
var ID=${JSON.stringify(form.publicId)},EMBED=${o.embed ? "true" : "false"},PREVIEW=${o.preview ? "true" : "false"};
var f=document.getElementById("ibf"),done=document.getElementById("ibf_done"),ferr=document.getElementById("ibf_err");
function post(m){if(EMBED&&window.parent!==window){m.ibForm=ID;window.parent.postMessage(m,"*");}}
function size(){post({height:Math.ceil(document.body.getBoundingClientRect().height)});}
if(window.ResizeObserver){new ResizeObserver(size).observe(document.body);}window.addEventListener("load",size);size();
if(!f)return;
function fmt(n){return n<1024?n+" B":n<1048576?Math.round(n/1024)+" KB":(n/1048576).toFixed(1)+" MB";}
var OK=/\.(pdf|jpe?g|png|heic|heif|csv|xlsx|xls)$/i,MAXB=10485760;
Array.prototype.forEach.call(f.querySelectorAll(".drop"),function(d){
 var inp=d.querySelector("input"),list=document.getElementById(inp.id+"_list"),max=+d.getAttribute("data-max")||1,kept=[];
 function sync(){try{var dt=new DataTransfer();kept.forEach(function(x){dt.items.add(x);});inp.files=dt.files;}catch(_){}render();}
 function render(){list.innerHTML="";kept.forEach(function(x,i){var li=document.createElement("li");var n=document.createElement("span");n.className="fn";n.textContent=x.name;var s=document.createElement("span");s.className="fs";s.textContent=fmt(x.size);var b=document.createElement("button");b.type="button";b.setAttribute("aria-label","Remove "+x.name);b.textContent="\u00d7";b.addEventListener("click",function(){kept.splice(i,1);sync();inp.focus();});li.appendChild(n);li.appendChild(s);li.appendChild(b);list.appendChild(li);});size();}
 inp.addEventListener("change",function(){var msg="";Array.prototype.forEach.call(inp.files,function(x){if(!OK.test(x.name)){msg="“"+x.name+"” isn’t a PDF, image, CSV or Excel file.";return;}if(x.size>MAXB){msg="“"+x.name+"” is over 10 MB.";return;}if(kept.length>=max){msg="You can attach up to "+max+" file"+(max>1?"s":"")+".";return;}if(!kept.some(function(k){return k.name===x.name&&k.size===x.size;}))kept.push(x);});setErr(inp.name,msg);sync();});
 ["dragenter","dragover"].forEach(function(t){d.addEventListener(t,function(){d.classList.add("over");});});
 ["dragleave","drop"].forEach(function(t){d.addEventListener(t,function(){d.classList.remove("over");});});
});
Array.prototype.forEach.call(f.querySelectorAll("select"),function(el){function u(){if(el.value)el.removeAttribute("data-empty");else el.setAttribute("data-empty","");}u();el.addEventListener("change",u);});
function setErr(name,msg){var el=f.elements[name];var e=document.getElementById(name+"_e");if(e)e.textContent=msg||"";if(el&&el.setAttribute){if(msg)el.setAttribute("aria-invalid","true");else el.removeAttribute("aria-invalid");}}
function check(){var ok=true,first=null;Array.prototype.forEach.call(f.querySelectorAll("input,select,textarea"),function(el){if(!el.name||el.type==="hidden"||el.closest(".hp"))return;var msg="";
 if(el.validity&&!el.validity.valid){msg=el.validity.valueMissing?(el.type==="checkbox"?"Please tick this box.":el.type==="file"?"Please attach a file.":"This field is required."):el.type==="email"?"Enter a valid email address.":el.getAttribute("data-kind")==="url"?"Enter a website address, e.g. example.com":"Check this field.";}
 setErr(el.name,msg);if(msg){ok=false;if(!first)first=el;}});if(first)first.focus();return ok;}
f.addEventListener("input",function(e){if(e.target.getAttribute("aria-invalid"))setErr(e.target.name,"");});
f.addEventListener("submit",function(e){e.preventDefault();ferr.textContent="";if(!check())return;
 if(PREVIEW){ferr.textContent="Preview only: nothing was sent.";return;}
 var b=f.querySelector("button[type=submit]");b.disabled=true;var label=b.textContent;b.textContent="Sending…";
 fetch(f.action,{method:"POST",body:new FormData(f),headers:{"Accept":"application/json"},credentials:"omit"}).then(function(r){return r.json().catch(function(){return {error:"Something went wrong. Please try again."};});}).then(function(d){
  if(d&&d.ok){f.hidden=true;done.hidden=false;done.focus();post({submitted:true});size();if(d.redirect){if(EMBED)post({redirect:d.redirect});else window.location.href=d.redirect;}return;}
  if(d&&d.errors){var first=null;Object.keys(d.errors).forEach(function(k){var n=k==="consent"?"consent":"f_"+k;setErr(n,d.errors[k]);if(!first)first=f.elements[n];});if(first&&first.focus)first.focus();}
  ferr.textContent=(d&&d.error)||(d&&d.errors?"":"Something went wrong. Please try again.");
 }).catch(function(){ferr.textContent="Couldn’t send. Check your connection and try again.";}).finally(function(){b.disabled=false;b.textContent=label;size();});
});})();`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(s.title || form.name)}</title><style>${css}</style></head><body>${body}<script${nonce}>${js}</script></body></html>`;
}
