/**
 * WITHDRAWN — THIS SCRIPT MUST NOT BE RUN.
 *
 * It is kept because the facts it records are evidence, and deleting
 * it would delete the only account of what was done to the audit
 * chain of company da3f4665-074b-4d6a-8866-e4c7ea84f3dc. The
 * executable part is gone.
 *
 * ── WHAT IT DID ──
 *
 *   1. Inserted a CHAIN_REANCHOR entry at sequence 7 with
 *      created_at = 2026-02-25T15:08:15.000000+00:00, chosen to sit
 *      "1 second before seq 8" — a HISTORICAL TIMESTAMP THAT IS NOT
 *      WHEN THE ROW WAS WRITTEN.
 *   2. UPDATEd the existing sequence-8 entry's previous_hash to point
 *      at the new entry, so the chain would verify across the gap.
 *
 * Step 2 is a rewrite of an audit record. Step 1 back-dates one. The
 * combination makes a chain with a missing entry verify as intact,
 * which is retroactively claiming verification.
 *
 * ── IT RAN ──
 *
 * The live project (ref ovxfflilbqaxedzovgmz) holds one CHAIN_REANCHOR
 * entry and a sequence 7 for that company, with that exact
 * created_at. It is in docs/audit-threat-model.md and in the readiness
 * report, and it is NOT being undone: rewriting history to tidy up a
 * rewrite of history is the same act twice.
 *
 * ── WHY IT CANNOT BE THE ANSWER ──
 *
 * The decision taken for this product is: preserve existing entries
 * and timestamps; mark what cannot be verified as legacy/unverified
 * and record the reason; never fabricate hashes or retroactively
 * claim verification. A gap in a chain is a FINDING. The honest
 * treatment is to report it, which verify_audit_chain now does — it
 * names the first entry whose linkage or contents do not hold, instead
 * of filtering unhashed entries out of the query as the old version
 * did.
 *
 * Since 20261116000000 the write in step 2 is refused by
 * trg_block_audit_update, and since 20261108000000 the insert in step
 * 1 would be re-sealed by the server and would not carry the hash,
 * sequence number or previous_hash this script computed. So it could
 * not work now even if it were run.
 */

throw new Error(
  'repair_audit_chain.mjs is withdrawn: it back-dates an audit entry and rewrites ' +
  'another entry\'s previous_hash. See the comment at the top of this file and ' +
  'docs/audit-threat-model.md.',
);
