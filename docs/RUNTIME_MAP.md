# Runtime ownership

`config/assets.js` is the source of truth for build ID, execution order, on-demand modules, static assets and legacy URL mappings. `app.js` and `sw.js` consume it; `scripts/assets.cjs` reads it for checks/builds. Do not maintain a second asset list.

| Responsibility | Owner |
| --- | --- |
| First-frame shield, wordmark, appearance and sealed page | `index.html` |
| Scheduling, core preload, fail-closed environment binding | `app.js` |
| Welcome, login travel, skeleton handoff and dashboard release | `src/platform/launch.js` |
| State, auth, routing and primary views | `src/core/application.js` |
| Accounting, fee integrity and reports | `src/domain/` |
| Analytics caching and idle warming | `src/platform/performance.js` |
| Navigation and resume | `src/platform/navigation.js`, `lifecycle.js` |
| General UI visibility and motion | `src/platform/interface-motion.js` |
| Dashboard SVG geometry | `src/features/charts/polish.js` |
| Dashboard bar/forecast timings | `src/features/charts/motion.js` |
| Forecast content and loading handoff | `src/features/charts/finalize.js`, `reveal.js` |
| Sales line sequence and calendar layout | `src/features/sales/` |
| Sales history dates and responsive rows | Core `renderMonth` / sale-event renderers; `assets/styles/sales.css` |
| Partner model/presentation/settlement extensions | Ordered partner files in the manifest |
| Bundle, cashflow and document extensions | Corresponding feature directories |
| On-demand partner statements and diagnostics | Manifest `lazy` list |
| Item costs, postage policy application and item view | `src/core/application.js`; `assets/styles/item.css` |
| Sync status presentation | Core `_refreshSideNavSync`; `assets/styles/status.css`; mobile header in `index.html` |
| Responsive Tax view | `src/core/application.js` (`renderTax`), `assets/styles/tax.css` |
| Shared workspace cards, Stock/Sales overview hierarchy and transaction panels | `assets/styles/workspaces.css`; core renders loaded and pending layouts |
| Cashflow transaction drill-down | `src/features/cashflow/transaction-details.js`; payment details stay in `partners/transaction-breakdown-guard.js` |
| Shared mobile scale, gutters and type hierarchy | `assets/styles/responsive.css`; feature geometry remains in its existing owner |
| Route wait policy, inert placeholder structure and status | Core `_showRoutePending` / `_clearRoutePending` / `_routeSkeletonMarkup`; `assets/styles/loading.css` |
| Tax cash timing and calendar slices | `src/domain/accounting-engine.js`; report export in `report-engine.js` |
| Static cache and old-path transition | `sw.js` |

## Loading contract

The two domain entry scripts load before the core. Core fetching overlaps the welcome; evaluation waits for the shield motion. Critical presentation modules install before dashboard release. `retrade:motion-ready` marks that installation; `retrade:launch-settled` allows serial idle loading of deferred extensions. Login can pause that queue. Warm navigation does not replay the brand intro.

Classic scripts intentionally retain their existing scope and wrapper order. File names such as partner `account-ui-v3` and `account-ui-v4` identify layers that currently both contribute behaviour; they are not automatically redundant copies. Changing their order or concatenating them is unsafe without tracing the wrappers.

Diagnostics are explicitly on demand: `_loadDiagnosticFixtures('accounting')` loads four regression runners; `_loadDiagnosticFixtures('preview')` loads the sample dataset. The release-check UI and disabled-by-default developer preview entry point call these loaders. Normal user data is not replaced by sample data.

## Cache and deployment

The worker installs a small shell and limits warming to three concurrent requests. Remaining active scripts warm after launch; Save-Data skips optional warming. Export engines, diagnostic datasets and device-specific launch images cache only on use. Whitelisted scope-relative paths exclude APIs and business data. One preceding cache generation supports already-open tabs; legacy URL aliases allow the folder migration. Unknown routes bypass the static cache.

`npm run build` exports only public runtime assets. Staging's Pages workflow uses this export. Production currently uses its existing branch-based Pages deployment; historical archives remain in the repository and may be directly addressable, though the app never loads them. Changing production hosting source requires a separate hosting configuration change.

## Repository boundaries and future extraction

Small fixes go through the live repository's PR/CI flow. New features begin on staging. Staging retains its own CNAME, public Supabase binding and test-login helper. Its loader fails closed if the binding is unavailable. Gesture G1 is disabled under `experiments/gestures/` and preserved on `archive/gestures-g1-20260922` in the staging repository.

The core is still around 1.6 MB uncompressed. Next extractions should give one feature explicit inputs and regression coverage at a time. Accounting/persistence rewrites, wholesale partner-wrapper consolidation and a framework migration are not part of this cleanup. The local maintainer checkout is `C:\RETRADE-UK\RETRADE`.

## Release v1.5.70 — sync and interaction reconciliation (24 September)

Startup HTML uses the manifest build ID for every local script/style. The worker
honours explicit generation requests: an old tab receives its exact cached
asset when available, otherwise a revalidated network request, never a silent
substitution from the active cache. Business data and API responses remain outside
this cache. `check-assets.cjs` rejects startup version drift.

`navigation.js` owns the chrome layer order (navigation 350, FAB 360, search 370,
forms 400+). The mobile FAB has a stable, untransformed anchor. Closed options,
sheets and panels are inert; notifications cannot intercept taps. The core owns
dial dismissal and accessibility state. Core navigation alone owns FAB visibility; interface motion does not maintain a second visibility state.

The item revision guard records conflicts but leaves user feedback to the existing
bounded recovery/persistence owner. Successful reconciliation no longer displays
a premature reload error. Compare-and-swap protection, unresolved outbox retention
and cloud deletion protection remain enabled. No accounting rules or database
schema are changed by this shared release.

Validation: `npm run check`, `npm test`, `npm run build`, and the production
checkout's `node scripts/compare-staging.cjs ../staging`. The comparison strips only
the declared staging monitor hooks and rejects any other shared-runtime drift.
Browser tests use isolated data, actual pointer actions and mobile/desktop layouts;
they do not prove physical iOS/Android frame pacing or live account synchronization.

## Release v1.5.76 — stable partner rendering and shorter Tax workspace

Partner presentation remains in the existing ordered modules. `page-unified-v1503.js`
finishes registered presentation callbacks synchronously after the account renderer,
before the first paint. The list renderer calls `__rtPartnersListPolish` directly;
the compact list no longer observes and rewrites its own mutations. Payment allocation
renders with the account and starts collapsed, preserving the user's later choice.
Unsettled stock without a payable amount remains visible with a reason and item link;
only known unpaid liabilities can enter a payment.

Core sync status reconciles against the writer on resume and while saving. After
15 seconds it shows static pending status, retaining the writer and durable queue.
Tax uses session-only Overview, Filing guide and Monthly sections; calculations and
export totals are unchanged. Sales normalises retired date-listed route state to
sale-date sorting so day headings remain available.

Regression coverage includes initial partner frames, unsold payment eligibility,
Tax view controls and accounting totals, legacy Sales sorting and bounded sync motion.


### Audit v1.2 completion

- The final v1.1 draft was recovered from its uncommitted checkout and validated
  against production `67b8f72`; it was not an already deployed release.
- Early route rendering waits for ordered deferred modules. Queued renderers are
  resolved at execution time; cancelled routes cannot reappear after loading.
- Obsolete partner transition shells and navigation wrappers are removed. Partner
  presentation finalizers and settlement export controls finish synchronously.
  Account identity uses the stable account ID, not a display-name match.
- Core owns the FAB on every authenticated route. Routes without a specific
  creation action use the normal quick-add menu. Navigation remains fixed while
  scrolling; dialogs retain the existing higher layer order.
- The route progress line is removed. Slow sync becomes a stationary pending
  state after 15 seconds; completed sync clears the mobile indicator. Writer,
  durable outbox and conflict handling remain authoritative and unchanged.
- Pending Sales, Tax and Cashflow surfaces use their current responsive layout
  classes. Yearly Sales uses the same chart markup and dimensions as the loaded
  view. Warm pages retain their contents rather than flashing a skeleton.
- Tax has Overview / Filing guide / Monthly sections. Tax settings, reconciliation
  and payment detail are collapsible. Other income remains visible in the tax KPI.
- Partner unsettled stock exposes unsold fixed-cost items for advance payment and
  shows percentage-only items with an explanation rather than silently omitting
  them. Own-stock source-date expenses and partner transaction-date expenses are
  covered separately; paying early does not record a sale or create a second cost.
- `tests/ui-regressions-browser.cjs` covers slow module loading, cancelled routes,
  current loading layouts, every main route's navigation/FAB and sync completion.
  Partner tests additionally cover first-frame stability, advance-payment cash/tax
  timing, sale-after-payment deduplication and account/item context isolation.

No database migration or production-data edits. Gestures and monitoring remain
outside the production manifest. This release targets the live repository only.

### v1.5.77 — mixed partner payment selection

`payment-allocations-v2.js` allows eligible upfront fixed costs and sold-item
profit shares in one payment. Candidate eligibility and each allocation's legacy
accounting kind remain authoritative. Mixed payments have no transaction-level
profit/share subtotal: unsold asking prices must never become realised profit.
Sold profit-share-only payments retain their existing share summary.
`partner-upfront-browser.cjs` reproduces the blocked four-by-£39 selection on
mobile and desktop, checking payment-date expenses, individual allocations,
unchanged sale states, cashflow and deduction after a subsequent sale.

### v1.5.78 — disclosure scroll and recovery presentation audit

Core is the sole owner of fiscal-year disclosure defaults and state. Year grids
remain mounted while closed, so the first expansion never rebuilds the chart or
entire Sales page. FY headers support keyboard activation and `aria-expanded`.
The core month badge is the only NOW label; calendar CSS no longer adds a second.
`navigation.js` disables document scroll anchoring at the root as well as the
page: content outside a page must not move the viewport during a disclosure.
Explicit route/back scroll restoration and normal end-of-document clamping remain.

Successful stale-device quarantine remains logged and recoverable but no longer
raises a repeated warning toast. Storage failures still retain pending work and
set a visible sync error. Revision checks, cloud precedence and quarantine data
are unchanged; there are no database changes.

`scroll-browser.cjs` checks repeated pointer/touch disclosure actions, DOM identity,
hit targets and scroll offsets across mobile, desktop and reduced-motion layouts.
Coverage includes fiscal years, Stock groups, partner groups/unsettled items, item
details and native disclosures in Tax, Cashflow and the other main routes. A
shorter document may naturally clamp its bottom scroll limit; that is not a reset.
Physical iPhone Safari frame pacing is not established by these Chromium tests.

### v1.5.79 — mobile scale and item profit presentation

`responsive.css` gives every mobile page consistent gutters, headings, buttons,
metric sizes and card spacing. Long Dashboard/Sourcing headings and partner
action bars can wrap. Editable fields retain 16px text to prevent iOS focus zoom.
Item receipts constrain their platform selector to the card and use lighter,
aligned money controls. Navigation positioning, layer order and disclosure
scroll behaviour stay with their existing owners.

The item receipt displays its canonical net plus partner deduction as the total
before partner, followed by the deduction and retained profit. A matching agreed
percentage is shown when applicable; otherwise a positive total shows the
effective share. Fixed payouts have their own label, and zero/loss totals do not
show a percentage. Expected stock profit remains explicitly labelled expected;
subsequent sale cards identify the sale cycle. No accounting or persistence rules
change. Item browser coverage verifies the bridge and narrow selector containment.


### v1.5.80 — shared workspace presentation and cashflow details

Stock and monthly Sales use a primary metric with aligned supporting cards,
sharing the Dashboard/Cashflow surface, spacing and typography. Their loading
markup uses the same layout classes. `workspaces.css` also aligns cards and rows
across Sales calendar, Costs, Sourcing, Partners, Tax and the remaining pages;
mobile input sizing and navigation layers retain their existing owners.

Every cashflow row opens a source-backed detail panel, including results after
search/filter updates. Manual entries and expenses lead to their existing editors;
item, sale and return movements link to the item; trip costs link to the trip.
The enhanced ledger is rebuilt after local filter results without replacing the
search input. Filtered results include the complete matching history, while the
initial ledger keeps its existing recent/history paging. No cash calculations or
export totals change.

Partner payments show their date, note, individual item allocations, any non-cash
credits and the actual cash amount. Item links preserve the Cashflow return route.
The existing settlement detail owner permits date/note amendments and exposes the
existing paid/reverse actions and partner account. Metadata edits preserve all
amounts, allocation snapshots and paid-at timestamps; the deterministic audit row
is updated once, and the active page refreshes after source edits or reversal.
Opening details performs no writes. Missing item records remain visible by their
allocation name, with no invented link. No database migration is required.

`cashflow-browser.cjs` uses synthetic mobile/desktop data to exercise the four-by-£39
payment, source links, metadata/manual/expense edits, search, account credits and
reversal, including unchanged allocation totals and cash-event deduplication.

### v1.5.81 — compact workspace headers and useful sourcing history

`workspaces.css` owns compact Sales/Stock metric surfaces and collection toolbars,
plus adaptive Sourcing rows. Core renders those structures and their pending
summaries synchronously. `tax.css` owns the paired year caption/selector.
The Accounts title is emitted by its existing operations renderer.

Sourcing history no longer regroups sorted runs into month disclosures. Core
sorts the complete history, caches per-render run metrics, and applies search
without replacing its input. The existing saved sort preference now consistently
uses `window._RUNS_SORT`; no business data is written by these controls.
`tests/workspace-browser.cjs` covers ranking, searching, drill-down and compact
header geometry. See `docs/audits/WORKSPACE_UX_2026-09-26.md` for research and scope.

### v1.5.83 — loading layout and Sales endpoint audit

Route placeholders wait 300 ms, reuse current workspace classes, and cancel on
completion/navigation. Warm content stays mounted. Boot still uses its real
Dashboard tree but no longer has a fixed minimum loading hold. A shared live
status sits outside busy pages; decorative shells are inert. The old competing
Sales loading CSS is retired. Current-month emphasis and refund endpoint timing
remain owned by the calendar and chart-sequence modules. See
`docs/audits/LOADING_UX_2026-09-26.md` for policy, research and verification limits.
