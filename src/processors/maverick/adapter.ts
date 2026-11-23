/**
 * Maverick implementation of ProcessorAdapter. Field mapping is isolated here; raw payloads are kept on every record
 * so unmapped fields are never lost. Mapping follows the documented examples saved in docs/maverick/.
 */
import { stateCode, US_COUNTRY_ID } from "./states";
import { MaverickClient, type MaverickEnvelope } from "./client";
import type {
  NApplication, NChargeback, NCheck, NMerchant, NPayout, NResidual, NTerminal, NTicket, Page, ProcessorAdapter, TestResult,
} from "../types";
import { ProcessorError } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const yes = (v: unknown) => v === "Yes" || v === true || v === "true";
const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);

function page<T, R>(env: MaverickEnvelope<T>, map: (x: T) => R, current: number): Page<R> {
  return {
    items: (env.items ?? []).map(map),
    page: env._meta?.currentPage ?? current,
    pageCount: env._meta?.pageCount ?? 1,
    totalCount: env._meta?.totalCount ?? env.items?.length ?? 0,
  };
}

const APP_STATUSES = ["New", "Pending", "Underwriting", "Approved", "Declined", "Cancelled"] as const;
const SIG_STATUSES = ["Unsigned", "Partially Signed", "Signed", "Rejected"] as const;
const TICKET_STATUSES = ["New", "In Progress", "On Hold", "Closed"] as const;

export function mapTicketStatus(s: unknown): NTicket["status"] {
  const v = String(s ?? "New");
  if ((TICKET_STATUSES as readonly string[]).includes(v)) return v as NTicket["status"];
  if (/review|progress|open/i.test(v)) return "In Progress";
  if (/hold|wait/i.test(v)) return "On Hold";
  if (/clos|resolv/i.test(v)) return "Closed";
  return "New";
}

export function mapApplication(a: Any): NApplication {
  const status = (APP_STATUSES as readonly string[]).includes(a?.status) ? a.status : "New";
  const sig = (SIG_STATUSES as readonly string[]).includes(a?.signature?.status) ? a.signature.status : "Unsigned";
  return {
    externalId: String(a.id),
    status,
    signatureStatus: sig,
    conditional: yes(a?.conditionallyApproved) || Boolean(a?.conditionallyApproved?.conditions),
    legalName: str(a?.company?.name),
    dbaName: str(a?.dba?.name) ?? str(a?.company?.name),
    dbaExternalId: str(a?.dba?.id),
    mcc: str(typeof a?.mcc === "object" ? a?.mcc?.id : a?.mcc),
    campaign: str(a?.campaign?.name ?? a?.campaign?.id),
    createdAt: str(a?.createdOn),
    updatedAt: str(a?.updatedOn),
    raw: a,
  };
}

export function mapChargeback(c: Any): NChargeback {
  const cards = String(c?.card?.number ?? "");
  const status = ["Processed", "Won", "Lost"].includes(c?.status) ? c.status : "Processed";
  return {
    externalId: String(c.id),
    caseId: String(c?.caseId ?? c?.cases?.[0]?.id ?? c.id),
    dbaExternalId: str(c?.dba?.id),
    amount: num(c?.amount),
    reasonCode: str(c?.reason?.code ?? c?.reasonCode),
    reason: str(c?.reason?.description ?? c?.reason ?? c?.type),
    cardBrand: str(c?.card?.brand),
    cardLast4: cards ? cards.slice(-4) : null,
    receivedAt: day(c?.date?.loaded ?? c?.date?.posted) ?? new Date().toISOString().slice(0, 10),
    respondBy: day(c?.date?.respondBy ?? c?.dueDate),
    status,
    raw: c,
  };
}

export class MaverickAdapter implements ProcessorAdapter {
  readonly processor = "maverick";
  constructor(private client: MaverickClient) {}

  /** Maverick state id → postal code, loaded once per adapter (i.e. per sync run) from its states list. */
  private states = new Map<number, Promise<Map<string, string>>>();
  private statesFor(countryId: number) {
    if (!this.states.has(countryId)) {
      this.states.set(countryId, (async () => {
        const map = new Map<string, string>();
        try {
          for (let p = 1; p <= 10; p++) {
            const env = await this.client.list<Any>(`api/country/${countryId}/states`, p);
            for (const s of env.items ?? []) if (s?.id != null && s?.code) map.set(String(s.id), String(s.code).toUpperCase());
            const pages = Number(env._meta?.pageCount ?? 1);
            if (!env.items?.length || p >= pages) break;
          }
        } catch (err) {
          console.warn(`[maverick] couldn’t load states for country ${countryId}; using the built-in US list`, (err as Error).message);
        }
        return map;
      })());
    }
    return this.states.get(countryId)!;
  }
  private async resolveState(rawState: unknown, rawCountry: unknown) {
    const first = (x: unknown) => (Array.isArray(x) ? x[0] : x && typeof x === "object" ? (x as Any).id : x);
    const st = first(rawState);
    if (st == null || st === "" || !/^\d+$/.test(String(st))) return stateCode(st);
    const country = Number(first(rawCountry)) || US_COUNTRY_ID;
    return stateCode(st, await this.statesFor(country));
  }

  async testConnection(): Promise<TestResult> {
    try {
      const env = await this.client.list<Any>("api/dba", 1, 1);
      return { ok: true, message: `Connected. ${env._meta?.totalCount ?? env.items?.length ?? 0} DBA records visible to this token.` };
    } catch (err) {
      const e = err as ProcessorError;
      const hint = e.status === 401 || e.status === 403
        ? " Check the token and that it has Platforms access."
        : e.status === 404 ? " Check the base URL (e.g. https://sandbox-dashboard.maverickpayments.com)." : "";
      return { ok: false, message: e.message + hint, status: e.status, detail: e.body };
    }
  }

  async listMerchants(p: number): Promise<Page<NMerchant>> {
    const env = await this.client.list<Any>("api/merchant", p);
    // One Maverick merchant (legal entity) can own several DBAs; flatten to one NMerchant per DBA.
    const flat: NMerchant[] = [];
    for (const m of env.items ?? []) {
      for (const d of (m.dbas ?? [])) {
        const proc = d.processing ?? {};
        flat.push({
          externalId: String(d.id),
          merchantExternalId: str(m.id),
          legalName: String(m.name ?? d.name ?? "Unknown"),
          dbaName: String(d.name ?? m.name ?? "Unknown"),
          ein: str(m.federalTaxId ?? m.company?.federalTaxId),
          mcc: str(d.mcc),
          address: { street: str(d.address?.street), city: str(d.address?.city), state: await this.resolveState(d.address?.state, d.address?.country), zip: str(d.address?.zip) },
          csPhone: str(d.customerServiceContact?.phone),
          csEmail: str(d.customerServiceContact?.email),
          website: str(d.website),
          principals: (m.principals ?? []).map((pr: Any) => ({
            firstName: String(pr.name?.first ?? ""), lastName: String(pr.name?.last ?? ""),
            ownershipPct: pr.ownershipPercentage ?? null, isSigner: yes(pr.isSigner), isGuarantor: yes(pr.isPersonalGuarantee),
            email: str(pr.email), phone: str(pr.phone), title: str(pr.title),
          })),
          accounts: proc?.mid ? [{
            externalId: str(proc.id), mid: String(proc.mid), processingMethod: "Acquiring", status: String(proc.status ?? "Approved"),
            riskLevel: str(proc.riskLevel), bankAccount: str(proc.bank?.accountNumber ?? proc.banks?.[0]?.bankAccountNumber),
            routing: str(proc.bank?.routingNumber ?? proc.banks?.[0]?.bankRoutingNumber), openedAt: day(proc.boardedOn), closedAt: day(proc.closedOn),
          }] : [],
          raw: { merchant: { ...m, dbas: undefined }, dba: d },
        });
      }
    }
    return { ...page(env, (x) => x, p), items: flat };
  }

  async listTerminals(p: number): Promise<Page<NTerminal>> {
    const env = await this.client.list<Any>("api/terminals", p);
    return page(env, (t: Any) => ({
      externalId: String(t.id), dbaExternalId: String(t.dba?.id ?? ""), tid: String(t.tid ?? t.id), name: str(t.name),
      model: str(t.equipment?.equipmentType ?? t.vNumber), status: t.deletedOn ? "Deleted" : "Active", raw: t,
    }), p);
  }

  async listApplications(p: number): Promise<Page<NApplication>> {
    return page(await this.client.list<Any>("api/boarding-application", p), mapApplication, p);
  }

  async getApplicationChecks(id: string): Promise<NCheck[]> {
    const c = await this.client.request<Any>("GET", `api/boarding-application/${encodeURIComponent(id)}/checks`);
    const out: NCheck[] = [];
    const walk = (label: string, v: Any) => {
      if (v && typeof v === "object" && "pass" in v) {
        out.push({ name: label, status: v.pass === true ? "Passed" : v.pass === false ? "Failed" : "Pending", detail: typeof v.actionRequired === "string" ? v.actionRequired : null });
      } else if (Array.isArray(v)) {
        v.forEach((x, i) => walk(v.length > 1 ? `${label} ${i + 1}` : label, x));
      } else if (v && typeof v === "object") {
        for (const [k, vv] of Object.entries(v)) if (k !== "RequiredDocuments") walk(label ? `${label} · ${k}` : k, vv);
      }
    };
    walk("", c);
    return out;
  }

  /**
   * Maverick ticket category id → name, loaded once per adapter (i.e. per sync run) from GET /api/ticket/categories.
   * Tickets carry only the id. The live response is an object of lists, one per parent category plus "root" for
   * the parents themselves (the API docs show one flat list; both are read). Two categories can share a name
   * ("Chargebacks" sits under Merchant Support and under Risk), so those get their parent appended:
   * "Chargebacks (Risk)".
   */
  private ticketCategories?: Promise<Map<string, string>>;
  private categoryNames() {
    this.ticketCategories ??= (async () => {
      const map = new Map<string, string>();
      try {
        const res = await this.client.request<Any>("GET", "api/ticket/categories");
        const lists: Any[] = Array.isArray(res) ? [res] : Array.isArray(res?.items) ? [res.items] : Object.values(res ?? {}).filter(Array.isArray);
        const rows: Any[] = lists.flat().filter((c: Any) => c?.id != null && str(c?.name)?.trim());
        const uses = new Map<string, number>();
        for (const c of rows) uses.set(String(c.name).trim(), (uses.get(String(c.name).trim()) ?? 0) + 1);
        for (const c of rows) {
          const name = String(c.name).trim(), within = str(c.parent?.name)?.trim() || str(c.group)?.trim();
          map.set(String(c.id), (uses.get(name) ?? 0) > 1 && within ? `${name} (${within})` : name);
        }
      } catch (err) {
        console.warn("[maverick] couldn’t load ticket categories; keeping category ids", (err as Error).message);
      }
      if (!map.size) console.warn("[maverick] the ticket category list came back empty; keeping category ids");
      return map;
    })();
    return this.ticketCategories;
  }

  async listTickets(p: number): Promise<Page<NTicket>> {
    const names = await this.categoryNames();
    return page(await this.client.list<Any>("api/tickets", p), (t: Any) => ({
      externalId: String(t.id), dbaExternalId: str(t.dba?.id), subject: String(t.title ?? t.subject ?? "Ticket"), text: str(t.text),
      status: mapTicketStatus(t.status), category: str(t.category?.name) ?? names.get(String(t.category?.id)) ?? str(t.category?.id), createdAt: str(t.createdOn), raw: t,
    }), p);
  }

  async listChargebacks(p: number): Promise<Page<NChargeback>> {
    return page(await this.client.list<Any>("api/reporting/chargebacks", p), mapChargeback, p);
  }

  async listResiduals(p: number): Promise<Page<NResidual>> {
    return page(await this.client.list<Any>("api/residual", p), (r: Any) => {
      const adj = r.adjustment ?? {};
      return {
        externalId: String(r.id), mid: String(r.mid), period: String(r.date).slice(0, 7) + "-01",
        salesCount: num(r.merchant?.sales?.count), salesAmount: num(r.merchant?.sales?.amount),
        revenue: num(r.revenue), expense: num(r.expense), splitPct: num(r.split), adjustment: num(adj.amount),
        adjustmentNote: (adj.details ?? []).map((d: Any) => d.note).filter(Boolean).join("; ") || null,
        profit: num(r.profit), held: r.held?.on && !r.held?.releasedOn ? num(r.profit) : 0, heldNote: str(r.held?.note),
        publishedAt: str(r.publishedOn), raw: r,
      };
    }, p);
  }

  async listPayouts(dbaId: string, from: string, to: string): Promise<NPayout[]> {
    const env = await this.client.request<MaverickEnvelope<Any>>("GET", `api/reporting/payouts/acq/${encodeURIComponent(dbaId)}`, {
      query: { "filter[processingDate][gte]": from, "filter[processingDate][lte]": to, "per-page": 50 },
    });
    return (env.items ?? []).map((x: Any) => {
      const net = num(x.deposit), fees = num(x.feeTotalAmount), cb = num(x.chargeback?.totalAmount), reserve = num(x.reservedAmount) - num(x.releasedAmount);
      return { dbaExternalId: dbaId, depositDate: String(x.processingDate), gross: +(net + fees + cb + reserve).toFixed(2), fees, chargebacks: cb, reserve, net, batches: Array.isArray(x.batches) ? x.batches.length : 1 };
    });
  }

  async createTicket(input: { dbaExternalId: string; subject: string; text: string; notifyMerchant: boolean }) {
    const r = await this.client.request<Any>("POST", "api/ticket", {
      form: { "dba[id]": input.dbaExternalId, title: input.subject, text: input.text, notifyMerchant: input.notifyMerchant ? "Yes" : "No" },
    });
    if (!r?.id) throw new ProcessorError("Maverick did not return a ticket id");
    return { externalId: String(r.id) };
  }

  async addTicketResponse(ticketId: string, text: string) {
    await this.client.request("POST", `api/ticket/${encodeURIComponent(ticketId)}/response`, { form: { text } });
  }

  async requestSignature(appId: string) {
    await this.client.request("PUT", `api/boarding-application/${encodeURIComponent(appId)}/request-signature`);
  }

  async getApplicationUrl(appId: string) {
    const r = await this.client.request<Any>("GET", `api/boarding-application/${encodeURIComponent(appId)}/url`);
    return str(r?.url ?? r);
  }

  async submitToUnderwriting(appId: string) {
    await this.client.request("PUT", `api/boarding-application/${encodeURIComponent(appId)}/status/Underwriting`);
  }

  async acceptChargeback(cbId: string, caseId: string) {
    await this.client.request("POST", `api/reporting/chargeback/${encodeURIComponent(cbId)}/dispute/${encodeURIComponent(caseId)}/accept`);
  }
}
