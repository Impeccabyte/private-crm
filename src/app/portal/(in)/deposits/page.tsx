import Link from "next/link";
import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requirePortalUser } from "@/lib/portal/dal";
import { fmtUsd, getDeposits } from "@/lib/portal/data";
import { day, monthName } from "../../ui";

export const metadata: Metadata = { title: "Deposits" };

const ym = (d: Date) => d.toISOString().slice(0, 7);
const lastDay = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y!, mo!, 0)).toISOString().slice(0, 10); };

export default async function Deposits({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const u = await requirePortalUser();
  const sp = await searchParams;
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15))));
  const m = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : months[0]!;
  const rows = await getDeposits(u, `${m}-01`, lastDay(m));
  const sum = (k: "gross" | "fees" | "chargebacks" | "reserve" | "net") => rows.reduce((a, r) => a + r[k], 0);
  const anyCb = rows.some((r) => r.chargebacks), anyReserve = rows.some((r) => r.reserve);
  const accounts = new Set(rows.map((r) => r.account));

  return (
    <>
      <div className="mp-head">
        <div>
          <h1>Deposits</h1>
          <p>Each deposit is your card sales for a day or a weekend, minus fees. Deposit timing depends on when your batch closes; cutoffs vary by processor.</p>
        </div>
        <div className="acts">
          <a className="mp-btn sec" href={`/portal/deposits/export?m=${m}`} download><Download aria-hidden="true" />Download CSV</a>
        </div>
      </div>

      <nav className="mp-seg" aria-label="Month">
        {months.map((x) => <Link key={x} href={`/portal/deposits?m=${x}`} aria-current={x === m ? "page" : undefined}>{monthName(x).split(" ")[0]}</Link>)}
      </nav>

      {rows.length === 0 ? (
        <div className="mp-empty">
          <h2>No deposits in {monthName(m)}</h2>
          <p>When card sales settle, each deposit shows here with its fees. If you expected one, ask us and we&apos;ll look into it.</p>
          <Link className="mp-btn sec" href="/portal/requests/new?kind=support&subject=Question%20about%20a%20deposit">Ask about a deposit</Link>
        </div>
      ) : (
        <>
          <p className="mp-lede">
            In {monthName(m).split(" ")[0]} you were paid <strong>{fmtUsd(sum("net"))}</strong> across {rows.length} {rows.length === 1 ? "deposit" : "deposits"}
            {" "}to {[...new Set(rows.map((r) => r.bank))].join(" and ")}: <strong>{fmtUsd(sum("gross"))}</strong> in card sales minus <strong>{fmtUsd(sum("fees"))}</strong> in fees
            {sum("gross") ? ` (${((sum("fees") / sum("gross")) * 100).toFixed(1)}%)` : ""}{anyCb ? `, and ${fmtUsd(sum("chargebacks"))} held for disputes` : ""}.
          </p>
          <div className="mp-depwrap">
            <div className="mp-tablewrap">
              <table className="mp-table">
                <caption className="sr">Deposits in {monthName(m)}</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    {accounts.size > 1 && <th scope="col">Account</th>}
                    <th scope="col" className="r">Card sales</th>
                    <th scope="col" className="r">Fees</th>
                    {anyCb && <th scope="col" className="r">Disputes</th>}
                    {anyReserve && <th scope="col" className="r">Held</th>}
                    <th scope="col" className="r">Deposited</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{day(r.date, true)}{r.batches > 1 && <span className="muted"> · {r.batches} days of sales</span>}</td>
                      {accounts.size > 1 && <td className="muted">{r.account}</td>}
                      <td className="r amt">{fmtUsd(r.gross)}</td>
                      <td className="r amt">{r.fees ? `−${fmtUsd(r.fees)}` : fmtUsd(0)}</td>
                      {anyCb && <td className="r amt">{r.chargebacks ? `−${fmtUsd(r.chargebacks)}` : "–"}</td>}
                      {anyReserve && <td className="r amt">{r.reserve ? `−${fmtUsd(r.reserve)}` : "–"}</td>}
                      <td className="r amt"><b>{fmtUsd(r.net)}</b></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={accounts.size > 1 ? 2 : 1}>Total</td>
                    <td className="r amt">{fmtUsd(sum("gross"))}</td>
                    <td className="r amt">−{fmtUsd(sum("fees"))}</td>
                    {anyCb && <td className="r amt">−{fmtUsd(sum("chargebacks"))}</td>}
                    {anyReserve && <td className="r amt">−{fmtUsd(sum("reserve"))}</td>}
                    <td className="r amt">{fmtUsd(sum("net"))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="mp-deplist">
              <ul aria-label={`Deposits in ${monthName(m)}`}>
                {rows.map((r) => (
                  <li key={r.id}>
                    <b>{day(r.date, true)}</b>
                    <span className="amt">{fmtUsd(r.net)}</span>
                    <span className="sub">Sales {fmtUsd(r.gross)} · fees {fmtUsd(r.fees)}{r.chargebacks ? ` · disputes ${fmtUsd(r.chargebacks)}` : ""}{r.reserve ? ` · held ${fmtUsd(r.reserve)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {anyReserve && <p className="sm muted">&ldquo;Held&rdquo; is money set aside on your account. It shows on your Account health and is released under your account terms.</p>}
        </>
      )}
    </>
  );
}
