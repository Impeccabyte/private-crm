/**
 * Workspace settings live in Postgres (table `settings`), are edited in Settings → General / Email / Security,
 * and take effect on the next request — no rebuild or restart. The worker reads them per job.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptOrNull, encrypt } from "./crypto";

export type GeneralSettings = {
  companyName: string;
  accentColor: string;
  timezone: string;
  stuckApplicationDays: number;
  chargebackUrgentDays: number;
  ticketFirstResponseMinutes: number;
  ticketSlaWarnMinutes: number;
  staleLeadDays: number;
};

export type SecuritySettings = {
  sessionHours: number;
  rememberMeDays: number;
  lockoutAttempts: number;
  lockoutMinutes: number;
  passwordMinLength: number;
  resetTokenMinutes: number;
  inviteTokenHours: number;
};

export type EmailSettings = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordEnc: string | null;
  fromAddress: string;
  fromName: string;
};

export type SsoSettings = {
  enabled: boolean;
  providerName: string;
  issuerUrl: string;
  clientId: string;
  clientSecretEnc: string | null;
  allowedDomains: string;
  autoProvision: boolean;
  defaultRole: "agent" | "onboarding" | "support" | "manager";
  allowPasswordLogin: boolean;
};

export type TemplateSettings = { templates: { id: string; name: string; body: string }[] };

export type SettingsMap = {
  general: GeneralSettings;
  security: SecuritySettings;
  email: EmailSettings;
  sso: SsoSettings;
  templates: TemplateSettings;
};

export const DEFAULTS: SettingsMap = {
  general: {
    companyName: "Impeccabyte",
    accentColor: "#5B5BD6",
    timezone: "America/New_York",
    stuckApplicationDays: 5,
    chargebackUrgentDays: 3,
    ticketFirstResponseMinutes: 60,
    ticketSlaWarnMinutes: 45,
    staleLeadDays: 3,
  },
  security: {
    sessionHours: 12,
    rememberMeDays: 7,
    lockoutAttempts: 5,
    lockoutMinutes: 15,
    passwordMinLength: 10,
    resetTokenMinutes: 30,
    inviteTokenHours: 72,
  },
  email: {
    enabled: true,
    host: process.env.SMTP_DEFAULT_HOST ?? "localhost",
    port: Number(process.env.SMTP_DEFAULT_PORT ?? 1025),
    secure: false,
    username: "",
    passwordEnc: null,
    fromAddress: "crm@impeccabyte.example",
    fromName: "Impeccabyte CRM",
  },
  sso: {
    enabled: false,
    providerName: "Google Workspace",
    issuerUrl: "",
    clientId: "",
    clientSecretEnc: null,
    allowedDomains: "",
    autoProvision: false,
    defaultRole: "agent",
    allowPasswordLogin: true,
  },
  templates: {
    templates: [
      { id: "missing-docs", name: "Application missing documents", body: "Hi {{contact}},\n\nThanks for your application. To keep it moving we still need:\n\n• {{items}}\n\nYou can upload them from your completion link. Reply here if you have questions." },
      { id: "conditional", name: "Conditional approval conditions", body: "Hi {{contact}},\n\nGood news: your account is approved with a few conditions. Please send:\n\n• {{items}}\n\nOnce these are in, your account will be fully active." },
      { id: "chargeback", name: "Chargeback received", body: "Hi {{contact}},\n\nWe received a chargeback on your account. To dispute it we need the receipt, any signed work order and proof of delivery by {{date}}." },
    ],
  },
};

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) });
  return { ...DEFAULTS[key], ...((row?.value as Partial<SettingsMap[K]>) ?? {}) };
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: Partial<SettingsMap[K]>, userId?: string) {
  const current = await getSetting(key);
  const next = { ...current, ...value };
  await db.insert(schema.settings).values({ key, value: next, updatedBy: userId ?? null })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: next, updatedBy: userId ?? null, updatedAt: new Date() } });
  return next;
}

/** Secret helpers: secrets are write-only in the UI. Empty input keeps the stored value. */
export function nextSecret(input: string | null | undefined, existingEnc: string | null): string | null {
  if (input === undefined || input === null || input === "") return existingEnc;
  if (input === "__clear__") return null;
  return encrypt(input);
}

export const readSecret = decryptOrNull;
