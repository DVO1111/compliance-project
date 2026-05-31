import { supabase } from './lib/supabase';
import { generatePolicyDraft, savePolicyDraft } from './lib/policyAssistantService';
import { logger } from './lib/logger';

async function verifyPhase9() {
  // console.log('🚀 Starting Phase 9 Verification: AI Policy Assistant');

  try {
    // 1. Test Policy Generation
    // console.log('📝 Testing Policy Generation...');
    const prompt = 'Draft a brief Telehealth Privacy Policy for the 2026 NAFDAC circular';
    const draft = await generatePolicyDraft(prompt, 'privacy');

    if (draft && draft.title && draft.content) {
      // console.log('✅ Policy Generated Successfully!');
      // console.log('Title:', draft.title);
      
      // Check for regulatory context (QR code requirement from NAFDAC 2026 circular)
      if (draft.content.toLowerCase().includes('qr') || draft.content.toLowerCase().includes('code')) {
        // console.log('✅ Regulatory Context (QR Code) detected in draft!');
      } else {
        // console.log('⚠️ Regulatory Context (QR Code) NOT explicitly detected, but draft was generated.');
      }

      // 2. Test Saving Draft
      // console.log('💾 Testing Save Draft...');
      // We need a company_id for this. Usually there is a default one in seed or we can fetch one.
      const { data: companies } = await (supabase as any).from('companies').select('id').limit(1);
      if (companies && companies.length > 0) {
        const success = await savePolicyDraft(companies[0].id, draft.title, draft.content);
        if (success) {
          // console.log('✅ Policy Draft Saved to Database!');
        } else {
          // console.log('❌ Failed to save policy draft.');
        }
      } else {
        // console.log('⚠️ No company found to test saving draft.');
      }
    } else {
      // console.log('❌ Policy Generation Failed.');
    }

  } catch (error) {
    logger.error('❌ Verification Error:', error);
  }
}

verifyPhase9();
