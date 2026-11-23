/**
 * Embed script: /embed/{publicId}.js. Finds <div data-ib-form="{publicId}"> (or inserts one where the script sits),
 * adds an iframe pointing at the hosted form, resizes it to fit, and follows the form's redirect after submit.
 */
import { appUrl, formByPublicId } from "@/lib/lead-forms/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const id = file.replace(/\.js$/, "");
  const form = await formByPublicId(id);
  const js = !form || form.status !== "published" || form.archivedAt
    ? `console.warn("Impeccabyte form ${id.replace(/[^A-Za-z0-9_-]/g, "")} isn’t available.");`
    : `(function(){
var ID=${JSON.stringify(form.publicId)},BASE=${JSON.stringify(appUrl())},TITLE=${JSON.stringify(form.settings.title || form.name)};
var s=document.currentScript;
var targets=document.querySelectorAll('[data-ib-form="'+ID+'"]:not([data-ib-ready])');
if(!targets.length&&s){var d=document.createElement("div");d.setAttribute("data-ib-form",ID);s.parentNode.insertBefore(d,s);targets=[d];}
Array.prototype.forEach.call(targets,function(t){
  t.setAttribute("data-ib-ready","1");
  var f=document.createElement("iframe");
  f.src=BASE+"/f/"+ID+"?embed=1&page="+encodeURIComponent(location.href.split("#")[0]);
  f.title=TITLE;f.loading="lazy";f.setAttribute("allow","");
  f.style.cssText="width:100%;border:0;display:block;min-height:320px;height:640px;background:transparent;color-scheme:normal";
  t.appendChild(f);
  window.addEventListener("message",function(e){
    if(e.origin!==BASE||e.source!==f.contentWindow)return;var m=e.data;if(!m||m.ibForm!==ID)return;
    if(m.height)f.style.height=Math.max(200,m.height)+"px";
    if(m.scroll){var r=f.getBoundingClientRect();if(r.top<0)window.scrollBy(0,r.top-80);}
    if(m.submitted){try{t.dispatchEvent(new CustomEvent("ib-form-submitted",{bubbles:true,detail:{form:ID}}));}catch(_){}}
    if(m.redirect&&/^https:\\/\\//.test(m.redirect))window.location.href=m.redirect;
  });
});})();`;
  return new Response(js, {
    headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300", "access-control-allow-origin": "*", "x-content-type-options": "nosniff" },
  });
}
