# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two kinds of people use app.impeccabyte.com.

- **Impeccabyte staff.** Admins, managers, sales agents (who see only their own book and their sub-agents'), onboarding specialists and support reps. They work leads and deals, board merchants through Maverick Payments, answer support tickets and disputes, and read reports and residuals. They work at a desk, most of the day.
- **Merchants.** Small business owners whose card processing Impeccabyte set up: restaurants, salons, shops, trades and specialty businesses, mostly in Austin and Central Texas. They sign in to the merchant portal to check their own deposits, sales, disputes and account details, and to send requests to their account manager. They visit now and then, often on a phone, often between customers. Most are not payments experts.

## Product Purpose

The staff side is Impeccabyte's internal CRM: one place for merchant data, lead generation, boarding, support and reporting, fed by Maverick Payments' API and webhooks rather than typing.

The merchant portal gives each merchant a plain-words view of their own account, answering "did I get paid, how much, what did it cost, is anything wrong, and how do I ask for help". It also lets them send requests that staff handle: support questions, equipment and supplies, account changes (reviewed by staff, never applied automatically) and trip requests for the travel perk.

Success for the portal: a merchant finds the answer to a money question without calling, and every request reaches the right staff member with what they need to act on it.

## Positioning

Impeccabyte is a merchant services agency in Austin, Texas, and an authorized sales agent of Maverick Payments. It promises statements and fees in plain English, published pricing, and a setup fit to each industry. The portal is where the "plain English" promise has to hold up after the sale.

## Operating Context

- Next.js 16 (App Router), React 19, Tailwind 4, PostgreSQL with Drizzle, a pg-boss worker, Docker Compose. Deployed at app.impeccabyte.com. See `STATUS.md` and `docs/DEPLOY.md`.
- Data comes from Maverick Payments through the sync and webhooks. Processor rows carry the processor and its own id so a second payment partner can be added later.
- The CRM starts empty and fills from Maverick or manual entry. No sample data ships to production. A development-only seed may create clearly fictional demo merchants for building and testing.
- Staff are invited by an admin. Merchants are invited by staff, and each merchant business has one login for now.

## Capabilities and Constraints

- **Merchants see only their own records.** Merchant identity is separate from the five staff roles and comes only from the merchant's own session.
- **Never shown to merchants:** residuals, splits, buy rates, expense or profit; internal ticket notes; staff activity; underwriting checks; unmasked EIN or bank numbers; Impeccabyte's costs or margins.
- **Account changes are requests.** They go to staff for review and never change merchant records directly. Sensitive values in a request are encrypted like the rest of the CRM.
- **Copy rules carried from the website:** no promises of approval, no reserves, or funding times beyond "cutoffs vary by processor". Dual pricing copy never calls the card price difference a fee. Travel is "an independent travel advisor hosted by Fora Travel", perks vary by hotel, upgrades are only "when available".
- **Required disclosure** on every merchant-facing page, exact text: "Merchant accounts are provided by Maverick Payments and its sponsor banks. Impeccabyte is an authorized sales agent of Maverick Payments."
- Placeholders stay placeholders: phone numbers, hours and anything not yet supplied are `[bracketed]`.
- Production has no virus scanner, so uploads from merchants are held as pending or left out.

## Brand Commitments

- Name: Impeccabyte. Austin, Texas.
- Voice: warm, plain-spoken, encouraging, professional. Speak to "you", refer to the company as "we". Sentence case, buttons start with a verb. No emoji, no em dashes. Explain payments terms in plain words. State fees plainly.
- The merchant portal carries the Impeccabyte brand from the marketing site (impeccabyte.com, its `css/tokens.css`). The staff CRM keeps its own working look.

## Evidence on Hand

- Real: merchant, deposit, daily sales, dispute and ticket records synced from Maverick (in production).
- Not real: any demo merchant in a development database. Never present one as a customer.

## Product Principles

- Answer the money question first: what came in, what it cost, when it lands.
- Plain words over industry terms; when a term matters (chargeback, MID), explain it once in place.
- Requests are conversations with a person, not tickets into a void: show who has it and what happens next.
- Staff stay in control of anything that changes an account.

## Accessibility & Inclusion

WCAG 2.2 AA: 4.5:1 text contrast, 3:1 for control outlines and focus rings, 44px primary touch targets, real headings in order, every input labelled, nothing conveyed by color alone, keyboard support for every control, reduced motion respected. Merchant screens must work at 375px wide.
