import { runAuditSimulation, getAuditSimulations, getAuditFindings } from './lib/mockAuditorService';
import { logger } from './lib/logger';

async function verifyPhase8() {
  // console.log('--- Phase 8: Virtual Audit Simulation Verification ---');

  const companyId = '00000000-0000-0000-0000-000000000000'; // Mock

  // console.log('Running HIPAA Simulation...');
  const sim = await runAuditSimulation(companyId, 'HIPAA');

  if (!sim) {
    logger.error('Audit Simulation failed');
    return;
  }

  // console.log(`Simulation complete! Score: ${sim.score}`);
  // console.log(`Summary: ${sim.summary}`);

  const findings = await getAuditFindings(sim.id);
  // console.log(`\nFound ${findings.length} blind spots:`);
  
  findings.forEach((f, i) => {
    // console.log(`[${i+1}] ${f.severity.toUpperCase()} - ${f.title}`);
    // console.log(`    Category: ${f.category}`);
    // console.log(`    Fix: ${f.remediation_advice}`);
  });

  if (sim.score > 0 && findings.length > 0) {
    // console.log('\nSUCCESS: Virtual Audit Simulation generated results and findings.');
  } else {
    // console.log('\nWARNING: Simulation returned empty or zero results.');
  }
}

verifyPhase8().catch(console.error);
