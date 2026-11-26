import Link from "next/link";
import type { Metadata } from "next";
import { requirePortalUser } from "@/lib/portal/dal";
import { fmtUsd, getDailySales, getMonthly } from "@/lib/portal/data";
import { day, monthName } from "../../ui";

export const metadata: Metadata = { title: "Reports" };

const RANGES = { "30": 30, "90": 90 } as const;

export default async function Reports({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const u = await requirePortalUser();
  const sp = await searchParams;
  const r = (sp.r === "90" ? "90" : "30") as keyof typeof RANGES;
  const days = RANGES[r];
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [daily, monthly] = await Promise.all([getDailySales(u, iso(from), iso(to)), getMonthly(u, 12)]);

  // Fill every day in the range so gaps read as zero, not as missing bars.
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const series = Array.from({ length: days }, (_, i) => {
    const d = iso(new Date(from.getTime() + i * 86_400_000));
    const x = byDay.get(d);
    return { day: d, amount: x?.amount ?? 0, count: x?.count ?? 0 };
  });
  const max = Math.max(1, ...series.map((s) => s.amount));
  const total = series.reduce((a, s) => a + s.amount, 0);
  const count = series.reduce((a, s) => a + s.count, 0);
  const best = series.reduce((a, s) => (s.amount > a.amount ? s : a), series[0]!);
  const weekendShare = total ? series.filter((s) => [0, 6].includes(new Date(`${s.day}T12:00:00Z`).getUTCDay())).reduce((a, s) => a + s.amount, 0) / total : 0;
  const shown = monthly.filter((m, i) => i === 0 || m.sales || m.deposited);
  const year = monthly.reduce((a, m) => ({ sales: a.sales + m.sales, fees: a.fees + m.fees, deposited: a.deposited + m.deposited, disputes: a.disputes + m.disputes, count: a.count + m.count }), { sales: 0, fees: 0, deposited: 0, disputes: 0, count: 0 });

  return (
    <>
      <div className="mp-head">
        <div>
          <h1>Reports</h1>
          <p>How your sales are moving, and what processing cost you each month.</p>
        </div>
        <nav className="mp-seg" aria-label="Date range">
          <Link href="/reports?r=30" aria-current={r === "30" ? "page" : undefined}>Last 30 days</Link>
          <Link href="/reports?r=90" aria-current={r === "90" ? "page" : undefined}>Last 90 days</Link>
        </nav>
      </div>

      <section className="mp-card" aria-labelledby="daily-h">
        <div className="mp-head" style={{ alignItems: "baseline" }}>
          <h2 id="daily-h">Card sales by day</h2>
          <p className="sm muted" style={{ margin: 0 }}>{day(series[0]!.day)} to {day(series[series.length - 1]!.day)}</p>
        </div>
        {total === 0 ? (
          <p className="mp-callout" style={{ marginTop: 16 }}>No card sales in this range yet. Sales show here the day after they settle.</p>
        ) : (
          <>
            <p className="mp-lede" style={{ margin: "12px 0 20px" }}>
              <strong>{fmtUsd(total)}</strong> in card sales from {count.toLocaleString("en-US")} payments, an average of <strong>{count ? fmtUsd(total / count) : "–"}</strong> each.
              Your best day was {day(best.day, true)} at <strong>{fmtUsd(best.amount)}</strong>, and weekends brought in {Math.round(weekendShare * 100)}% of the total.
            </p>
            <div className="mp-bars" role="img" aria-label={`Daily card sales from ${day(series[0]!.day)} to ${day(series[series.length - 1]!.day)}. Highest ${fmtUsd(best.amount)} on ${day(best.day, true)}. Weekends are ${Math.round(weekendShare * 100)}% of sales.`}>
              {series.map((s) => {
                const wk = [0, 6].includes(new Date(`${s.day}T12:00:00Z`).getUTCDay());
                return <span key={s.day} className={wk ? "wk" : ""} style={{ height: `${Math.max(1, (s.amount / max) * 100)}%` }} title={`${day(s.day, true)}: ${fmtUsd(s.amount)}, ${s.count} payments`} />;
              })}
            </div>
            <div className="mp-axis" aria-hidden="true"><span>{day(series[0]!.day)}</span><span>{day(series[Math.floor(series.length / 2)]!.day)}</span><span>{day(series[series.length - 1]!.day)}</span></div>
            <p className="sm muted" style={{ marginTop: 10 }}>Darker bars are weekends.</p>
          </>
        )}
      </section>

      <section aria-labelledby="monthly-h" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 id="monthly-h">Month by month</h2>
        <div className="mp-tablewrap">
          <table className="mp-table">
            <caption className="sr">Card sales, fees, deposits and disputes by month for the last 12 months</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className="r">Card sales</th>
                <th scope="col" className="r">Payments</th>
                <th scope="col" className="r">Fees</th>
                <th scope="col" className="r">Fees as % of sales</th>
                <th scope="col" className="r">Deposited</th>
                <th scope="col" className="r">Disputes</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m, i) => (
                <tr key={m.month}>
                  <th scope="row" style={{ fontWeight: 500, textAlign: "left" }}>{monthName(m.month)}{i === 0 && <span className="muted"> (so far)</span>}</th>
                  <td className="r amt">{fmtUsd(m.sales)}</td>
                  <td className="r amt">{m.count.toLocaleString("en-US")}</td>
                  <td className="r amt">{fmtUsd(m.fees)}</td>
                  <td className="r amt">{m.sales ? `${((m.fees / m.sales) * 100).toFixed(2)}%` : "–"}</td>
                  <td className="r amt">{fmtUsd(m.deposited)}</td>
                  <td className="r amt">{m.disputes || "–"}</td>
                </tr>
              ))}
            </tbody>
            {shown.length > 1 && (
              <tfoot>
                <tr>
                  <td>Last 12 months</td>
                  <td className="r amt">{fmtUsd(year.sales)}</td>
                  <td className="r amt">{year.count.toLocaleString("en-US")}</td>
                  <td className="r amt">{fmtUsd(year.fees)}</td>
                  <td className="r amt">{year.sales ? `${((year.fees / year.sales) * 100).toFixed(2)}%` : "–"}</td>
                  <td className="r amt">{fmtUsd(year.deposited)}</td>
                  <td className="r amt">{year.disputes || "–"}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="sm muted">Fees here are everything taken out of your deposits for processing. For the line-by-line breakdown, ask us for your processing statement and we&apos;ll walk you through it.</p>
      </section>
    </>
  );
}
