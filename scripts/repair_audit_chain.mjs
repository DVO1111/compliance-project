/**
 * One-time audit chain repair script.
 *
 * The audit chain for company da3f4665-074b-4d6a-8866-e4c7ea84f3dc has a gap
 * at sequence 7 — the entry was lost due to a failed concurrent transaction on
 * 2026-02-25. Sequences 1–6 and 8–63 are independently intact.
 *
 * Repair strategy (forensic gap disclosure):
 *   1. Insert a CHAIN_REANCHOR entry at sequence 7, linking from seq 6's hash.
 *      This entry documents the gap transparently in the audit record itself.
 *   2. Update seq 8's previous_hash to point to the new entry's hash,
 *      restoring chain continuity from seq 7 onward.
 *
 * Run once: node scripts/repair_audit_chain.mjs
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = 'https://ovxfflilbqaxedzovgmz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92eGZmbGlsYnFheGVkem92Z216Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwODc3OTYsImV4cCI6MjA4NjY2Mzc5Nn0.HSUEnM_wSVQbXAR6Ey0Dn7CdhSQW5QcqZa6S4HlsluM';

const COMPANY_ID   = 'da3f4665-074b-4d6a-8866-e4c7ea84f3dc';
const SEQ6_HASH    = '1df7c603207c5934c9895cbfb5cd79abd30a9aaa439b0e7d5e7bc04d3464c50b';
const SEQ8_ID      = '5cc4594f-96b1-4b7f-ba29-d5d83ea5b078';
const SEQ8_ORIG_PREV = '1dad2bba5328e5bec51abbf13532e57b8b49af05e7489963c6dca4989cbcfc37';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Must match the hash payload format in auditService.ts exactly
function buildHashPayload({ action, entityType, entityId, userId, metadata, createdAt, previousHash, sequenceNumber }) {
  return [
    action,
    entityType,
    entityId,
    userId,
    JSON.stringify(metadata),
    createdAt,
    previousHash,
    String(sequenceNumber),
  ].join('|');
}

function sha256(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

async function run() {
  console.log('=== Audit Chain Repair ===\n');

  // ── Step 1: Verify the break still exists ──────────────────────────────
  console.log('Step 1: Verifying chain break at sequence 8...');
  const { data: seq8, error: e8 } = await supabase
    .from('audit_logs')
    .select('id, previous_hash, sequence_number')
    .eq('id', SEQ8_ID)
    .maybeSingle();

  if (e8 || !seq8) {
    console.error('ERROR: Could not fetch seq 8 entry:', e8?.message);
    process.exit(1);
  }

  if (seq8.previous_hash === SEQ6_HASH) {
    console.log('Chain appears already repaired. Aborting.');
    process.exit(0);
  }

  if (seq8.previous_hash !== SEQ8_ORIG_PREV) {
    console.error('ERROR: seq 8 previous_hash has changed unexpectedly. Manual inspection required.');
    console.error('  Found:    ', seq8.previous_hash);
    console.error('  Expected: ', SEQ8_ORIG_PREV);
    process.exit(1);
  }

  console.log('  Break confirmed. Proceeding with repair.\n');

  // ── Step 2: Build the CHAIN_REANCHOR entry ─────────────────────────────
  const action = 'CHAIN_REANCHOR';
  const entityType = 'audit_chain';
  const entityId = COMPANY_ID;
  const userId = 'system';
  const createdAt = '2026-02-25T15:08:15.000000+00:00'; // 1 second before seq 8
  const previousHash = SEQ6_HASH;
  const sequenceNumber = 7;
  const metadata = {
    reason: 'Gap detected at sequence 7. Entry was lost due to a failed concurrent transaction on 2026-02-25. Sequences 1–6 and 8–63 are independently verified intact. This entry re-anchors the chain with full forensic disclosure.',
    gap_sequence: 7,
    seq6_hash: SEQ6_HASH,
    seq8_id: SEQ8_ID,
    seq8_original_previous_hash: SEQ8_ORIG_PREV,
    repaired_at: new Date().toISOString(),
    repair_method: 'forensic_gap_disclosure',
  };

  const payload = buildHashPayload({ action, entityType, entityId, userId, metadata, createdAt, previousHash, sequenceNumber });
  const integrityHash = sha256(payload);

  console.log('Step 2: Computed CHAIN_REANCHOR entry:');
  console.log('  sequence_number :', sequenceNumber);
  console.log('  previous_hash   :', previousHash.slice(0, 20) + '...');
  console.log('  integrity_hash  :', integrityHash.slice(0, 20) + '...');
  console.log('  created_at      :', createdAt);

  // ── Step 3: Insert the CHAIN_REANCHOR entry ────────────────────────────
  console.log('\nStep 3: Inserting CHAIN_REANCHOR entry...');
  const { data: inserted, error: insertErr } = await supabase
    .from('audit_logs')
    .insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      user_id: userId,
      company_id: COMPANY_ID,
      metadata,
      integrity_hash: integrityHash,
      previous_hash: previousHash,
      sequence_number: sequenceNumber,
      created_at: createdAt,
      evidence_snapshot: {},
    })
    .select()
    .single();

  if (insertErr) {
    console.error('ERROR inserting CHAIN_REANCHOR:', insertErr.message);
    process.exit(1);
  }

  console.log('  Inserted entry id:', inserted.id);

  // ── Step 4: Update seq 8's previous_hash ──────────────────────────────
  console.log('\nStep 4: Updating seq 8 previous_hash to link to CHAIN_REANCHOR...');
  const { error: updateErr } = await supabase
    .from('audit_logs')
    .update({ previous_hash: integrityHash })
    .eq('id', SEQ8_ID);

  if (updateErr) {
    console.error('ERROR updating seq 8 previous_hash:', updateErr.message);
    console.error('');
    console.error('The CHAIN_REANCHOR entry was inserted but seq 8 could not be updated.');
    console.error('This likely means RLS blocks updates on audit_logs.');
    console.error('You need to run this update directly in Supabase SQL Editor:');
    console.error('');
    console.error(`UPDATE audit_logs SET previous_hash = '${integrityHash}' WHERE id = '${SEQ8_ID}';`);
    process.exit(1);
  }

  console.log('  Seq 8 previous_hash updated successfully.');

  // ── Step 5: Verify the repair ─────────────────────────────────────────
  console.log('\nStep 5: Verifying repair...');
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('id, integrity_hash, previous_hash, sequence_number')
    .eq('company_id', COMPANY_ID)
    .not('integrity_hash', 'is', null)
    .order('sequence_number', { ascending: true });

  let valid = true;
  let expectedPrev = 'GENESIS';
  let brokenAt = null;

  for (const log of logs) {
    if (log.previous_hash !== expectedPrev) {
      valid = false;
      brokenAt = log.sequence_number;
      break;
    }
    expectedPrev = log.integrity_hash;
  }

  if (valid) {
    console.log(`  ✓ Chain verified — ${logs.length} entries, no breaks detected.`);
    console.log('\n=== Repair complete ===');
  } else {
    console.error(`  ✗ Chain still broken at sequence ${brokenAt}. Manual inspection required.`);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
