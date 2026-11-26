import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Info } from "lucide-react";
import { requirePortalUser } from "@/lib/portal/dal";
import { fmtUsd, getDisputes } from "@/lib/portal/data";
import { day, DisputeBadge } from "../../ui";

export const metadata: Metadata = { title: "Disputes" };

export default async function Disputes() {
  const u = await requirePortalUser();
  const rows = await getDisputes(u);
  const today = new Date().toISOString().slice(0, 10);
  const open = rows.filter((r) => r.status === "Processed");
  const closed = rows.filter((r) => r.status !== "Processed");

  return (
    <>
      <div className="mp-head">
        <div>
          <h1>Disputes</h1>
          <p>
            A dispute (the industry calls it a chargeback) is when a cardholder asks their bank to reverse a payment.
            The amount is held until the card network decides. Proof of the sale, like a signed receipt, an invoice or a delivery
            confirmation, is how disputes are won, and you usually have a set number of days to send it.
          </p>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="mp-allclear" role="status">
          <span className="mp-ico"><Info aria-hidden="true" /></span>
          <span><b>No disputes on your account.</b> If a customer disputes a charge, it shows here and on your home page right away.</span>
        </div>
      )}

      {open.length > 0 && (
        <section aria-labelledby="open-h" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 id="open-h">Open</h2>
          {open.map((r) => {
            const late = r.respondBy ? r.respondBy < today : false;
            return (
              <div key={r.id} className={`mp-item ${r.request ? "" : "need"}`}>
                <div className="tx">
                  <b>{fmtUsd(r.amount)} {[r.cardBrand, r.cardLast4 ? `••${r.cardLast4}` : null].filter(Boolean).join(" ")}</b>
                  <span>
                    {[r.reason ?? (r.reasonCode ? `Reason code ${r.reasonCode}` : null), r.transactionDate ? `sale on ${day(r.transactionDate)}` : null, `received ${day(r.receivedAt)}`, `case ${r.caseId}`].filter(Boolean).join(" · ")}
                  </span>
                  {r.respondBy && <span><b style={{ fontSize: 14 }}>{late ? `The response date passed on ${day(r.respondBy, true)}.` : `Respond by ${day(r.respondBy, true)}.`}</b></span>}
                </div>
                <DisputeBadge status={r.status} helping={Boolean(r.request)} />
                {r.request
                  ? <Link className="mp-btn sec sm" href={`/requests/${r.request.id}`}>See the conversation</Link>
                  : !late && <Link className="mp-btn" href={`/requests/new?kind=dispute&chargeback=${r.id}`}>Tell us what happened<ArrowRight aria-hidden="true" /></Link>}
              </div>
            );
          })}
        </section>
      )}

      {closed.length > 0 && (
        <section aria-labelledby="closed-h" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 id="closed-h">Decided</h2>
          <div className="mp-tablewrap">
            <table className="mp-table">
              <caption className="sr">Disputes that have been decided</caption>
              <thead><tr><th scope="col">Received</th><th scope="col">Card</th><th scope="col">Reason</th><th scope="col" className="r">Amount</th><th scope="col">Outcome</th></tr></thead>
              <tbody>
                {closed.map((r) => (
                  <tr key={r.id}>
                    <td>{day(r.receivedAt)}</td>
                    <td className="muted">{[r.cardBrand, r.cardLast4 ? `••${r.cardLast4}` : null].filter(Boolean).join(" ") || "–"}</td>
                    <td className="muted">{r.reason ?? r.reasonCode ?? "–"}</td>
                    <td className="r amt">{fmtUsd(r.amount)}</td>
                    <td><DisputeBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
