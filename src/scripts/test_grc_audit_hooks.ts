import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { createFramework } from '../lib/grc/grcFrameworkService';
import { createControl } from '../lib/grc/grcControlsService';
import { bulkLinkEvidence } from '../lib/grc/grcEvidenceService';
import { createSnapshot } from '../lib/grc/grcSnapshotsService';
import { logger } from '../lib/logger';

// Load .env manually to avoid adding a new dependency
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf-8');
    for (const line of envFile.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[key] = value;
      }
    }
  }
} catch (e) {}

// We must override the supabase client inside those services or just run this in an environment where the client naturally connects to a live DB.
// Note: This script assumes you run it locally against testing data.

async function runGrcAuditTest() {
  // console.log('🔄 Starting GRC Audit Test...');

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || '',
    { auth: { persistSession: false } }
  );

  // 1. Find a valid company_id and admin user_id
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, company_id')
    .eq('role', 'admin')
    .not('company_id', 'is', null)
    .limit(1)
    .single();

  if (!profile) {
    logger.error('❌ Could not find a valid admin profile with a company_id.');
    return;
  }

  const { id: userId, company_id: companyId } = profile;
  // console.log(`✅ Using User: ${userId}, Company: ${companyId}`);

  // Need to log in or use admin token if the service layer uses default client. Usually, we mock the auth.
  // We assume the services export functions taking userId and companyId directly and the DB allows it due to the environment.

  // 2. Create Framework
  // console.log('📝 Creating Framework...');
  const framework = await createFramework(
    { company_id: companyId, name: 'ISMS Audit Test', version: 'v1.0.0', status: 'draft' },
    userId
  );

  if (!framework) throw new Error('Framework creation failed');
  // console.log(`✅ Framework Created: ${framework.id}`);

  // 3. Create Control
  // console.log('📝 Creating Control...');
  const control = await createControl(
    { company_id: companyId, framework_id: framework.id, title: 'Network Security', reference_code: 'NS-01', status: 'active' },
    userId
  );

  if (!control) throw new Error('Control creation failed');
  // console.log(`✅ Control Created: ${control.id}`);

  // 4. Find an existing Document to link (Content Submission)
  const { data: submission } = await supabaseAdmin
    .from('content_submissions')
    .select('id')
    .eq('company_id', companyId)
    .limit(1)
    .single();

  // 5. Link Evidence
  if (submission) {
    // console.log('📝 Linking Evidence...');
    const linked = await bulkLinkEvidence(control.id, [submission.id], companyId, userId);
    if (!linked) throw new Error('Evidence linking failed');
    // console.log(`✅ Evidence Linked: ${link.id}`);
  } else {
    logger.warn('⚠️ Skipping evidence linking test — no dummy content_submission found for this company.');
  }

  // 6. Set Snapshot
  // console.log('📝 Creating Snapshot...');
  const snapshot = await createSnapshot(
    { company_id: companyId, control_id: control.id, status: 'partial', notes: 'Audit script test' },
    userId
  );
  if (!snapshot) throw new Error('Snapshot creation failed');
  // console.log(`✅ Snapshot Created: ${snapshot.id}`);

  // 7. Verify Audit Logs
  // console.log('🔍 Checking Audit Logs...');
  const { data: logs, error } = await supabaseAdmin
    .from('audit_logs')
    .select('action, entity_type, entity_id, company_id')
    .in('action', ['create_framework', 'create_control', 'link_evidence', 'set_snapshot'])
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(4);

  if (error || !logs || logs.length === 0) {
    logger.error('❌ Audit logs check failed:', error);
  } else {
    // console.log('[SUCCESS] Audit logs verified:');
    console.table(logs);
  }

  // console.log('✅ Done.');
}

runGrcAuditTest().catch(console.error);
