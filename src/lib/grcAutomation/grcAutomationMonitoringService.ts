import { supabase } from '../supabase';
import { providerRegistry } from '../../integrations';

export interface AutomationHealthMetrics {
  totalEnabled: number;
  overdueCount: number;
  failingCount: number;
  erroringCount: number;
  flappingCount: number;
  dailyRuns: number;
}

export interface TestHealth {
  testId: string;
  successRate7d: number;
  errorRate7d: number;
  flappingScore: number;
  isOverdue: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface ProviderHealth {
  providerId: string;
  providerName: string;
  totalRuns24h: number;
  errorRate: number;
  failingTestsCount: number;
}

/**
 * Derives health metrics for GRC Automation.
 * Reuses existing indexes on company_id, test_id, and executed_at.
 */
export const grcAutomationMonitoringService = {
  async getGlobalHealth(companyId: string): Promise<AutomationHealthMetrics> {
    const now = new Date().toISOString();
    const overdueThreshold = new Date(Date.now() - 30 * 60000).toISOString(); // 30m overdue

    // 1. Get enabled tests and overdue status
    const { data: tests } = await (supabase as any)
      .from('grc_control_tests')
      .select('id, next_run_at, enabled')
      .eq('company_id', companyId)
      .eq('enabled', true);

    const overdueTests = tests?.filter((t: any) => t.next_run_at && t.next_run_at < overdueThreshold) || [];

    // 2. Get latest runs for failing/erroring count
    // We'll query runs from the last 24h to see current stance
    const dayAgo = new Date(Date.now() - 24 * 60 * 60000).toISOString();
    const { data: recentRuns } = await (supabase as any)
      .from('grc_test_runs')
      .select('test_id, result, status, executed_at')
      .eq('company_id', companyId)
      .gte('executed_at', dayAgo)
      .order('executed_at', { ascending: false });

    // Map to latest result per test
    const latestByTest = new Map();
    recentRuns?.forEach((r: any) => {
      if (!latestByTest.has(r.test_id)) latestByTest.set(r.test_id, r);
    });

    let failingCount = 0;
    let erroringCount = 0;
    latestByTest.forEach(run => {
      if (run.result === 'fail') failingCount++;
      if (run.status === 'error' || run.status === 'failed') erroringCount++;
    });

    return {
      totalEnabled: tests?.length || 0,
      overdueCount: overdueTests.length,
      failingCount,
      erroringCount,
      flappingCount: 0, // Computed per-test, global aggregate would need more logic or a summary table
      dailyRuns: recentRuns?.length || 0
    };
  },

  async listOverdueTests(companyId: string) {
    const overdueThreshold = new Date(Date.now() - 30 * 60000).toISOString();
    const { data } = await (supabase as any)
      .from('grc_control_tests')
      .select('*, grc_controls(reference_code, title)')
      .eq('company_id', companyId)
      .eq('enabled', true)
      .lt('next_run_at', overdueThreshold)
      .order('next_run_at', { ascending: true });
    
    return data || [];
  },

  async getProviderHealth(companyId: string): Promise<ProviderHealth[]> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60000).toISOString();
    const { data: runs } = await (supabase as any)
      .from('grc_test_runs')
      .select('test_id, status, executed_at, grc_control_tests(provider_id)')
      .eq('company_id', companyId)
      .gte('executed_at', dayAgo);

    const stats = new Map<string, { runs: number; errors: number; tests: Set<string> }>();

    runs?.forEach((r: any) => {
      const pId = r.grc_control_tests?.provider_id;
      if (!pId) return;
      
      const current = stats.get(pId) || { runs: 0, errors: 0, tests: new Set() };
      current.runs++;
      if (r.status === 'error' || r.status === 'failed' || r.result === 'fail') {
        current.errors++;
        current.tests.add(r.test_id);
      }
      stats.set(pId, current);
    });

    const manifests = providerRegistry.getAllManifests();
    
    return Array.from(stats.entries()).map(([id, s]) => ({
      providerId: id,
      providerName: manifests.find(m => m.id === id)?.name || id,
      totalRuns24h: s.runs,
      errorRate: s.runs > 0 ? (s.errors / s.runs) * 100 : 0,
      failingTestsCount: s.tests.size
    }));
  },

  /**
   * Computes flapping score based on transitions in the last 20 runs
   */
  async getFlappingMetrics(companyId: string) {
    // Get last 20 runs for each enabled test
    const { data: tests } = await (supabase as any)
      .from('grc_control_tests')
      .select('id, test_name')
      .eq('company_id', companyId)
      .eq('enabled', true);

    const flappyTests = [];

    for (const test of (tests || [])) {
      const { data: runs } = await (supabase as any)
        .from('grc_test_runs')
        .select('result, executed_at')
        .eq('test_id', test.id)
        .order('executed_at', { ascending: false })
        .limit(20);

      if (!runs || runs.length < 5) continue;

      let transitions = 0;
      for (let i = 0; i < runs.length - 1; i++) {
        const current = runs[i].result;
        const next = runs[i+1].result;
        if (current !== next && current !== null && next !== null) {
          transitions++;
        }
      }

      if (transitions >= 3) { // Threshold for flapping
        flappyTests.push({
          id: test.id,
          name: test.test_name,
          transitions,
          latestResult: runs[0].result
        });
      }
    }

    return flappyTests.sort((a, b) => b.transitions - a.transitions);
  }
};
