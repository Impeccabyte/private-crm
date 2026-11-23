/**
 * Processor connections are stored in Postgres and edited in Settings → Integrations.
 * Secrets (API token, webhook secret) are encrypted at rest and write-only in the UI.
 * Every job reads the connection fresh, so edits apply without a restart.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptOrNull, randomToken } from "./crypto";
import { MaverickClient } from "@/processors/maverick/client";
import { MaverickAdapter } from "@/processors/maverick/adapter";
import type { ProcessorAdapter } from "@/processors/types";
import { ProcessorError } from "@/processors/types";

export type Connection = typeof schema.processorConnections.$inferSelect;

export type ConnectionConfig = {
  syncMerchants: boolean;
  syncApplications: boolean;
  syncTickets: boolean;
  syncChargebacks: boolean;
  syncResiduals: boolean;
  syncPayouts: boolean;
  nightlySyncHourUtc: number;
  payoutLookbackDays: number;
  /** Reject webhooks whose `date` is older than this (0 = off). Maverick documents no retry policy. */
  maxEventAgeHours: number;
  /** Require explicit confirmation in the UI before writes to the processor. Always on for production. */
  confirmWrites: boolean;
};

export const DEFAULT_CONFIG: ConnectionConfig = {
  syncMerchants: true,
  syncApplications: true,
  syncTickets: true,
  syncChargebacks: true,
  syncResiduals: true,
  syncPayouts: true,
  nightlySyncHourUtc: 7,
  payoutLookbackDays: 30,
  maxEventAgeHours: 168,
  confirmWrites: true,
};

export const MAVERICK_HOSTS = {
  sandbox: "https://sandbox-dashboard.maverickpayments.com",
  production: "https://dashboard.maverickpayments.com",
} as const;

export function configOf(c: Connection): ConnectionConfig {
  return { ...DEFAULT_CONFIG, ...((c.config as Partial<ConnectionConfig>) ?? {}) };
}

export const newWebhookPath = () => randomToken(18);

export async function getConnection(id: string): Promise<Connection | undefined> {
  return db.query.processorConnections.findFirst({ where: eq(schema.processorConnections.id, id) });
}

export function adapterFor(c: Connection): ProcessorAdapter {
  const token = decryptOrNull(c.tokenEnc);
  if (!token) throw new ProcessorError("No API token is saved for this connection.");
  const base = c.dashboardBaseUrl || MAVERICK_HOSTS[c.mode];
  return new MaverickAdapter(new MaverickClient(base, token));
}

export function webhookUrl(c: Pick<Connection, "webhookPath">) {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/webhooks/maverick/${c.webhookPath}`;
}
