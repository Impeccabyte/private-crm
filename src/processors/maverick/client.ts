/**
 * Minimal Maverick Platforms API client (docs: developers.maverickpayments.com, Postman collection 22118029/2sA3Bhdu3N).
 * - Bearer token auth, HTTPS only, form-encoded request bodies, JSON responses.
 * - List envelope: { items, _meta: { totalCount, pageCount, currentPage, perPage }, _links }.
 * - `page` / `per-page`, max 50 per page.
 * Rate limits and retries are undocumented, so we back off on 429/5xx and keep requests sequential.
 */
import { ProcessorError } from "../types";

export type MaverickEnvelope<T> = {
  items?: T[];
  _meta?: { totalCount?: number; pageCount?: number; currentPage?: number; perPage?: number };
};

export class MaverickClient {
  constructor(private baseUrl: string, private token: string, private timeoutMs = 20000) {
    if (!/^https:\/\//.test(baseUrl)) throw new ProcessorError("The Maverick base URL must start with https://");
  }

  private url(path: string, query?: Record<string, string | number | undefined>) {
    const u = new URL(path.replace(/^\//, ""), this.baseUrl.endsWith("/") ? this.baseUrl : this.baseUrl + "/");
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) u.searchParams.set(k, String(v));
    return u.toString();
  }

  async request<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, opts: { query?: Record<string, string | number | undefined>; form?: Record<string, string | number | boolean | undefined> } = {}): Promise<T> {
    const body = opts.form
      ? new URLSearchParams(Object.entries(opts.form).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()
      : undefined;
    let attempt = 0;
    while (true) {
      attempt++;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      let res: Response;
      try {
        res = await fetch(this.url(path, opts.query), {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          },
          body,
          signal: ctrl.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (attempt < 3) { await sleep(500 * attempt); continue; }
        throw new ProcessorError(`Could not reach Maverick: ${(err as Error).message}`);
      }
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        const retryAfter = Number(res.headers.get("retry-after")) || attempt * 1.5;
        await sleep(retryAfter * 1000);
        continue;
      }
      const text = await res.text();
      if (!res.ok) {
        let message = `Maverick returned HTTP ${res.status}`;
        try { const j = JSON.parse(text); if (j?.message) message += `: ${j.message}`; } catch { /* not json */ }
        throw new ProcessorError(message, res.status, text.slice(0, 2000));
      }
      if (!text) return undefined as T;
      try { return JSON.parse(text) as T; } catch { throw new ProcessorError("Maverick returned a non-JSON response", res.status, text.slice(0, 2000)); }
    }
  }

  list<T>(path: string, page: number, perPage = 50, query: Record<string, string | number | undefined> = {}) {
    return this.request<MaverickEnvelope<T>>("GET", path, { query: { ...query, page, "per-page": Math.min(perPage, 50) } });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
