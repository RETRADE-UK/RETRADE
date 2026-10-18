# Partner outstanding clarity — live — 18 October 2026

This release ports the staging-tested partner outstanding workflow onto current live
without replacing unrelated live account-summary logic.

- **Sold outstanding** is the default payment view.
- **All stock outstanding** adds known unpaid fixed commitments on unsold stock.
- Sold fixed-cost items with no stored payout remain selectable and open payout
  setup instead of appearing disabled.
- Multiple missing fixed payouts can be entered together before recording payment.
- Payment creation is blocked while selected rows still need payout terms.
- The account summary shows Sold outstanding and All stock separately.
- Already-assigned unpaid items remain non-selectable to prevent duplicate allocation.

Setting payout terms never changes sale/listing state and does not itself create a
cash event. Existing payment allocation, account credit, tax/cash timing and
duplicate-payment rules remain authoritative.

No database migration or data repair is included. Build: `20261018-partner-outstanding`.
