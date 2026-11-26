import { getPortalUser } from "@/lib/portal/dal";
import { getDeposits } from "@/lib/portal/data";
import { audit } from "@/lib/audit";
import { requestIp } from "@/lib/session";
import { toCsv } from "@/lib/format";

/** The signed-in merchant's own deposits for one month, as CSV. Nothing here takes a merchant id from the request. */
export async function GET(req: Request) {
  const u = await getPortalUser();
  if (!u) return new Response("Please sign in again.", { status: 401 });
  const m = new URL(req.url).searchParams.get("m") ?? "";
  if (!/^\d{4}-\d{2}$/.test(m)) return new Response("Choose a month.", { status: 400 });
  const [y, mo] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y!, mo!, 0)).toISOString().slice(0, 10);
  const rows = await getDeposits(u, `${m}-01`, last);
  const csv = toCsv(
    ["Date", "Deposited to", "Account", "Batches", "Card sales", "Fees", "Disputes", "Held", "Deposited"],
    rows.map((r) => [r.date, r.bank, r.account, r.batches, r.gross.toFixed(2), r.fees.toFixed(2), r.chargebacks.toFixed(2), r.reserve.toFixed(2), r.net.toFixed(2)]),
  );
  await audit({ email: `portal:${u.email}`, ip: await requestIp() }, "portal.export.deposits", "merchant", u.merchantId, { month: m, rows: rows.length });
  const name = `${u.dbaName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "deposits"}-deposits-${m}.csv`;
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
}
