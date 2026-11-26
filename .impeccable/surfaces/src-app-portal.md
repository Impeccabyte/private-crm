---
version: 1
slug: "src-app-portal"
primary_target: "src/app/portal"
related_targets: ["src/lib/portal"]
---

# Merchant portal

Scope: every merchant-facing route under `/portal` (sign-in, home, deposits, reports, disputes, requests, account). Visitor mode: Operate.

Audience: small business owners signed in to their own Impeccabyte account, often on a phone, between customers. Job: know whether they got paid and what it cost, catch anything that needs them, and ask their account manager for things. Proof and content: their own synced CRM records (deposits, daily sales, disputes, tickets, account details), never sample figures. Constraints: PRODUCT.md (never show residuals, internal notes, unmasked numbers; account changes are requests; Maverick disclosure on every page; no funding-time promises).

Chosen direction: "What's happened", the account as a running feed with what needs you pinned on top. Memorable moment: opening the portal and seeing, in one glance, the one thing that needs you and the money that already landed.

Unresolved: how the website's "Log in" reaches `/portal/login` (the site links to the app root today); where attachments go until production has a virus scanner.

## Direction contract

THESIS: The portal is a story of the account, newest first, not a dashboard of tiles. It refuses the category default of a KPI row over a chart over a table; the money question is answered by the feed plus one steady totals column.

OWN-WORLD: Impeccabyte's paper ground, a clove-800 navigation rail with cream text and an amber count chip, white 20px cards with ink-200 hairlines and warm shadows, Fired Clay pill buttons, Newsreader 600 headings with one italic clay word, Hanken Grotesk for everything else, JetBrains Mono for amounts. State colour only where it means something: brick for needs-you, sage for landed money.

STORY: The merchant sees what needs them, acts on it in place, confirms the money that landed, and can go deeper into deposits, reports, disputes, requests or account details, then send a request to a named person.

FIRST VIEWPORT: Left clove rail (logo, six nav items, business and person at the foot). Centre: greeting h1, a "Needs you" group of up to three brick-edged items each with its one action button, then dated groups of events with amounts right-aligned in mono. Right column 360px: next deposit (Newsreader 34px), month-to-date sales, fees and deposited, account health. Primary action: the first "Needs you" item's button. Under 1100px the totals column moves above the feed; under 768px the rail becomes a top bar with a menu.

FORM: Event feed with pinned actions and a totals column, card 3 of the dealt hand (position 3 of my ordered list). seed:54fd61ade3b4da05. Signature move: "Needs you" items stay pinned and lit until resolved, and a resolved item settles into its dated group instead of vanishing.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
