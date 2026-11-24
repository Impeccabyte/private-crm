/**
 * Newsletter definitions. Pure and isomorphic: used by the builder (client), the preview and the send job,
 * so what you design is exactly what gets sent.
 */
import { z } from "zod";
import { safeHref, sanitizeRich } from "./sanitize";

export const BLOCK_TYPES = ["heading", "text", "image", "button", "columns", "divider", "spacer", "social"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_LABEL: Record<BlockType, string> = {
  heading: "Heading", text: "Text", image: "Image", button: "Button", columns: "Two columns", divider: "Divider", spacer: "Spacer", social: "Social links",
};
export const BLOCK_HINT: Record<BlockType, string> = {
  heading: "A title or section heading", text: "A paragraph, list or links", image: "A picture, optionally linked", button: "A call-to-action link",
  columns: "Two side-by-side cells", divider: "A thin line", spacer: "Empty space", social: "Links to your profiles",
};

export const ALIGNS = ["left", "center", "right"] as const;
export type Align = (typeof ALIGNS)[number];

export const SOCIAL_NETWORKS = ["website", "facebook", "instagram", "linkedin", "x", "youtube"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
export const SOCIAL_LABEL: Record<SocialNetwork, string> = { website: "Website", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", x: "X", youtube: "YouTube" };

export const BUTTON_RADII = ["square", "rounded", "pill"] as const;
export const BUTTON_FILLS = ["solid", "outline"] as const;
export const BUTTON_WIDTHS = ["auto", "full"] as const;
export const FONTS = ["sans", "serif", "mono"] as const;
export type FontKey = (typeof FONTS)[number];
export const FONT_LABEL: Record<FontKey, string> = { sans: "Sans-serif (Helvetica, Arial)", serif: "Serif (Georgia)", mono: "Monospace" };
export const FONT_STACK: Record<FontKey, string> = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "ui-monospace, Menlo, Consolas, 'Courier New', monospace",
};

export type Cell = { imageSrc: string; imageAlt: string; html: string };

type Base = { id: string };
export type HeadingBlock = Base & { type: "heading"; text: string; level: 1 | 2 | 3; align: Align };
export type TextBlock = Base & { type: "text"; html: string; align: Align };
export type ImageBlock = Base & { type: "image"; src: string; alt: string; href: string; width: number; align: Align };
export type ButtonBlock = Base & { type: "button"; label: string; href: string; align: Align; fill: (typeof BUTTON_FILLS)[number]; radius: (typeof BUTTON_RADII)[number]; width: (typeof BUTTON_WIDTHS)[number] };
export type ColumnsBlock = Base & { type: "columns"; left: Cell; right: Cell };
export type DividerBlock = Base & { type: "divider" };
export type SpacerBlock = Base & { type: "spacer"; height: number };
export type SocialBlock = Base & { type: "social"; align: Align; links: { network: SocialNetwork; url: string }[] };
export type Block = HeadingBlock | TextBlock | ImageBlock | ButtonBlock | ColumnsBlock | DividerBlock | SpacerBlock | SocialBlock;

export type EmailStyle = {
  /** Page background behind the email. */
  bg: string;
  /** The email's own background. */
  surface: string;
  text: string;
  /** Buttons and links. */
  accent: string;
  font: FontKey;
  /** Optional line above the address in the footer, e.g. why they're getting this. */
  footerNote: string;
  /** Show the workspace logo (or the company name if no logo is uploaded) at the top of the email. */
  showLogo: boolean;
  logoAlign: Align;
};

/** The workspace logo shown in the header. Stored once in settings, not per newsletter. */
export type Brand = { logoUrl: string; logoAlt: string; logoHref: string; logoWidth: number };
export const NO_BRAND: Brand = { logoUrl: "", logoAlt: "", logoHref: "", logoWidth: 160 };

export const DEFAULT_STYLE: EmailStyle = {
  bg: "#F1F3F6", surface: "#FFFFFF", text: "#1B1F27", accent: "#5B5BD6", font: "sans",
  footerNote: "You’re receiving this because you’ve been in touch with us.",
  showLogo: true, logoAlign: "left",
};

export const LEAD_SOURCES = ["any", "web_form", "referral", "import", "partner", "manual"] as const;
export type LeadAudience = { on: boolean; status: "open" | "converted" | "disqualified" | "any"; source: (typeof LEAD_SOURCES)[number]; ownerId: string; formId: string };
export type MerchantAudience = { on: boolean; status: "prospect" | "boarding" | "live" | "closed" | "any"; ownerId: string };
/** "any" = no filter; ownerId "none" = unassigned. */
export type Audience = { leads: LeadAudience; merchants: MerchantAudience };

export const DEFAULT_AUDIENCE: Audience = {
  leads: { on: false, status: "open", source: "any", ownerId: "any", formId: "any" },
  merchants: { on: false, status: "live", ownerId: "any" },
};

export const MERGE_TAGS = [
  { tag: "{{first_name}}", label: "First name", sample: "Jordan" },
  { tag: "{{name}}", label: "Full name", sample: "Jordan Lee" },
  { tag: "{{business_name}}", label: "Business name", sample: "Harbor Coffee Co." },
  { tag: "{{company}}", label: "Your company", sample: "" },
] as const;

export const newBlockId = () => Math.random().toString(36).slice(2, 10);

const cell = (html: string): Cell => ({ imageSrc: "", imageAlt: "", html });

export function blankBlock(type: BlockType): Block {
  const id = newBlockId();
  switch (type) {
    case "heading": return { id, type, text: "A clear, short heading", level: 2, align: "left" };
    case "text": return { id, type, html: "<p>Write your message here. Select text to make it bold, add a link or start a list.</p>", align: "left" };
    case "image": return { id, type, src: "", alt: "", href: "", width: 100, align: "center" };
    case "button": return { id, type, label: "Learn more", href: "", align: "left", fill: "solid", radius: "rounded", width: "auto" };
    case "columns": return { id, type, left: cell("<p><strong>First point</strong><br>A sentence or two about it.</p>"), right: cell("<p><strong>Second point</strong><br>A sentence or two about it.</p>") };
    case "divider": return { id, type };
    case "spacer": return { id, type, height: 24 };
    case "social": return { id, type, align: "center", links: [{ network: "website", url: "" }, { network: "linkedin", url: "" }] };
  }
}

export function starterBlocks(): Block[] {
  return [
    { id: newBlockId(), type: "heading", text: "Hello {{first_name}},", level: 1, align: "left" },
    { id: newBlockId(), type: "text", html: "<p>Here’s what’s new this month. Replace this text with your own, then drag in more blocks from the left.</p>", align: "left" },
    { id: newBlockId(), type: "button", label: "Read more", href: "", align: "left", fill: "solid", radius: "rounded", width: "auto" },
  ];
}

// ── Validation ───────────────────────────────────────────────────────────────
const id = z.string().regex(/^[a-z0-9]{4,16}$/);
const align = z.enum(ALIGNS);
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a hex color like #5B5BD6");
/**
 * Saving is lenient on purpose: a half-typed link must not stop autosave. Addresses are stored as typed, checked by
 * `sendProblems` before sending, and made safe by the renderer (anything that isn't a web / mailto / tel link is dropped).
 */
const linkUrl = z.string().trim().max(2000);
const imageUrl = z.string().trim().max(2000);
export const validLink = (v: string) => safeHref(v) !== null;
export const validImage = (v: string) => /^https?:\/\/[^\s"<>]+$/i.test(v.trim());
export const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const rich = z.string().max(20_000).transform(sanitizeRich);
const cellSchema = z.object({ imageSrc: imageUrl, imageAlt: z.string().max(300), html: rich });

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("heading"), text: z.string().max(300), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), align }),
  z.object({ id, type: z.literal("text"), html: rich, align }),
  z.object({ id, type: z.literal("image"), src: imageUrl, alt: z.string().max(300), href: linkUrl, width: z.number().int().min(10).max(100), align }),
  z.object({ id, type: z.literal("button"), label: z.string().max(100), href: linkUrl, align, fill: z.enum(BUTTON_FILLS), radius: z.enum(BUTTON_RADII), width: z.enum(BUTTON_WIDTHS) }),
  z.object({ id, type: z.literal("columns"), left: cellSchema, right: cellSchema }),
  z.object({ id, type: z.literal("divider") }),
  z.object({ id, type: z.literal("spacer"), height: z.number().int().min(4).max(120) }),
  z.object({ id, type: z.literal("social"), align, links: z.array(z.object({ network: z.enum(SOCIAL_NETWORKS), url: linkUrl })).max(8) }),
]);
export const blocksSchema = z.array(blockSchema).max(60, "Keep newsletters to 60 blocks or fewer");

export const styleSchema = z.object({
  bg: hexColor, surface: hexColor, text: hexColor, accent: hexColor, font: z.enum(FONTS), footerNote: z.string().max(300),
  showLogo: z.boolean().default(true), logoAlign: align.default("left"),
});

export const brandSchema = z.object({
  logoUrl: z.string().trim().max(2000).refine((v) => v === "" || validImage(v), "The logo’s address must start with https://"),
  logoAlt: z.string().trim().max(200),
  logoHref: z.string().trim().max(2000).refine((v) => v === "" || validLink(v), "The logo link isn’t a web address. Start it with https://"),
  logoWidth: z.number().int().min(40).max(400),
});

const uuidOr = (...lits: string[]) => z.string().refine((v) => lits.includes(v) || /^[0-9a-f-]{36}$/.test(v));
export const audienceSchema = z.object({
  leads: z.object({ on: z.boolean(), status: z.enum(["open", "converted", "disqualified", "any"]), source: z.enum(LEAD_SOURCES), ownerId: uuidOr("any", "none"), formId: uuidOr("any") }),
  merchants: z.object({ on: z.boolean(), status: z.enum(["prospect", "boarding", "live", "closed", "any"]), ownerId: uuidOr("any", "none") }),
});

export const campaignSchema = z.object({
  name: z.string().trim().max(120).transform((v) => v || "Untitled newsletter"),
  subject: z.string().trim().max(200),
  preheader: z.string().trim().max(200),
  fromName: z.string().trim().max(100),
  replyTo: z.string().trim().max(200),
  blocks: blocksSchema,
  style: styleSchema,
  audience: audienceSchema,
});
export type CampaignInput = z.infer<typeof campaignSchema>;

const plain = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

/** Problems that block sending (a draft can be saved with them). */
export function sendProblems(c: { subject: string; replyTo?: string; blocks: Block[]; audience: Audience }): string[] {
  const p: string[] = [];
  if (!c.subject.trim()) p.push("Add a subject line.");
  if (c.replyTo?.trim() && !validEmail(c.replyTo)) p.push("The “Replies go to” address isn’t a valid email address.");
  if (!c.blocks.length) p.push("Add at least one block to the email.");
  if (!c.audience.leads.on && !c.audience.merchants.on) p.push("Choose who gets this on the Audience tab.");
  c.blocks.forEach((b, i) => {
    const n = `Block ${i + 1} (${BLOCK_LABEL[b.type].toLowerCase()})`;
    const badLink = (u: string) => !!u && !validLink(u);
    if (b.type === "button" && !b.href) p.push(`${n}: add the link the button opens.`);
    if ((b.type === "button" || b.type === "image") && badLink(b.href)) p.push(`${n}: the link isn’t a web address. Start it with https://`);
    if (b.type === "image" && b.src && !validImage(b.src)) p.push(`${n}: the picture’s address must start with https://`);
    if (b.type === "columns" && [b.left, b.right].some((c2) => c2.imageSrc && !validImage(c2.imageSrc))) p.push(`${n}: a picture’s address must start with https://`);
    if (b.type === "social" && b.links.some((l) => badLink(l.url))) p.push(`${n}: one of the links isn’t a web address. Start it with https://`);
    if (b.type === "button" && !b.label.trim()) p.push(`${n}: add the button’s label.`);
    if (b.type === "image" && !b.src) p.push(`${n}: upload a picture or remove the block.`);
    if (b.type === "heading" && !b.text.trim()) p.push(`${n}: add the heading text or remove the block.`);
    if (b.type === "text" && !plain(b.html)) p.push(`${n}: add some text or remove the block.`);
    if (b.type === "social" && !b.links.some((l) => l.url && validLink(l.url))) p.push(`${n}: add at least one link or remove the block.`);
  });
  return p;
}

/** Non-blocking advice shown on the review step. */
export function sendWarnings(c: { subject: string; preheader: string; blocks: Block[] }): string[] {
  const w: string[] = [];
  if (c.subject.length > 70) w.push("The subject line is long. Many inboxes cut it off after about 60 characters.");
  if (!c.preheader.trim()) w.push("No preview text. Inboxes will show the first words of the email instead.");
  if (c.blocks.some((b) => b.type === "image" && b.src && !b.alt.trim())) w.push("Some pictures have no description. Add one for people whose email app blocks images.");
  return w;
}
