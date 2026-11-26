---
name: Impeccabyte Merchant Portal
description: The merchant's own account as a running story on paper, with what needs them pinned on top.
colors:
  paper: "#faf6ef"
  white: "#ffffff"
  on-dark: "#f3ebde"
  clay-50: "#fbf1ec"
  clay-100: "#f5ddd0"
  clay-200: "#ebbba1"
  clay-300: "#de9a78"
  clay-400: "#d17c56"
  clay-500: "#c0623e"
  clay-600: "#a44e2f"
  clay-700: "#833d26"
  clay-800: "#5f2d1e"
  amber-50: "#fcf4e6"
  amber-400: "#e0a04d"
  amber-800: "#5f3d16"
  clove-100: "#e6dace"
  clove-200: "#c9b49e"
  clove-600: "#5e4631"
  clove-700: "#463424"
  clove-800: "#302419"
  ink-900: "#2a211a"
  ink-800: "#3b3128"
  ink-700: "#4d4239"
  ink-600: "#635648"
  ink-500: "#786b5d"
  ink-400: "#9b8e7e"
  ink-300: "#c3b7a6"
  ink-200: "#e0d6c6"
  ink-100: "#efe8dc"
  ink-50: "#f7f2e9"
  sage-50: "#eff3ea"
  sage-100: "#dce6d0"
  sage-600: "#4a6440"
  sage-700: "#38492f"
  brick-50: "#fbedea"
  brick-300: "#dc8377"
  brick-500: "#b23a2e"
  brick-600: "#8f2e24"
  brick-700: "#6b231c"
  slate-50: "#edf1f3"
  slate-500: "#4a6a7a"
  slate-700: "#2f4753"
typography:
  display:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "38px"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-0.018em"
  title:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-0.018em"
  figure:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "lnum, tnum"
  lede:
    fontFamily: "Hanken Grotesk, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Hanken Grotesk, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  group-label:
    fontFamily: "Hanken Grotesk, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.6
    letterSpacing: "0em"
  label:
    fontFamily: "Hanken Grotesk, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
  small:
    fontFamily: "Hanken Grotesk, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  amount:
    fontFamily: "JetBrains Mono, ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "15px"
    fontWeight: 500
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  display-compact:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.18
  figure-compact:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.1
  badge:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 600
rounded:
  bar: "4px"
  md: "14px"
  lg: "20px"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.clay-600}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.clay-700}"
  button-primary-active:
    backgroundColor: "{colors.clay-800}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.ink-50}"
  button-ghost:
    textColor: "{colors.clay-700}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
  button-ghost-hover:
    backgroundColor: "{colors.clay-50}"
  button-small:
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink-900}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
    height: "46px"
  card:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.lg}"
    padding: "20px 22px"
  day-card:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.lg}"
  feed-row:
    padding: "14px 18px"
  needs-item:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.lg}"
    padding: "16px 18px"
  badge-neutral:
    backgroundColor: "{colors.ink-100}"
    textColor: "{colors.ink-700}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "24px"
  badge-ok:
    backgroundColor: "{colors.sage-50}"
    textColor: "{colors.sage-700}"
  badge-warn:
    backgroundColor: "{colors.amber-50}"
    textColor: "{colors.amber-800}"
  badge-danger:
    backgroundColor: "{colors.brick-50}"
    textColor: "{colors.brick-700}"
  badge-info:
    backgroundColor: "{colors.slate-50}"
    textColor: "{colors.slate-700}"
  rail:
    backgroundColor: "{colors.clove-800}"
    textColor: "{colors.on-dark}"
    width: "248px"
  rail-link:
    textColor: "{colors.clove-100}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "44px"
  rail-link-current:
    backgroundColor: "{colors.clove-700}"
    textColor: "{colors.white}"
  count-chip:
    backgroundColor: "{colors.amber-400}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.pill}"
    height: "22px"
  needs-chip:
    backgroundColor: "{colors.brick-500}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    height: "22px"
  callout:
    backgroundColor: "{colors.ink-50}"
    textColor: "{colors.ink-700}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
  segmented:
    backgroundColor: "{colors.ink-100}"
    rounded: "{rounded.pill}"
    padding: "4px"
---

# Design System: Impeccabyte Merchant Portal

## Overview

**Creative North Star: "The Kitchen-Table Ledger"**

The merchant portal carries the Impeccabyte marketing site's world into an Operate surface. It inherits that site's North Star unchanged: a warm, plain-spoken ledger kept on cream paper, where money is written down clearly and nothing is dressed up. Here the ledger is the merchant's own account, told newest first. The home screen is a story of what happened (deposits, disputes, replies) grouped by day, with anything that needs the merchant pinned and lit above it and one steady column of totals beside it. The money question is answered in sentences and hairline rows, never in a row of number tiles.

Density is moderate and calm. A merchant opens this on a phone between customers, so every screen leads with one plain sentence, one clear action, and figures that line up. Colour is quiet by default: paper ground, white cards, brown-tinted inks. State colour appears only where it means something: brick for what needs you, sage for money that landed, amber for counts and waiting, slate for information. The single loud brand moment is one italic clay word in a greeting or hero heading.

The world is light only (`color-scheme: light`). Merchants read it in shops and kitchens, in daylight, and the paper ground is part of the brand promise.

**Key Characteristics:**
- Paper page, white cards, warm hairlines and warm brown shadows; no neutral gray and no pure black.
- A dark clove rail (a clove top bar on phones) with cream text and amber count chips.
- Fired Clay pill buttons; Newsreader 600 headings with at most one italic clay word.
- Hanken Grotesk for all reading text; JetBrains Mono only for figures.
- A day-grouped event feed in hairline rows, with brick-edged Needs-you items pinned above it.
- One authored motion moment: a resolved item settles into Today, warm to cool.

### The staff CRM look is separate

The staff CRM screens (`src/app/ase/*`, styled in `src/app/globals.css` under the `.ib` prefix) are a second surface with their own working look. Nothing in the rest of this file applies to them, and none of their values should be borrowed into the portal. Every rule below this section is scoped to the merchant portal under `.mp` (`src/app/(portal)/`). The design check is told to skip this file's type, radius, colour and font scales for `globals.css` for that reason.

What the staff look is, so new staff screens match it:

- **Mode and scene:** an operating tool for agents and admins at a desk, dense and scannable, in a light or a dark theme the user picks.
- **Type:** Inter throughout at 13px on a 20px line; 12px for supporting text and small buttons, 11px for counts, 15 to 22px for page and card headings at weight 600. JetBrains Mono at 12px for IDs and codes.
- **Colour:** neutral graphite surfaces from tokens (`--bg`, `--surface`, `--sunken`, `--line`, `--ink`, `--ink-2`, `--ink-3`), each redefined for the dark theme. One accent, set in General settings (`--accent`, Kiln Clay today), for links, the active nav item, progress and the switch. Status colours come in ink and background pairs (`--g-`, `--a-`, `--r-`).
- **Buttons with white text** use `--accent-fill`, a darker mix of the accent, never `--accent` itself, so white text keeps 4.5:1.
- **Shape:** small radii, 6 to 8px on controls and 10 to 12px on cards. No pills except status tags.
- **Controls:** 30px high on desktop (26px small). Under 768px the top bar and navigation go to 44px and other buttons and inputs to 40px, with 16px input text. Anything drawn smaller than 24px gets an invisible hit area of at least 24px.
- **Keyboard:** a "Skip to content" link is the first stop on every staff page.

## Colors

A warm earth palette of clay, amber and clove on cream paper, with brown-tinted inks in place of any gray. Names follow the marketing site's DESIGN.md; values come from its `tokens.css`, re-declared on `.mp` in `src/app/portal/portal.css`.

### Primary
- **Fired Clay** (clay-600): the working brand colour. Primary button fill and border, text links, the focus ring, the caret and native accent colour, the selected request-kind outline, hovered chart bars.
- **Burnt Clay** (clay-700) and **Clay Shadow** (clay-800): primary button hover and press, link hover, ghost button label, skip-link text.
- **Kiln Clay** (clay-500): the italic accent word in h1 and h2 on paper, and the emblem. Never a fill for small white text.
- **Clay Blush** (clay-50) and **Clay Wash** (clay-100): tinted surfaces. Icon tiles for requests and replies, ghost button hover, the merchant's own messages in a thread (clay-50 on a clay-100 border), and the 3px focus glow around inputs and the selected request kind.
- **Clay Bars** (clay-200, clay-400): daily sales bars, weekdays and weekends. clay-200 is also the text selection colour and the middle beat of the settle. clay-300 is the hover border on request-kind cards.

### Secondary
- **Lamplight Amber** (amber-400): count chips in the rail and phone menu, the current nav icon, the wordmark's "byte", the italic word and check marks on the clove sign-in panel, and the focus outline inside the rail. Always with ink-900 text, never white.
- **Amber Wash** (amber-50 with amber-800 text): the warn badge ("Waiting on you", open disputes in Account health).

### Tertiary
- **Clove** (clove-800): the navigation rail, the phone top bar and drawer, and the sign-in brand panel. **Clove Hover** (clove-700) fills hovered and current nav links and draws the rail's dividers; clove-600 outlines the sign-out button. clove-100 is nav link text; clove-200 is the quieter text at the rail foot and the sign-in fine print.
- **On Dark** (on-dark): cream text on clove.

### Status
- **Brick** (brick-500, brick-300, brick-50): needs-you. The Needs-you count chip (brick-500), the pinned item's border (brick-300) and its 3px outer halo (brick-50), dispute icon tiles, the danger badge, invalid input borders, error callouts. brick-600 colours the "Needs you" group heading and inline error text; brick-700 is callout and badge text.
- **Sage** (sage-700, sage-600, sage-50, sage-100): money that landed and things that went well. Landed amounts in the feed (sage-700, prefixed "+"), deposit icon tiles, ok badges, ok callouts and the all-clear panel (sage-50 on a sage-100 border).
- **Slate** (slate-50, slate-500, slate-700): information only. The info badge ("We're on it") and icon tiles for terminals and account events.

### Neutral
- **Paper** (paper): the page background everywhere, and the halo around the scrollbar thumb.
- **White** (white): cards, day cards, pinned items, inputs, tables, the secondary button and the 4px focus halo.
- **Ledger Ink** (ink-900): headings, row titles, amounts, strong text. **Body Ink** (ink-800) is body copy. **Soft Ink** (ink-700, ink-600) is lede text, page intros, group labels, table headers and card labels. **Muted Ink** (ink-500) is row detail, hints, the footer disclosure and placeholders.
- **Outline Ink** (ink-400): the minimum outline for controls (secondary button, inputs) and the row chevron; inputs darken to ink-600 on hover.
- **Rule Ink** (ink-200): card, table and day-card borders. **Hairline** (ink-100): dividers between rows, the footer rule, the neutral badge and the segmented control track. **Ink Wash** (ink-50): row hover, table header and footer fills, neutral callouts, neutral icon tiles. ink-300 draws the dashed empty-state border.

### Named Rules
**The Paper, Not White Rule.** The page is always paper. White is only for things laid on the page. Every dark and every gray is brown-tinted ink or clove.

**The State Means Something Rule.** Brick only marks what needs the merchant (and errors), sage only marks money that landed or a good outcome, amber only counts or waits, slate only informs. If a colour does not carry one of those meanings, the element is ink.

**The Two Clays Rule.** Kiln Clay is the brand, Fired Clay does the work. White text sits on clay-600 or darker, never on clay-500.

## Typography

**Display Font:** Newsreader (with Georgia, Times New Roman)
**Body Font:** Hanken Grotesk (with the system sans stack)
**Mono Font:** JetBrains Mono 500 (with ui-monospace, SF Mono, Menlo)

**Character:** A literary serif for the voice of the page and a friendly grotesk for everything a merchant reads and taps; the mono is a ledger column, used for amounts so they line up.

### Hierarchy
- **Display** (Newsreader 600, 38px, 1.18, -0.025em; 30px under 900px): page h1. Greeting and hero h1s may carry one italic word in Kiln Clay at weight 500 ("Good evening, *Maya*.", "Welcome *back*.", "What do you *need*?"). Working pages such as Reports keep a plain h1.
- **Headline** (Newsreader 600, 24px; 20px inside a card and in empty states, the Title size): section h2.
- **Title** (Newsreader 600, 20px): h3 inside account sections.
- **Figure** (Newsreader 600, 34px, 1.1, lining tabular numerals; 26px on phones): the one hero figure on home, the last deposit.
- **Lede** (Hanken 400, 18px, 1.55, max 64ch, Soft Ink): the sentence that summarises a page's money ("In November you were paid ..."), with figures in Ledger Ink 600 and tabular numerals.
- **Body** (Hanken 400, 16px, 1.6): all reading text; page intros cap at 62ch.
- **Group label** (Hanken 700, 15px, Soft Ink, sentence case): day labels in the feed ("Today", "Yesterday", "Mon, Nov 23") and the brick "Needs you" heading. Not uppercase, not tracked.
- **Label** (Hanken 600, 14px): field labels (ink-900) and card labels such as "Last deposit" (ink-600).
- **Row text** (Hanken 600, 15px for the title; 400, 14px, Muted Ink for the detail line).
- **Small** (Hanken 400, 14px): hints, field errors (600, brick), table headers (600), chart axis labels and the footer. Nothing a merchant reads is set below 14px.
- **Badge** (Hanken 600 or 700, 12px): status badges and count chips only, where the text sits inside a pill of 20px or more.
- **Amount** (JetBrains Mono 500, 15px, -0.01em, no wrap; 14px in tables): every money figure in rows, tables, totals and the phone deposit list.

### Named Rules
**The One Italic Word Rule.** A heading carries at most one italic clay word, and only on a greeting or hero heading. On clove the word turns amber.

**The Mono Is a Ledger Column Rule.** JetBrains Mono sets only figures that line up: amounts, percentages and counts in rows, tables and totals. Prose, labels and headings never use it. Figures inside sentences stay in Hanken with tabular numerals.

## Layout

A sidebar shell. A sticky 248px clove rail runs the full height on the left; the main column holds the page (max 1240px, padding 32px 40px 48px, 24px between blocks) and a footer carrying the Maverick disclosure above an ink-100 rule.

The home screen is a two-column grid: the feed (Needs-you group, then day groups) in a flexible column and a 360px totals column that stays sticky 24px from the top, with 32px between columns and 14px between rows. Other pages stack a page header (h1, intro, actions aligned to the bottom right) above content. Forms cap at 680px, threads at 760px, empty states at 640px. Two-up card grids (account) use auto-fit columns of at least 300px with 16px gaps. A request thread sits beside its "What you sent" summary at 2:1.

Responsive behaviour, in the order it kicks in:
- **1099px and below:** home becomes one column in the order Needs you, totals, feed. The totals cards flow as an auto-fit grid (min 240px) instead of a sticky column.
- **899px and below:** the rail disappears and a 60px sticky clove top bar shows the wordmark and a "Menu" disclosure carrying the combined count chip; the drawer drops below it with the same nav and the business and person. Page padding becomes 24px 16px 40px, h1 drops to 30px. Sign-in stacks with the form first and the brand panel below. The request thread stacks with the summary first. (The direction contract named 768px for the rail; the build ships 899px, and the build is the rule.)
- **599px and below:** feed rows and pinned items wrap: the text takes the line beside the 38px icon, and the amount or action button drops to a second line indented 50px to align with the text; chevrons hide. The inline reply goes full width. Segmented month pickers scroll sideways instead of wrapping. The deposits table is replaced by a two-line list (date and amount, then sales, fees and holds). Thread messages offset by 16px instead of 48px.

Everything must work at 375px wide.

## Elevation & Depth

Depth is soft and warm. Surfaces are white on paper with a 1px Rule Ink border and a small shadow tinted brown (rgba(58,42,28,…)), never gray or black. Shadows grow on hover to say "this is a link", and the primary button gains a clay glow. There are no hard offset shadows and no dark-mode elevation.

### Shadow Vocabulary
- **Hairline lift** (`0 1px 2px rgba(58,42,28,0.06)`): the current segment in a segmented control.
- **Resting card** (`0 1px 2px rgba(58,42,28,0.06), 0 2px 6px rgba(58,42,28,0.05)`): cards, day cards, tables, the phone deposit list, pinned items under their halo.
- **Hover lift** (`0 2px 4px rgba(58,42,28,0.05), 0 6px 16px rgba(58,42,28,0.08)`): hovered request-kind cards.
- **Overlay** (`0 4px 8px rgba(58,42,28,0.06), 0 14px 32px rgba(58,42,28,0.10)`): the phone menu drawer and the focused skip link.
- **Clay glow** (`0 4px 14px rgba(192,98,62,0.28)`): the primary button on hover only.
- **Needs-you halo** (`0 0 0 3px #fbedea` plus the resting card shadow): pinned Needs-you items.

### Named Rules
**The Warm Shadow Rule.** Every shadow is tinted clove-brown or clay. A shadow that reads gray is wrong.

## Shapes

Soft, friendly geometry. Every control a finger presses is a full pill (999px): buttons, nav links, badges, count chips, segmented controls and their segments, the sign-out button. Containers use 20px (cards, day cards, pinned items, tables, thread messages, request kinds, empty states) and inputs and callouts use 14px. The only other radius is 4px on the top corners of chart bars. Icon tiles are 38px circles. Badges carry a 6px dot of their own colour before the label. Sales bars round only their top corners (4px). Borders are 1px hairlines, except inputs and request-kind cards, which use 1.5px so they meet the 3:1 control-outline bar. Empty states use a 1px dashed ink-300 border.

## Components

### Buttons
Tactile, confident pills that start with a verb.
- **Shape:** full pill (999px), 44px tall, 20px side padding, Hanken 600 15px, optional 16px trailing Lucide icon.
- **Primary:** Fired Clay fill and border, white label. Hover: Burnt Clay with the clay glow. Press: Clay Shadow, nudged down 1px and scaled to 0.985. Disabled: 55% opacity, no glow.
- **Secondary:** white fill, ink-900 label, Outline Ink border; hover fills Ink Wash and darkens the border to ink-500. Used for "Ask for something", "Download CSV" and empty-state actions.
- **Ghost:** no fill or border, Burnt Clay label, 12px padding; hover fills Clay Blush. Used for "Cancel".
- **Small:** 36px tall, 14px padding, 14px label. Only for secondary actions inside cards (account manager card). Primary actions, including those on pinned Needs-you items and the inline reply, use the full 44px size.
- **Transitions:** colour over 140ms, transform and shadow over 220ms, both on the shared ease.

### Badges and chips
- **Badge:** 24px pill, 10px padding, Hanken 600 12px, a 6px dot in the text colour, then the words. Neutral (ink-100/ink-700), ok (sage), warn (amber), danger (brick), info (slate). Words always say the state ("Decided for you", "Waiting on you"), so colour is never the only signal.
- **Count chip:** 22px pill (20px in the phone summary), Hanken 700 12px. Amber with ink text in navigation; brick with white text beside the "Needs you" heading. Each carries an accessible label ("2 need you").

### Inputs / Fields
- **Style:** white, 46px minimum, 10px 14px padding, 14px radius, 1.5px Outline Ink border, Hanken 16px in ink-900; placeholders in Muted Ink. Textareas start at 120px (96px in the inline reply) and resize vertically.
- **Field:** label (Hanken 600 14px, ink-900) above, hint (14px Muted Ink) and error (14px 600 brick-600) below, 6px apart.
- **Hover / Focus:** hover darkens the border to ink-600; focus turns it Fired Clay with a 3px Clay Wash glow and no outline.
- **Error:** `aria-invalid` turns the border brick-500; the message is linked with `aria-describedby` and announced with `role="alert"`.
- **Select and date:** a custom ink chevron on selects; date pickers keep tabular numerals and a warm-tinted calendar icon. Checkboxes are 20px with Fired Clay as the accent colour.

### Cards / Containers
- **Card:** white, 20px radius, 1px Rule Ink border, resting card shadow, 20px 22px padding. Holds a label, then a figure, hairline key-value rows (`dl` rows with 9px padding and ink-100 dividers, amounts right-aligned in mono) or a hairline list.
- **Hairline list:** rows of icon, two-line text and trailing detail separated by ink-100 rules, used inside a card (terminals on the account page).
- **Callout:** 14px radius, Ink Wash fill, 14px 16px padding, Soft Ink text; ok (sage) and bad (brick) variants for status and errors, with `role="status"` or `role="alert"`.
- **Empty state:** a dashed ink-300 panel on white with a Headline, one plain sentence and a secondary button.
- **All clear:** a sage-50 panel on a sage-100 border with a white icon circle and one sentence ("Nothing needs you right now.").

### Navigation
- **Rail:** clove-800, 248px, wordmark at the top (Newsreader 600 20px, cream, "byte" in amber, with the emblem), six links with 18px Lucide icons, and the business, person and a sign-out pill at the foot above a clove-700 rule.
- **Links:** 44px pills, clove-100 Hanken 500 15px. Hover and current fill clove-700 with white text; current turns weight 600, sets `aria-current="page"` and lights its icon amber. Counts sit at the right in amber chips.
- **Phone top bar:** 60px sticky clove bar; a native `details` "Menu" disclosure with the total count, opening a full-width clove drawer that closes itself on navigation.
- **Segmented control:** an ink-100 pill track with 36px pill segments (Hanken 600 14px); the current segment is white with the hairline lift. Used for months and date ranges.

### Feed: day cards and hairline rows (signature)
The feed tells the account newest first. Each day is a Group label ("Today", "Yesterday", "Mon, Nov 23") over one white day card; events inside it are hairline rows, not separate cards. A row is a 38px tinted icon circle (sage for deposits, brick for disputes, clay for requests and replies, slate for terminals and account), a bold title over a muted detail line, a right-aligned mono amount for money that landed (sage-700, with a "+"), and a chevron when the row links somewhere. Rows hover to Ink Wash; focus draws the outline inset by 3px so it stays inside the card.

### Pinned Needs-you items (signature)
Above the feed, a brick "Needs you" heading with its count, then each item as the only free-standing card on the page: white, 20px radius, brick-300 border with a 3px brick-50 halo, 16px 18px padding, a brick icon circle, the title and detail, and its single action as a small primary button ("Tell us what happened", "Reply"). Items stay pinned and lit until resolved. With nothing pinned, the all-clear panel takes their place.

### Inline reply
"Reply" on a pinned item opens the reply inside that item rather than navigating: a labelled textarea that takes focus, inline error text, and a small primary "Send reply" with a ghost "Cancel". It indents 52px to align with the item's text (full width on phones).

### The settle (the one authored motion)
When a reply is sent, the item leaves the pinned group and its row appears in Today, arriving warm and cooling to the page: Brick Wash with a brick-300 inset ring, then Clay Blush with a clay-200 ring at 35%, then plain white, over 2.4s on `cubic-bezier(0.16, 1, 0.3, 1)`. It runs once per resolution and nowhere else.

### Tables and the phone deposit list
- **Table:** inside a white, 20px, Rule Ink wrapper with the resting shadow that scrolls sideways if needed (table minimum 640px). Headers are Hanken 600 14px ink-600 on Ink Wash; cells 13px 16px with ink-100 rules; money columns right-aligned in mono; a bold Ink Wash footer row for totals. Each table has a visually hidden caption and scoped headers.
- **Phone deposit list:** under 600px the deposits table is swapped for a white card of two-line items: date and mono amount on the first line, sales, fees and holds in Muted Ink on the second.

### The lede (instead of KPI rows)
Deposits and Reports open with one sentence that states the money in words with the key figures in Ledger Ink 600 ("In November you were paid $54,537.97 across 21 deposits to Chase …"). It replaces any row of stat tiles.

### Messages
Thread messages are white 20px panels; the merchant's own messages are Clay Blush on a Clay Wash border and offset 48px from the left, the account manager's offset 48px from the right (16px on phones). Headers carry the author in ink-900 and the time in Muted Ink.

### Sales by day chart
Plain CSS bars in a 180px band over an ink-200 baseline: Clay Bars clay-200 for weekdays, clay-400 for weekends, Fired Clay on hover, with a text note ("Darker bars are weekends.") and a full `role="img"` description of range, best day and weekend share.

### Sign-in
A split screen: the form on paper (max 400px) and a clove brand panel with the wordmark, a Display line with one amber italic word, three amber-checked benefits, and the Maverick disclosure in small clove-200 text.

## Do's and Don'ts

### Do:
- **Do** keep the page paper and lay white cards, rows and inputs on it.
- **Do** answer the money question in a lede sentence and hairline rows, with amounts right-aligned in JetBrains Mono.
- **Do** group the feed by day in one day card per day, with events as hairline rows.
- **Do** pin what needs the merchant above the feed with a brick-300 border, a brick-50 halo and one primary action, and keep it pinned until resolved.
- **Do** reserve brick for needs-you and errors, sage for landed money and good outcomes, amber for counts and waiting, slate for information.
- **Do** use Fired Clay (clay-600) for primary buttons, links and the focus ring, hovering to clay-700 and pressing to clay-800.
- **Do** give every heading Newsreader 600, and give a greeting or hero heading at most one italic Kiln Clay word.
- **Do** show focus as a 2px Fired Clay outline with a 2px offset and a 4px white halo; inside the clove rail the outline turns amber with no halo.
- **Do** keep nav links, buttons and inputs at 44px or taller (46px for inputs), and label every count, chart and table for screen readers.
- **Do** pair every status colour with words, a dot or an icon so colour is never the only signal.
- **Do** put the Maverick disclosure on every portal page, exactly as written in PRODUCT.md: in the footer of signed-in pages and on the clove panel of sign-in pages.
- **Do** use 140ms for colour changes and 220ms for movement and shadow, both on `cubic-bezier(0.22, 0.61, 0.36, 1)`, and drop every transition and animation under `prefers-reduced-motion`.

### Don't:
- **Don't** build a row of KPI or stat tiles over a chart over a table. The only grouped figures are the home totals column (which reflows into a grid above the feed under 1100px) and the lede sentence.
- **Don't** nest a card inside a card. Inside a card, use hairline rows, hairline lists, callouts or the inline reply instead.
- **Don't** make each feed event its own card; only pinned Needs-you items stand alone.
- **Don't** set prose, labels, headings or dates in JetBrains Mono; mono is for figures only.
- **Don't** use brick, sage or amber decoratively, and never put white text on amber or on clay-500.
- **Don't** add uppercase tracked eyebrows or kickers above headings; group labels are sentence-case Hanken.
- **Don't** add a dark mode, neutral grays, pure black or gray shadows.
- **Don't** animate anything except state transitions and the settle; no entrance choreography on page load.
- **Don't** apply these rules to the staff CRM (`.ib`); it is a separate, undocumented look.
