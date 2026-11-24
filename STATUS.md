# Build status

Living checklist for the first build. "Stub" = present in the UI but not fully wired; see notes.

## Foundation
- [x] Next.js 16.4 (App Router, Cache Components off), Tailwind 4, design tokens ported from the canvas (`design/`)
- [x] PostgreSQL 17 + Drizzle ORM; migrations in `drizzle/`, runtime migrator (`scripts/migrate.ts`)
- [x] Append-only audit log (DB trigger blocks UPDATE/DELETE/TRUNCATE), `pg_trgm` for fuzzy matching
- [x] Idempotent seed (`scripts/seed.ts`): admin from `.env`, default settings, the Maverick connection
- [x] Docker Compose: db, mailpit, migrate (one-shot), app, worker — one image
- [x] Field encryption (AES-256-GCM) for EIN, bank account, integration secrets
- [x] Email/password auth: DB sessions (hashed tokens), lockout, reset + invite links (Mailpit), audit
- [x] Proxy optimistic redirect + Data Access Layer checks on every page/action; agent record scoping
- [x] App shell: sidebar (role-filtered, counts), top bar, Cmd+K search, + New, notifications, theme

## Built and verified (clean `docker compose down -v && up --build`, Nov 21 2026)
- [x] Worker (pg-boss): webhook processing, manual + nightly syncs
- [x] Webhook ingress `/api/webhooks/maverick/[path]`: valid signature 200, duplicate id deduped, bad signature 401, stale date 400; rejected events stored for review
- [x] Settings: General, Security, Email, SSO, Users & roles (invite / reset / disable), Integrations (per-connection token, secret, mode, sync toggles, health, events, re-sync), Audit log
- [x] Settings and connection config persist across container restarts
- [x] Screens: Home, Leads, Deals (kanban), Merchants (list + record), Applications (board + record + new), Support, Chargebacks, Reports, Residuals, Account (change password)
- [x] CSV export (scoped, audited), duplicate detection, Cmd+K search
- [x] Hide inactive boarding merchants (still boarding, one cancelled application, no MIDs, no chargebacks) from the record page or in bulk from Merchants → Cancelled boarding. Hidden merchants leave the list, search, applications board, ticket picker and exports; Merchants → Hidden lists them for unhiding. Nothing is deleted and nothing changes in Maverick (our token can’t delete). A hidden merchant comes back automatically if Maverick moves its application out of Cancelled. Admins, managers and onboarding; audited
- [x] Merchant addresses show postal state codes: Maverick sends its own state id (44 = TX), which the sync now resolves through `GET /api/country/{id}/states` (built-in US list as fallback); stored ids were converted by migration 0004
- [x] Ticket categories show names: Maverick tickets carry only a category id, which the sync now resolves through `GET /api/ticket/categories` (the id is kept if that call fails). Names shared by two categories get their parent appended, such as "Chargebacks (Risk)". An id Maverick no longer lists stays a number. Tickets synced earlier pick up their names on the next sync
- [x] Application sync no longer creates an empty duplicate merchant for boarding applications on every run (it now matches the application first); migration 0005 removed the copies already created
- [x] Lead forms (Leads → Forms): builder with live preview (field types, required, half width, mapping to lead fields, options), settings (heading, thank-you or redirect, lead owner, email alerts, allowed sites, consent checkbox, color, light/dark), publish/unpublish, archive, duplicate, submissions list. Each published form gets an embed snippet (auto-resizing iframe + `ib-form-submitted` event), a plain iframe and a direct link. Submissions create a "Web form" lead or add to an open lead with the same email/phone. Spam: honeypot, signed time token, 5 per 10 min per visitor per form. Hosted page sets its own CSP (frame-ancestors from allowed sites). Admins and managers
- [x] File upload field on lead forms (e.g. merchant statements): PDF, JPG, PNG, HEIC, CSV, Excel; type checked from file content; 10 MB per file, up to 10 files per field, 25 MB per submission. Encrypted at rest on the `uploads` Docker volume (`src/lib/files.ts`, swappable for S3), listed on the lead, downloadable only by staff who can see the lead, always as an attachment, and every download audited
- [x] ClamAV virus scanning for uploads (`clamav` service, clamd INSTREAM client in `src/lib/clamav.ts`): infected files are refused at submit and logged (`file.blocked`); if the scanner is down, files are held as pending (no download) and the worker scans them every minute, deleting any that turn out infected and noting it on the lead. Status, signature version and counts in Settings → Security. Tested with EICAR, scanner up and down
- [x] Email newsletters (Email in the sidebar; admins and managers, permission `campaigns.manage`): drag-and-drop builder (`@dnd-kit`) with heading, text, image, button, two-column, divider, spacer and social blocks; in-place text editing with bold / italic / underline / lists / links and personal details (`{{first_name}}`, `{{name}}`, `{{business_name}}`, `{{company}}`); colours, font, footer note; a header with the workspace logo (uploaded once in the builder's Email settings, stored in the `brand` setting and used by every newsletter; shows the company name as text until a logo is uploaded; can be switched off or re-aligned per newsletter); undo / redo; autosave; desktop / phone widths; preview of the real email HTML; test send to yourself; saved templates. Audience = leads and/or merchants by filter (merchant address = Primary/Owner contact email, else the customer-service email; hidden merchants never included), deduplicated, worked out again at send time. Send now or schedule; stop part-way. The worker (`src/jobs/email-send.ts`, every minute, "send rate per minute" in Settings → Email) claims each recipient before contacting the mail server, so a crash can't send twice (an interrupted recipient is marked failed, not retried). Every email has the postal address from Settings → Email, an unsubscribe link and one-click `List-Unsubscribe` headers; unsubscribes and addresses the mail server rejects go on the do-not-email list (Email → Do-not-email list). Open and click tracking (`/e/o`, `/e/c`; clicks redirect only to links stored at send time), view-in-browser (`/e/v`), report per newsletter. Pictures upload to a public store (`/e/img`, PNG/JPG/GIF/WebP up to 2 MB, type-checked and virus-scanned). Sending is blocked until Settings → Email has a real mail server, From address and postal address. Audited (`campaign.*`). Saving is lenient (a half-typed link never blocks autosave); addresses are checked before sending and anything that isn't a web / mailto / tel link is dropped by the renderer. Mail failures are sorted by SMTP step: only a permanent refusal of one address goes on the do-not-email list; a connection, login or sender problem puts the rest back in the queue and retries each minute; three unexplained failures in a row pause the send. Verified Nov 23 2026 in Docker against Mailpit with test leads and test merchants: build, drag from palette, reorder, keyboard add, formatting, link, undo, autosave, preview, test send, send at a rate limit, interrupted worker (no duplicates), Schedule and cancel schedule, a due scheduled send, stop part-way, mail server switched off mid-send (requeued, resumed, nothing suppressed), merchant audience (Primary contact, customer-service fallback, hidden excluded), timeline entries, open / click / unsubscribe (GET only confirms, POST unsubscribes, one-click POST), second send skips unsubscribed, phone-width layout.
- [x] OIDC single sign-on (`/auth/sso/start`, `/auth/sso/callback`, PKCE + state + nonce); off by default, turned on in Settings → Single sign-on

## UI
- [x] Responsive: full sidebar ≥1200px, icon rail 768–1199px, off-canvas drawer and bottom sheets <768px; no sideways scrolling at 375px on any page
- [x] Motion: menus, popovers, sheets, dialogs, expanding sections and page changes animate briefly; all of it is off under reduced-motion
- [x] In-app confirmation dialog replaces the browser's confirm boxes
- [x] No simulator or sample data: the CRM starts empty and fills from the Maverick sync, webhooks or manual entry

## Not verified
- [ ] Newsletters: dragging by touch on a real phone or tablet (tested with a mouse at phone width only); rendering in real mail apps (Outlook, Gmail, Apple Mail), only checked in Mailpit and the browser; a real SMTP provider's rejections (the recipient / sender classification is by code reading, not a live refusal); a virus caught inside a valid image file. On the production server there is no ClamAV, so newsletter pictures are type-checked but not virus-scanned there.
- [ ] Live Maverick sandbox calls: paste the sandbox token and webhook secret in Settings → Integrations → Maverick, enable it, then use Test connection and Re-sync
- [ ] SSO against a real identity provider

## Stubs / later
- [ ] Uploads for application documents and dispute evidence (lead-form uploads are stored; these screens still only track documents)
- [ ] Pushing new applications to the Maverick boarding API (needs campaign IDs and field mapping)
- [ ] Two-way email sync, lead enrichment

## Notes
- Newsletters only learn about bounces the mail server reports while sending. Bounces that arrive later by email are not detected; use your mail provider's bounce report and add those addresses to the do-not-email list. Opens are an estimate.
- ClamAV uses `clamav/clamav-debian` (the main `clamav/clamav` image has no arm64 build) and needs ~1–1.5 GB of memory; signatures refresh automatically
- Lead form snippets use `APP_URL`; set it to the CRM’s public https address before embedding on a real site
- Invite more users from Settings → Users; invite and reset emails land in Mailpit at http://localhost:8025
- A database created before the simulator was removed keeps its old sample records; reset it with `docker compose down -v`
- The admin account comes from `SEED_ADMIN_*` in `.env`; the seed never overwrites an existing password
