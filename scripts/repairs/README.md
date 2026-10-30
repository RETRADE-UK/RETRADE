# Verified stock repair methods

These parameterized SQL blocks capture the production repair methods used on 30 October 2026. They are one-off guarded data repairs, not migrations or startup scripts. Runtime support was delivered in PR #106.

Private payloads, account snapshots, orders, allocations, return evidence and payment details remain in separate pre/post audit backups. Never commit those data files here.

To review or reproduce a repair: obtain authorization and a fresh scoped backup; supply the appropriate transaction-local setting inside BEGIN; execute the matching SQL block; first use ROLLBACK and verify the intended runtime outcome. Before a real commit, compare the current account and affected cash rows against the backup. Existing item/display IDs abort the import. Normal ownership, revision and sync triggers remain enabled. Capture readback and rerun the accounting controls after COMMIT.

- `import-donated-sales.sql`: zero-cost sold inventory, fixed supplier agreement, removal of an exact duplicate owner receipt and description-only correction of the unchanged withdrawal. The earliest-sale bound is the cutoff used for this specific repair method.
- `import-paid-stock.sql`: fixed-cost inventory, refund records with generated IDs remapped into fee evidence, and a single historical settlement encoded in the account metadata. The supplied allocation must total the payment. An unknown exact payment date remains null and needs later bank matching.

Both methods passed transaction rollback trials before the production run. Post-run controls checked costs, refund links, one payment event, zero outstanding supplier liability and unchanged withdrawal amounts. These blocks are intentionally not rerunnable after success: collisions stop accidental duplication. Never retry an unknown save outcome until readback establishes what committed.

Rollback is a separate, reviewed inverse transaction using the private before/after records. Do not replay the old payload or reset sequence values consumed by rollback trials.
