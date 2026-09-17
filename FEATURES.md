# BloomPOS — Feature Guide

A complete reference of everything BloomPOS does: the core modules every shop gets, what each subscription package unlocks, how Restaurant Mode and Multi-Terminal work, and exactly how a sale moves from cart to printed receipt.

> This document describes the product as it exists in code today. It is not a pricing sheet — package pricing is set and communicated manually by sales agents, not stored in the app.

---

## Table of Contents

1. [What BloomPOS Is](#1-what-bloompos-is)
2. [Core Modules — Included in Every Package](#2-core-modules--included-in-every-package)
3. [Packages & What Each One Unlocks](#3-packages--what-each-one-unlocks)
4. [Feature-by-Feature Benefits](#4-feature-by-feature-benefits)
5. [Restaurant Mode](#5-restaurant-mode)
6. [Multi-Terminal Mode](#6-multi-terminal-mode)
7. [How a Sale Works — the Full Billing Flow](#7-how-a-sale-works--the-full-billing-flow)
8. [Receipts & Printing](#8-receipts--printing)
9. [Online vs Offline Deployment](#9-online-vs-offline-deployment)

---

## 1. What BloomPOS Is

BloomPOS is a complete point-of-sale platform for retail shops and restaurants — billing, inventory, staff management, and reporting in one system. It's built to be **business-agnostic**: a grocery store, hardware shop, pharmacy, clothing store, or restaurant can all configure it for their own catalog, currency, and workflow rather than being locked into one industry's assumptions.

It runs in two forms:

- **Online (hosted)** — a browser-based POS your staff log into from any device, data lives in the cloud, multiple shop locations/tenants share the same platform under one account.
- **Offline (desktop)** — a Windows Electron app that runs entirely on the shop's own PC with its own local database. No internet connection is needed for day-to-day operation, ever — not even intermittently. (The only thing that ever touches the internet is the one-time license activation; after that, the signed activation is trusted locally forever.)

Every feature described below works the same way in both forms unless a section specifically says otherwise (Multi-Terminal is the one major exception — it's offline-only).

---

## 2. Core Modules — Included in Every Package

These are available to every shop regardless of package — they're the baseline POS, not an upsell.

- **Dashboard** — daily snapshot for admins/managers.
- **POS / Billing screen** — the till itself; see [§7](#7-how-a-sale-works--the-full-billing-flow) for the full flow.
- **Products** — catalog with categories, barcodes/SKUs, selling & cost price, per-product unit of measure (piece, kg, g, litre, ml, or a free-text custom unit like "roll" or "bag"), tax rate, low-stock threshold, and an active/inactive toggle. Each product's edit screen shows its full cost history (opening stock plus every GRN receipt that changed cost).
- **Inventory** — a **Stock** view (current quantity, average cost, stock/retail value, low-stock badges) and a **Movements** view — a full audit ledger of every stock change (GRN receipts, sales, manual adjustments, returns, opening balances), each showing the before/after balance and who did it. Manual adjustments always require a reason.
- **GRN (Goods Received Note)** — how new stock comes in: pick or add a supplier, record the invoice number and date, then line items with quantity and buying price. You can receive stock in a different unit than the product's base unit (e.g. receive in grams for a product tracked in kg) — it converts automatically. GRNs can be partially or fully returned to the supplier, which reverses the stock and records the return.
- **Shifts** — one open till shift per cashier at a time. Opens with a declared starting cash float; on close, the cashier counts actual cash and the system compares it against a server-calculated expected total (cash sales, minus refunds paid out of that same shift) — surfacing any over/short variance for accountability.
- **Settings** — business profile (name, logo, address, phone, email — all of which appear on receipts), printer setup and bill template selection, and multi-currency (currency code/symbol) — this one is included even on the entry-level package.
- **Backup** — an offline install can take a real physical copy of its own database to a local folder on a schedule (not a partial export — a genuine restorable copy), with a visible history of past backups. A hosted shop gets the equivalent as a server-side scheduled backup with download/restore instead of a local folder.
- **Users & Roles** — three roles ship by default (Admin, Manager, Cashier), each an independently editable permission set covering dashboard, POS, products, inventory, GRN, promotions, reports, shifts, user management, and price-override rights. Every user can optionally get a short PIN for fast POS login without typing an email/password each time.
- **Bill/receipt printing** — all 5 receipt templates, bilingual printing, multi-printer fan-out. Never gated behind any package — every shop needs to print a bill, so every shop gets it. See [§8](#8-receipts--printing).
- **Batch/FIFO costing + expiry tracking** — every shop, including the smallest single-till Basic account, can track individual batches with their own cost and expiry date rather than only a blended average cost. See [§4](#4-feature-by-feature-benefits) below.
- **Today's sales summary** — every shop can see today's transactions, revenue, profit, and discounts at a glance, with zero setup. The full historical/multi-report suite is still a package upgrade — this daily snapshot isn't.

---

## 3. Packages & What Each One Unlocks

Every package is **cumulative** — Standard has everything Basic has, plus more; Professional has everything Standard has, plus more. **Custom** isn't a bigger fixed list on top of Professional — Professional already includes every feature in the system — it's the tier built for unlimited staff and a sales agent tailoring the exact mix a specific customer needs, using the same per-customer feature customization tool used to adjust any account.

| | **Basic** | **Standard** | **Professional** | **Custom** |
|---|---|---|---|---|
| Tagline | *A single till, know your numbers* | *Growing shop, more than one cashier* | *Everything a serious shop needs* | *Tell us what you need — we'll tailor it* |
| Staff logins | 1 | 5 | 15 | Unlimited (default, negotiable) |
| Paired Terminal machines (offline LAN mode) | — | — | Up to 5 | Up to 5 (default) |
| **Bill/receipt printing (all templates)** | ✅ | ✅ | ✅ | ✅ |
| Multi-currency | ✅ | ✅ | ✅ | ✅ |
| **Batch/FIFO costing + expiry tracking** | ✅ | ✅ | ✅ | ✅ |
| **Today's sales summary (daily report)** | ✅ | ✅ | ✅ | ✅ |
| Full reports & analytics (history, 7 report types) | | ✅ | ✅ | ✅ |
| Multiple staff logins / roles | | ✅ | ✅ | ✅ |
| Promotions & discounts | | ✅ | ✅ | ✅ |
| Coupon codes | | ✅ | ✅ | ✅ |
| Multi-language (English/Sinhala) | | ✅ | ✅ | ✅ |
| Credit customers | | | ✅ | ✅ |
| Restaurant Mode (tables, dine-in/takeaway/delivery) | | | ✅ | ✅ |
| Kitchen ticket (KOT) printing | | | ✅ | ✅ |
| VAT tax invoices | | | ✅ | ✅ |
| Multi-terminal / LAN mode | | | ✅ | ✅ |

A shop's package sets the *default* feature list, but a sales agent can customize any individual customer's feature set beyond their package defaults at signup or anytime afterward — so the table above is the normal case, not a hard wall.

---

## 4. Feature-by-Feature Benefits

**Batch / FIFO costing + expiry tracking** *(every package, including Basic)* — Per-product costing method: **Weighted Average** (the simplest default) or **FIFO/Batch-wise**. FIFO products track individual batches — batch number, received date, expiry date, remaining vs. received quantity, and that batch's own unit cost — instead of one blended cost figure. Switching a product's method only applies going forward; history isn't rewritten.
*Benefit: for perishables or price-volatile stock — exactly the kind of shop that buys the entry-level package — know which batch (and its real cost/expiry) a sale came from, not just an average, from day one.*

**Today's sales summary** *(every package, including Basic)* — A locked-to-today snapshot: transactions, revenue, profit, and discounts given, with no date-range picker and no history — that's what the full Reports upgrade below adds.
*Benefit: even a single-till shop owner can check "how did today go" without buying analytics they don't need yet.*

**Full reports & analytics** *(Standard+)* — Seven report views, all date-ranged, any period in the shop's history: **Sales** (revenue/profit/transactions/discounts with a daily breakdown), **Products** (per-product quantity sold, revenue, cost, profit), **Inventory** (a stock-value snapshot), **Cashiers** (per-staff revenue/profit — accountability across a team), **Credit** (outstanding customer balances, credit limits, last sale/payment), **Stock Movements** (the full audit log, filterable), and **Promotions** (usage counts and total discount given, for promotions and coupons separately). All are printable straight from the browser.
*Benefit: know exactly what's selling, who's performing, and where money is going, across any date range — not just today.*

**Multiple staff logins / roles** *(Standard+)* — Add cashiers and managers beyond the single Basic login, each with their own editable permission set.
*Benefit: a growing shop can staff up without everyone sharing one login, and an owner can restrict what a cashier is allowed to touch (e.g. no price overrides, no user management).*

**Promotions & discounts** *(Standard+)* — Percentage off, fixed amount off, buy-X-get-Y, or a free item — scoped to all products, one category, or a single product, with an optional date range and an active/inactive toggle.
*Benefit: run a sale or a loyalty perk without manually discounting every sale at the till.*

**Coupon codes** *(Standard+, requires Promotions)* — Code-based discounts with a minimum purchase amount, a cap on total uses and uses-per-customer, and a date range. Redemption is safely atomic — a limited-use code can't be double-spent by two simultaneous checkouts. Codes can also be **bulk-generated**: 1–500 random codes at once from one shared rule set, with an optional label (e.g. "Diwali Sale 2026") to identify the batch afterward.
*Benefit: run a print/social media coupon campaign and hand out or publish real, trackable codes in seconds instead of one at a time.*

**Multi-language** *(Standard+)* — Switch the POS UI between English and Sinhala. Product and customer names always display and print correctly in whichever script they were actually entered in, regardless of this setting.
*Benefit: staff can work in the language they're most comfortable in without affecting what customers see on their receipt.*

**Credit customers** *(Professional+)* — Customer records with a running account statement, optional credit limit, and payment recording against their balance (cash or card). This is what powers Credit/Pay-Later sales at checkout.
*Benefit: shops that extend credit to regular customers (common for hardware stores, wholesalers, pharmacies) get a real ledger instead of a notebook.*

**Restaurant Mode** *(Professional+, with KOT printing)* — See [§5](#5-restaurant-mode) for the full picture.
*Benefit: turns the same platform into a proper table-service system — no separate restaurant software needed.*

**VAT tax invoices** *(Professional+)* — Adds a VAT registration number field to Settings and a formal "Tax Invoice" receipt layout (invoice number, VAT reg number, an explicit qty/price/amount table, and a signature line) — see [§8](#8-receipts--printing).
*Benefit: businesses legally required to issue a compliant tax invoice, not just a till slip, can do so directly from the POS.*

**Multi-terminal / LAN mode** *(Professional+, offline only)* — See [§6](#6-multi-terminal-mode).
*Benefit: run several checkout counters off one shared database and one license, without needing internet or per-machine software licensing.*

---

## 5. Restaurant Mode

Restaurant Mode is a **toggle**, not an automatic unlock — any Professional-or-higher shop can switch a single business between plain retail POS and table-service mode at will ("Switch to Restaurant Mode" in Settings). Turning it on reveals a **Tables** page and the order-type concept a plain retail till doesn't have.

**Tables.** Each table has a name, a capacity, and one of three statuses: **Available** (green — tap to start a new order), **Occupied** (red — tap to resume its current order), or **Reserved** (amber, set manually by staff, not tappable for walk-ins). Tapping an available table drops the cashier straight into the POS screen with an empty cart tagged to that table and order type (dine-in, takeaway, or delivery). Tapping an occupied table reloads its current cart — including which items have already been sent to the kitchen, so resuming a table never re-fires duplicate kitchen tickets.

**Order lifecycle.** A dine-in/takeaway/delivery order is created as a *held* sale (the same held-bill mechanism the retail till uses to pause a cart) rather than an immediately completed one — stock is locked/deducted the same as a normal sale, but it doesn't count toward the shift's revenue until it's actually paid. Opening a table flips it to Occupied; items can be added to the order at any point while it's open.

**Kitchen stations & KOT (Kitchen Order Ticket) printing.** Products can optionally be assigned to a kitchen station (e.g. "Grill," "Bar," "Dessert"). Tapping **Send to Kitchen** finds every item on the order not yet sent, marks it sent, and prints one ticket per station straight to that station's own configured printer — a Grill ticket to the kitchen, a Bar ticket to the bar, automatically. Items with no station assigned go to the default printer. Sending again only ever sends what's *new* since the last send — nothing duplicates on a second trip to the kitchen.

**Settling the bill.** Paying out a table runs through the exact same checkout logic as a normal retail sale (discounts, coupons, credit, split payment — all identical), then automatically frees the table back to Available for the next guest.

---

## 6. Multi-Terminal Mode

Professional+, and specific to the **offline (Electron)** deployment — there's no equivalent concept for the hosted web POS, which is already reachable from any device with a browser.

**How it works.** Every standalone offline install already *is* a potential "Server" — nothing needs enabling for that. A second (or third, up to five) PC becomes a **Terminal** by pairing to that Server from its own activation screen, entering the Server's local network address. A Terminal has **no database of its own** — its window simply displays the Server's already-running POS directly, exactly like a browser pointed at the Server. Every action a Terminal's cashier takes is a live request straight to the one shared database on the Server — there's nothing to "sync" because there's only ever one copy of the data.

**What this means in practice:**
- All five terminals and the server see live, identical stock/sales data at all times — no reconciliation, no conflicts.
- A Terminal needs the Server reachable on the same local network to function at all — if that connection drops, it shows a clear "can't reach server" screen rather than silently going offline (there's nowhere for it to store data on its own).
- Backups only need to happen on the Server — a Terminal has nothing local to back up.
- An admin can see and remove paired Terminals from the Server's own Settings page at any time.

**Benefit:** a shop with a busy counter and a second till (or a warehouse desk and a storefront till, on the same premises) can run both off one license and one database, with zero extra per-machine setup beyond pointing the second PC at the first.

---

## 7. How a Sale Works — the Full Billing Flow

**1. Building the cart.** Cashiers add items two ways: a debounced search box (an exact barcode/SKU scan adds instantly with no popup, since a scan is unambiguous; a manual product-grid tap opens a quantity picker) or browsing the product grid directly. Every add goes through a quantity/unit picker for products sold by weight/volume (kg, g, L, ml, or a custom unit), with a live line-total preview. For FIFO-costed products with more than one open batch, the cashier gets an extra batch-picker step (batch number + expiry shown), since different batches can carry different prices. Staff with price-override permission can edit a line's price directly; that permission is enforced on the server too, not just hidden in the UI. Any cashier can apply a per-item discount. A cart can be put **on hold** and resumed later — the same mechanism Restaurant Mode uses to keep an open table's order alive.

**2. Discounts, promotions, and coupons.** Three layers can apply: a manual per-item discount, a flat bill-level discount, and automatic promotion rules (percentage/fixed/buy-X-get-Y/free item) — these stack. A coupon code, when entered, **replaces** any auto-applied item promotion rather than stacking on top of it. Coupon redemption is safely atomic, so a limited-use code can never be double-spent by two checkouts racing each other.

**3. Tax.** Tax is calculated **per product** (not one storewide rate) on the post-discount taxable amount — `(line subtotal − line discount) × tax rate%` — and a single item can carry more than one tax line if needed. Everything rounds to 2 decimals at each step.

**4. Payment.** Four methods: **Cash** (tendered amount must cover the total; change is calculated automatically, and the payment screen defaults to the exact total pre-filled for a fast one-tap checkout), **Card** (any amount accepted, no tendered/change math), **Mixed** (split between cash and card, valid once the two together cover the total), and **Credit/Pay-Later** (requires selecting a customer — no cash changes hands, the amount is added straight to that customer's account balance).

**5. Returns.** Any past sale can be looked up by invoice number (a voided sale can't be). Staff pick per-line return quantities, capped at "sold minus already returned" so a line can never be refunded twice. The refund amount per unit is derived from what was actually **charged** (post-discount, post-tax), not the gross list price — so a discounted or taxed sale still refunds the correct amount. The refund method (cash/card/store credit) is chosen independently of how the original sale was paid.

**6. Closing out.** Every cash movement (sales and refunds alike) is attributed to whichever shift actually handled it, so a shift's end-of-day cash count reconciles correctly even if a return from an earlier shift's sale happens mid-shift.

---

## 8. Receipts & Printing

Five distinct receipt layouts to choose from in Settings, all rendered with your real business name, address, and branding:

| Template | What it's for |
|---|---|
| **Standard** | The balanced default — full header, itemized list, full totals breakdown. |
| **Compact** | One line per item, tighter spacing — less paper per sale. |
| **Detailed** | Adds each item's barcode and a per-item tax breakdown. |
| **Minimal** | Business name, items, and the total only — fastest print, least paper. |
| **Formal (Tax Invoice)** | VAT registration number, an explicit qty/price/amount table, and a signature line — for businesses that must issue a compliant tax invoice, not just a till slip (pairs with the VAT feature, Professional+). |

Receipts print in English or Sinhala (a Settings-level choice for the fixed labels like "Total"/"Change"); product and customer names always print correctly in whichever script they were actually entered in either way, including Sinhala rendered as a crisp printed image on thermal printers that can't natively render that script.

**How printing actually reaches the printer** differs by deployment but is invisible to the cashier either way:
- **Offline (Electron desktop):** prints entirely in-process — no separate app, no dialog box.
- **Online (hosted/browser):** talks to a small, separately-installed "Print Agent" background app on the same PC, so a browser (which can't talk to a printer directly) still gets silent, no-dialog printing.

Extra copies (e.g. a kitchen or store copy of the exact same receipt) can be configured to fan out to more than one printer at once, and in Restaurant Mode, KOT tickets route per-item to each item's own kitchen station printer (see [§5](#5-restaurant-mode)).

---

## 9. Online vs Offline Deployment

| | **Online (hosted)** | **Offline (desktop / Electron)** |
|---|---|---|
| Where it runs | Any device with a browser | A dedicated Windows PC |
| Internet required | Yes, continuously | No — not even intermittently, after initial license activation |
| Data storage | Cloud-hosted, multi-tenant | Local database on that PC |
| Printing | Via the small local Print Agent helper app | Directly, in-process |
| Multi-Terminal | Not applicable (already multi-device by nature) | Available (Professional+) — see [§6](#6-multi-terminal-mode) |
| Best for | Shops wanting anywhere-access, no local server to maintain | Shops wanting zero internet dependency and full local control |

Every other feature in this document — packages, Restaurant Mode, billing flow, reporting, receipts — works identically in both.
