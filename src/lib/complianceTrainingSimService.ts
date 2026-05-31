import { supabase } from './supabase';
import { logger } from './logger';

export type ScenarioType = 'off_label_question' | 'misleading_claim' | 'unsubstantiated_superlative' | 'adverse_event_report' | 'social_media_post' | 'agency_review';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export type TrainingScenario = {
  id: string; company_id: string; title: string; description: string;
  scenario_type: ScenarioType; difficulty: Difficulty; scenario_text: string;
  correct_response: string; explanation: string; active: boolean; created_at: string;
};

export type ScenarioAttempt = {
  id: string; scenario_id: string; user_id: string; user_response: string;
  score: number; passed: boolean; feedback: string | null; attempted_at: string;
};

export async function getScenarios(companyId: string): Promise<TrainingScenario[]> {
  const { data, error } = await (supabase as any).from('training_scenarios').select('*').eq('company_id', companyId).eq('active', true).order('created_at', { ascending: false });
  if (error) { logger.error('getScenarios:', error); return []; }
  return data ?? [];
}

export async function createScenario(companyId: string, s: { title: string; description: string; scenario_type: ScenarioType; difficulty: Difficulty; scenario_text: string; correct_response: string; explanation: string }): Promise<TrainingScenario | null> {
  const { data, error } = await (supabase as any).from('training_scenarios').insert({ company_id: companyId, ...s, active: true }).select().single();
  if (error) { logger.error('createScenario:', error); return null; }
  return data;
}

export async function submitAttempt(scenarioId: string, userId: string, response: string, correctResponse: string): Promise<ScenarioAttempt | null> {
  // Simple scoring: compare key phrases
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  const correctWords = new Set(normalize(correctResponse));
  const userWords = normalize(response);
  const matches = userWords.filter(w => correctWords.has(w)).length;
  const score = Math.min(100, Math.round((matches / Math.max(correctWords.size, 1)) * 100));
  const passed = score >= 60;
  const feedback = passed ? 'Good understanding demonstrated. Key compliance principles correctly identified.' : 'Review needed. Some key compliance points were missed. Please review the explanation.';

  const { data, error } = await (supabase as any).from('scenario_attempts').insert({ scenario_id: scenarioId, user_id: userId, user_response: response, score, passed, feedback }).select().single();
  if (error) { logger.error('submitAttempt:', error); return null; }
  return data;
}

export async function getMyAttempts(userId: string): Promise<ScenarioAttempt[]> {
  const { data, error } = await (supabase as any).from('scenario_attempts').select('*').eq('user_id', userId).order('attempted_at', { ascending: false });
  if (error) { logger.error('getMyAttempts:', error); return []; }
  return data ?? [];
}

export const SCENARIO_TYPES: { id: ScenarioType; label: string }[] = [
  { id: 'off_label_question', label: 'Off-Label Question' }, { id: 'misleading_claim', label: 'Misleading Claim' },
  { id: 'unsubstantiated_superlative', label: 'Unsubstantiated Superlative' }, { id: 'adverse_event_report', label: 'Adverse Event Report' },
  { id: 'social_media_post', label: 'Social Media Post' }, { id: 'agency_review', label: 'Agency Review' },
];
