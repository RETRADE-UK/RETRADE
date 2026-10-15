# Partner fixed-cost advance payments — 15 October 2026

The partner account stock list and Unsettled items previously disagreed for fixed
amounts entered through legacy split controls. Missing/null canonical amounts
could become zero, unsold fixed agreements could inherit profit-share eligibility,
and the bulk payment bar used a separate sold-only debt calculation.

## Ownership and safety

- `arrangements-v2.js` resolves missing values without losing genuine zero amounts,
  recognises explicit legacy fixed agreements on never-sold stock, and adapts the
  existing single/bulk terms writers so canonical and legacy fields save together.
  Historic paid shares and explicit percentage overrides retain their model.
- `payment-allocations-v2.js` is the shared eligibility and transaction owner for
  the bulk bar and Unsettled items. Both use remaining amounts after paid and
  unpaid allocations. Confirmation rejects changed items/amounts instead of
  silently repricing the payment.
- `actions-v2.js` delegates to that transaction owner; its second payment writer
  is removed. Account credits and save-failure rollback use the existing workflow.

No database migration, business-data repair, payment execution, stock-state change,
core accounting rewrite or script-order change is part of this release. An advance
payment is recorded only when the user confirms it. Unsold percentage-only items
still need a completed sale (or a deliberately entered fixed agreement).

## Cache and assets

Build `20261015-partner-fixed-upfront` is shared by `config/assets.js` and all
versioned entry assets in `index.html`. The existing icon files replace their
inline copies: `assets/icons/app-180.png` and `assets/icons/app-32.png` were verified
byte-for-byte against the decoded previous data URIs. Both already belong to the
service-worker shell allowlist. No logo pixels or script order change.

## Verification

`npm run check` includes `tests/partner-fixed-upfront.cjs`: legacy/null/zero fields,
terms entry/reload, nine-item payments, paid/unpaid allocation reservations, credits,
stale confirmation, save rollback and sale-after-payment deduplication.

`npm test` includes `tests/partner-fixed-upfront-browser.cjs`; CI also runs it in
WebKit. It checks both payment entry points on mobile and desktop, the displayed
amounts, unchanged unlisted status and payment-date cash/tax deduction once only.
The browser harness uses synthetic data and blocks external requests. Physical
iPhone behaviour and this user's actual database rows are not asserted by tests.

Local unit/static checks and the public build passed. CI run 38719943272 on the
initial functional commit passed both jobs, including the new WebKit scenarios and
full browser suite. The cache-version commit must pass CI again before merge.

Rollback is a normal PR reverting this change; no database rollback is required.
