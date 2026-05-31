import { addMention, getMentions, runSocialAIAnalysis } from './lib/socialListeningService';
import { logger } from './lib/logger';

async function verifyPhase7() {
  // console.log('--- Phase 7: Social Listening Compliance Verification ---');

  const companyId = '00000000-0000-0000-0000-000000000000'; // Mock company ID

  // console.log('Logging a risky mention: "DrugX is the best for off-label use!"...');
  const mention = await addMention(companyId, {
    platform: 'X',
    author: 'ComplianceTester',
    author_type: 'influencer',
    content: 'I have been using DrugX for off-label weight loss and it works magic! No side effects at all. #DrugX #WeightLoss',
    url: 'https://x.com/tester/status/123'
  });

  if (!mention) {
    logger.error('Failed to log mention');
    return;
  }

  // console.log(`Mention logged with ID: ${mention.id}`);
  // console.log('Waiting for AI analysis to complete (simulated)...');
  
  // The addMention call triggers it in background, but we'll call it manually to wait for result
  const ok = await runSocialAIAnalysis(mention.id);
  
  if (!ok) {
    logger.error('AI Analysis failed');
    return;
  }

  const all = await getMentions(companyId);
  const updated = all.find(m => m.id === mention.id);

  if (updated) {
    // console.log('\n--- AI Analysis Results ---');
    // console.log(`Compliance Flag: ${updated.flag_type}`);
    // console.log(`Sentiment: ${updated.sentiment}`);
    // console.log(`Severity: ${updated.severity}`);
    // console.log(`AI Analysis: ${updated.ai_analysis}`);
    // console.log(`Action Recommendation: ${updated.ai_recommendation}`);

    if (updated.flag_type === 'off_label' || updated.flag_type === 'misleading_claim') {
      // console.log('\nSUCCESS: AI correctly flagged off-label promotion.');
    } else {
      // console.log('\nFAILURE: AI missed the compliance violation.');
    }
  } else {
    logger.error('Could not find updated mention');
  }
}

verifyPhase7().catch(console.error);
