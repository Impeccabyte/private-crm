/**
 * Lead form definitions. Pure and isomorphic: used by the builder (client), the public form page,
 * and the submit endpoint, so validation and rendering never drift apart.
 */
import { z } from "zod";

export const FIELD_TYPES = ["text", "email", "phone", "textarea", "select", "number", "url", "checkbox", "file"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Short text", email: "Email", phone: "Phone", textarea: "Long text", select: "Dropdown", number: "Number", url: "Website", checkbox: "Checkbox", file: "File upload",
};

/** Lead columns a field can fill. "notes" goes into the lead's first activity; "none" is kept with the submission only. */
export const MAP_TARGETS = ["none", "businessName", "contactName", "email", "phone", "website", "industry", "estMonthlyVolume", "currentProcessor", "notes"] as const;
export type MapTarget = (typeof MAP_TARGETS)[number];

export const MAP_LABEL: Record<MapTarget, string> = {
  none: "Don’t map (keep with submission)", businessName: "Lead · Business name", contactName: "Lead · Contact name", email: "Lead · Email",
  phone: "Lead · Phone", website: "Lead · Website", industry: "Lead · Industry", estMonthlyVolume: "Lead · Est. monthly volume",
  currentProcessor: "Lead · Current processor", notes: "Lead · Notes",
};

export type FormField = {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  help?: string;
  required: boolean;
  options?: string[];
  mapTo: MapTarget;
  width: "full" | "half";
  /** File upload only: how many files a visitor can attach (1–10). Files are stored on the lead, never mapped. */
  maxFiles?: number;
};

export const BUTTON_RADII = ["square", "rounded", "extra", "pill"] as const;
export type ButtonRadius = (typeof BUTTON_RADII)[number];
export const BUTTON_RADIUS_LABEL: Record<ButtonRadius, string> = { square: "Square", rounded: "Rounded", extra: "Extra rounded", pill: "Pill" };

export const BUTTON_FILLS = ["solid", "outline"] as const;
export type ButtonFill = (typeof BUTTON_FILLS)[number];
export const BUTTON_FILL_LABEL: Record<ButtonFill, string> = { solid: "Solid", outline: "Outline" };

export const BUTTON_SIZES = ["small", "medium", "large"] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];
export const BUTTON_SIZE_LABEL: Record<ButtonSize, string> = { small: "Small", medium: "Medium", large: "Large" };

export const BUTTON_WIDTHS = ["auto", "full"] as const;
export type ButtonWidth = (typeof BUTTON_WIDTHS)[number];
export const BUTTON_WIDTH_LABEL: Record<ButtonWidth, string> = { auto: "Fit the label", full: "Full width" };

export type FormSettings = {
  title: string;
  intro: string;
  submitLabel: string;
  successTitle: string;
  successMessage: string;
  /** Optional https URL to send the visitor to after submitting (the embedding page navigates). */
  redirectUrl: string;
  /** Lead owner for new submissions; empty = unassigned. */
  ownerId: string;
  /** Comma-separated emails notified on each submission. */
  notifyEmails: string;
  /** Comma-separated domains allowed to embed this form; empty = any site. */
  allowedDomains: string;
  /** Optional consent checkbox text; when set, it's required. */
  consentText: string;
  accentColor: string;
  /** Submit button look. The defaults match the original button, so forms saved before these existed don't change. */
  buttonRadius: ButtonRadius;
  buttonFill: ButtonFill;
  buttonSize: ButtonSize;
  buttonWidth: ButtonWidth;
  theme: "light" | "dark";
};

export const DEFAULT_SETTINGS: FormSettings = {
  title: "Talk to our payments team",
  intro: "Tell us a little about your business and we’ll get back to you within one business day.",
  submitLabel: "Send",
  successTitle: "Thanks, we’ve got it",
  successMessage: "Someone from our team will reach out shortly.",
  redirectUrl: "",
  ownerId: "",
  notifyEmails: "",
  allowedDomains: "",
  consentText: "",
  accentColor: "",
  buttonRadius: "rounded",
  buttonFill: "solid",
  buttonSize: "medium",
  buttonWidth: "auto",
  theme: "light",
};

export const newFieldId = () => Math.random().toString(36).slice(2, 10);

export function starterFields(): FormField[] {
  return [
    { id: newFieldId(), type: "text", label: "Business name", required: true, mapTo: "businessName", width: "full" },
    { id: newFieldId(), type: "text", label: "Your name", required: true, mapTo: "contactName", width: "half" },
    { id: newFieldId(), type: "phone", label: "Phone", required: false, mapTo: "phone", width: "half" },
    { id: newFieldId(), type: "email", label: "Work email", required: true, mapTo: "email", width: "full" },
    { id: newFieldId(), type: "select", label: "Monthly card volume", required: false, mapTo: "estMonthlyVolume", width: "full",
      options: ["Under $10,000", "$10,000 – $50,000", "$50,000 – $100,000", "Over $100,000"] },
    { id: newFieldId(), type: "textarea", label: "Anything else we should know?", required: false, mapTo: "notes", width: "full" },
  ];
}

export function blankField(type: FieldType): FormField {
  if (type === "file") return { id: newFieldId(), type, label: "Recent merchant statements", help: "Your last three months, if you have them. Optional.", required: false, mapTo: "none", width: "full", maxFiles: 3 };
  const label = { text: "Question", email: "Email", phone: "Phone", textarea: "Message", select: "Choose one", number: "Number", url: "Website", checkbox: "I agree" }[type];
  const mapTo: MapTarget = type === "email" ? "email" : type === "phone" ? "phone" : type === "url" ? "website" : "none";
  return { id: newFieldId(), type, label, required: false, mapTo, width: "full", ...(type === "select" ? { options: ["Option 1", "Option 2"] } : {}) };
}

// ── Definition validation (builder save / publish) ───────────────────────────
const fieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{4,16}$/),
  type: z.enum(FIELD_TYPES),
  label: z.string().trim().min(1, "Every field needs a label").max(200),
  placeholder: z.string().max(200).optional(),
  help: z.string().max(400).optional(),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  mapTo: z.enum(MAP_TARGETS),
  width: z.enum(["full", "half"]),
  maxFiles: z.number().int().min(1).max(10).optional(),
}).transform((f) => (f.type === "file" ? { ...f, mapTo: "none" as const, width: "full" as const, maxFiles: f.maxFiles ?? 3 } : f));

const emailList = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean).every((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
const domainList = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean).every((x) => /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(x) || /^localhost(:\d+)?$/.test(x));

export const settingsSchema = z.object({
  title: z.string().max(200),
  intro: z.string().max(1000),
  submitLabel: z.string().trim().min(1, "Add a button label").max(60),
  successTitle: z.string().max(200),
  successMessage: z.string().max(1000),
  redirectUrl: z.string().refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Redirect must be an https:// URL"),
  ownerId: z.string(),
  notifyEmails: z.string().refine(emailList, "Use comma-separated email addresses"),
  allowedDomains: z.string().refine(domainList, "Use comma-separated domains, e.g. example.com, *.example.com"),
  consentText: z.string().max(500),
  accentColor: z.string().refine((v) => v === "" || /^#[0-9a-f]{6}$/i.test(v), "Use a hex color like #5B5BD6"),
  buttonRadius: z.enum(BUTTON_RADII),
  buttonFill: z.enum(BUTTON_FILLS),
  buttonSize: z.enum(BUTTON_SIZES),
  buttonWidth: z.enum(BUTTON_WIDTHS),
  theme: z.enum(["light", "dark"]),
});

/** Problems that block publishing (a draft can be saved with them). */
export function publishProblems(fields: FormField[]): string[] {
  const p: string[] = [];
  if (!fields.length) p.push("Add at least one field.");
  if (!fields.some((f) => f.mapTo === "email" || f.mapTo === "phone")) p.push("Map a field to Lead · Email or Lead · Phone so you can follow up.");
  for (const t of ["businessName", "contactName", "email", "phone", "website", "estMonthlyVolume"] as const) {
    if (fields.filter((f) => f.mapTo === t).length > 1) p.push(`Only one field can map to ${MAP_LABEL[t]}.`);
  }
  for (const f of fields) if (f.type === "select" && !(f.options?.length)) p.push(`“${f.label}” needs at least one option.`);
  return p;
}

export const fieldsSchema = z.array(fieldSchema).max(40, "Keep forms to 40 fields or fewer");

// ── Submission validation (public endpoint) ──────────────────────────────────
export function validateSubmission(fields: FormField[], settings: FormSettings, input: Record<string, string>) {
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  for (const f of fields) {
    if (f.type === "file") continue; // files are checked by the submit endpoint (validateFiles)
    const raw = (input[`f_${f.id}`] ?? "").toString().trim().slice(0, f.type === "textarea" ? 5000 : 500);
    const v = f.type === "checkbox" ? (raw ? "Yes" : "") : raw;
    if (f.required && !v) { errors[f.id] = f.type === "checkbox" ? "Please tick this box." : "This field is required."; continue; }
    if (!v) continue;
    if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors[f.id] = "Enter a valid email address.";
    else if (f.type === "phone" && v.replace(/\D/g, "").length < 7) errors[f.id] = "Enter a valid phone number.";
    else if (f.type === "number" && Number.isNaN(Number(v.replace(/[$,\s]/g, "")))) errors[f.id] = "Enter a number.";
    else if (f.type === "url" && !/^(https?:\/\/)?[^\s.]+\.[^\s]+$/i.test(v)) errors[f.id] = "Enter a website address.";
    else if (f.type === "select" && !(f.options ?? []).includes(v)) errors[f.id] = "Choose one of the options.";
    values[f.id] = v;
  }
  if (settings.consentText && !input.consent) errors.consent = "Please confirm to continue.";
  return { errors, values };
}

/** "$10,000 – $50,000" → 10000 (lower bound); "75k" → 75000; plain numbers pass through. */
export function parseVolume(v: string): number | null {
  const m = v.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k|m)?/i);
  if (!m) return null;
  const n = Number(m[1]) * (m[2]?.toLowerCase() === "k" ? 1_000 : m[2]?.toLowerCase() === "m" ? 1_000_000 : 1);
  return Number.isFinite(n) ? n : null;
}
