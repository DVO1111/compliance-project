import { submitReport, runWhistleblowerTriage, getReports } from './lib/whistleblowerService';
import { supabase } from './lib/supabase';
import { logger } from './lib/logger';

async function verifyPhase5() {
  // console.log('--- Phase 5: Automated Whistleblower Triage Verification ---');

  const { data: profiles } = await supabase.from('profiles').select('company_id, id').limit(1);
  if (!profiles || profiles.length === 0) {
    logger.error('No profile found.');
    return;
  }
  const companyId = profiles[0].company_id || '';
  const userId = profiles[0].id || '';

  // console.log('Submitting report...');
  const report = await submitReport(companyId, userId, {
    category: 'kickback_concern',
    subject: 'High-Level Kickback Allegation',
    description: 'The VP of Sales is allegedly taking kickbacks from the new logistics partner in exchange for a 5-year exclusive contract. Estimated loss to company is over $2M.',
    priority: 'medium',
    anonymous: true
  });

  if (!report) return;

  // console.log(`Report ID: ${report.id}. Running AI Triage...`);
  const result = await runWhistleblowerTriage(report.id);

  if (result.success) {
    // console.log('AI Triage Success!');
    const reports = await getReports(companyId);
    const updated = reports.find(r => r.id === report.id);
    // console.log(`Escalated Priority: ${updated?.priority}`);
    
    const aiUpdate = updated?.updates?.find(u => u.action === 'AI Triage Complete');
    if (aiUpdate) {
      // console.log(`Intake Note: ${aiUpdate.note}`);
    }
  } else {
    // console.log('AI Triage Failed.');
  }
}

verifyPhase5().catch(console.error);
