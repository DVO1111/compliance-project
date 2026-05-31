import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { generateEvidenceReport } from "./reportGenerator.ts"

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};


/* ═══════════════════════════════════════════════════════════════
   GRC Automation Runner — Phase 2 Sprint 3
   ═══════════════════════════════════════════════════════════════
   Polls 'grc_control_tests' for due items and executes checks.
   Uses SERVICE_ROLE to bypass RLS.
   Sprint 3: Automated Evidence Collection & Archive Integration.
   ═══════════════════════════════════════════════════════════════ */

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 0. Create job run record for monitoring
  const { data: jobRun } = await supabase
    .from('governance_job_runs')
    .insert({
      job_type: 'automation_runner',
      job_name: 'Automation Batch Runner',
      source: 'cron',
      status: 'running',
      metadata: { timestamp: new Date().toISOString() }
    })
    .select('id')
    .single()

  const jobRunId = jobRun?.id;
  const startTime = Date.now();

  console.log("Automation Runner: Starting batch...");

  // 1. Fetch due tests (joining controls for report metadata)
  const { data: dueTests, error: fetchError } = await supabase
    .from("grc_control_tests")
    .select("*, integration_connections(*), grc_controls(reference_code, name)")
    .eq("enabled", true)
    .lte("next_run_at", new Date().toISOString())
    .limit(25);

  if (fetchError) {
    console.error("Runner Error: Failed to fetch due tests", fetchError);
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  const results = { total: dueTests?.length || 0, passed: 0, failed: 0, errors: 0 };
  
  if (!dueTests || dueTests.length === 0) {
    console.log("Automation Runner: No tests due.");
    return new Response(JSON.stringify({ message: "No tests due", results }));
  }

  // 2. Process tests
  for (const test of dueTests) {
    const startedAt = Date.now();
    try {
      console.log(`Executing test [${test.id}] for provider [${test.provider_id}]`);

      let checkResult;
      
      // Sprint 2/3: Support Slack Connectivity
      if (test.provider_id === 'slack') {
        checkResult = await runSlackConnectivityCheck(test.integration_connections);
      } else {
        checkResult = {
          status: 'error',
          result: null,
          errorMessage: `Provider ${test.provider_id} not supported in runner yet`,
          payload: {},
          observedAt: new Date().toISOString()
        };
      }

      const durationMs = Date.now() - startedAt;

      // 3. Record the Test Run (grc_test_runs)
      const { data: runRecord, error: runError } = await supabase
        .from("grc_test_runs")
        .insert({
          company_id: test.company_id,
          test_id: test.id,
          status: checkResult.status,
          result: checkResult.result,
          evidence_payload: checkResult.payload,
          error_message: checkResult.errorMessage,
          duration_ms: durationMs,
          executed_at: checkResult.observedAt
        })
        .select()
        .single();

      if (runError) throw new Error(`Failed to record run: ${runError.message}`);

      // 4. Update Test Metadata (last_run_at, next_run_at)
      const nextRunAt = computeNextRunAt(test.frequency);
      await supabase
        .from("grc_control_tests")
        .update({ 
          last_run_at: checkResult.observedAt,
          next_run_at: nextRunAt
        })
        .eq("id", test.id);

      // 5. Evidence Collection (Sprint 3)
      const config = test.configuration || {};
      const collectEvidence = config.collectEvidence !== false; // default true
      
      if (collectEvidence && checkResult.status !== 'error') {
        try {
          await handleEvidenceCollection(supabase, test, runRecord, checkResult);
        } catch (evErr) {
          console.error(`Evidence collection failed for test ${test.id}:`, evErr);
        }
      }

      // 6. Alerting Hooks (Sprint 5)
      try {
        await handleAlerts(supabase, test, runRecord);
      } catch (alertErr) {
        console.error(`Alerting failed for test ${test.id}:`, alertErr);
      }

      // 7. Audit Log (recordSystemAudit)
      await recordSystemAudit(supabase, {
        companyId: test.company_id,
        action: 'execute_test',
        entityType: 'grc_control_test',
        entityId: test.id,
        metadata: { 
          run_id: runRecord.id, 
          status: checkResult.status, 
          result: checkResult.result,
          provider_id: test.provider_id 
        }
      });

      if (checkResult.result === 'pass') results.passed++;
      else if (checkResult.result === 'fail') results.failed++;
      else results.errors++;

    } catch (err) {
      console.error(`Error processing test ${test.id}:`, err);
      results.errors++;
    }
  }

  if (jobRunId) {
    await supabase
      .from('governance_job_runs')
      .update({ 
        status: 'completed', 
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        metadata: { results }
      })
      .eq('id', jobRunId)
  }

  return new Response(JSON.stringify({ 
    message: "Automation batch complete",
    results 
  }), { headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" } });
});

// ── Helpers ──────────────────────────────────────────────────

async function handleEvidenceCollection(supabase: any, test: any, run: any, checkResult: any) {
  const throttleHours = test.configuration?.evidenceThrottleHours ?? 24;
  
  if (throttleHours > 0) {
    const threshold = new Date(Date.now() - throttleHours * 3600 * 1000).toISOString();
    
    // Check for recent evidence for this test with same result
    // Join path: grc_test_run_evidence -> grc_test_runs
    const { data: recentEvidence } = await supabase
      .from('grc_test_run_evidence')
      .select('id, grc_test_runs!inner(test_id, result)')
      .eq('company_id', test.company_id)
      .eq('grc_test_runs.test_id', test.id)
      .eq('grc_test_runs.result', checkResult.result)
      .gt('created_at', threshold)
      .limit(1);
      
    if (recentEvidence && recentEvidence.length > 0) {
      console.log(`Throttling evidence for test ${test.id}: recent record exists.`);
      return;
    }
  }

  // Generate Report
  const reportText = generateEvidenceReport({
    control: test.grc_controls,
    test: { test_name: test.test_name, provider_id: test.provider_id },
    run: { 
      ...run, 
      result: checkResult.result, 
      status: checkResult.status, 
      error_message: checkResult.errorMessage, 
      evidence_payload: checkResult.payload 
    }
  });

  // 1. Create content_submissions (The Evidence Artifact)
  const { data: submission, error: subError } = await supabase
    .from('content_submissions')
    .insert({
      company_id: test.company_id,
      user_id: SYSTEM_USER_ID,
      title: `[AUTO] ${test.grc_controls.reference_code} - ${test.test_name} - ${(checkResult.result || 'UNKNOWN').toUpperCase()}`,
      content_text: reportText,
      file_name: 'automation_report.md',
      file_type: '.txt',
      platform: 'automation',
      content_topic: 'Automation Evidence',
      target_audience: 'general_public',
      status: 'approved',
      signoff_status: 'published',
      jurisdiction: 'all'
    })
    .select()
    .single();
    
  if (subError) throw subError;

  // 2. Create grc_control_evidence link
  const { data: evidenceLink, error: linkError } = await supabase
    .from('grc_control_evidence')
    .insert({
      company_id: test.company_id,
      control_id: test.control_id,
      submission_id: submission.id,
      status: 'valid',
      linked_by: null
    })
    .select()
    .single();
    
  if (linkError) throw linkError;

  // 3. Link Run to Evidence
  const { error: runEvError } = await supabase
    .from('grc_test_run_evidence')
    .insert({
      company_id: test.company_id,
      test_run_id: run.id,
      control_evidence_id: evidenceLink.id
    });
    
  if (runEvError) throw runEvError;

  // 4. Audit
  await recordSystemAudit(supabase, {
    companyId: test.company_id,
    action: 'create_automation_evidence',
    entityType: 'grc_evidence_link',
    entityId: evidenceLink.id,
    metadata: { 
      test_id: test.id, 
      run_id: run.id, 
      submission_id: submission.id, 
      control_id: test.control_id 
    }
  });

  console.log(`Evidence collected for test ${test.id}, submission: ${submission.id}`);
}

async function runSlackConnectivityCheck(connection: any) {
  const method = connection.config?.connection_method || 'webhook';
  const observedAt = new Date().toISOString();

  if (method === 'oauth') {
    return { status: 'success', result: 'pass', payload: { method: 'oauth' }, observedAt };
  }

  const url = connection.config?.webhook_url;
  if (!url) return { status: 'failed', result: 'fail', errorMessage: 'No webhook URL', payload: {}, observedAt };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ 
        text: "🛠️ [Automated Check] Slack Connectivity Verified.",
        blocks: [{ type: "context", elements: [{ type: "mrkdwn", text: "ℹ️ Automated connectivity check from GRC Engine." }] }]
      })
    });
    if (resp.ok) return { status: 'success', result: 'pass', payload: { method: 'webhook', status: resp.status }, observedAt };
    return { status: 'failed', result: 'fail', errorMessage: `Slack status ${resp.status}`, payload: {}, observedAt };
  } catch (err: any) {
    return { status: 'error', result: null, errorMessage: err.message, payload: {}, observedAt };
  }
}

function computeNextRunAt(frequency: string) {
  const now = new Date();
  const freq = (frequency || 'daily').toLowerCase();
  if (freq === 'hourly') return new Date(now.getTime() + 3600000).toISOString();
  if (freq === 'weekly') return new Date(now.getTime() + 604800000).toISOString();
  if (freq === 'monthly') {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1);
    return d.toISOString();
  }
  // Default Daily
  return new Date(now.getTime() + 86400000).toISOString();
}

async function recordSystemAudit(supabase: any, params: any) {
  await supabase.from("audit_logs").insert({
    user_id: SYSTEM_USER_ID,
    company_id: params.companyId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    metadata: { system: true, ...params.metadata },
    created_at: new Date().toISOString()
  });
}

/**
 * handleAlerts detects consecutive failures or system errors 
 * and notifies the test owner/admins.
 */
async function handleAlerts(supabase: any, test: any, currentRun: any) {
  const isFailure = currentRun.result === 'fail';
  const isError = currentRun.status === 'error';

  if (!isFailure && !isError) return;

  // 1. Deduplication (6h window)
  const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: recentNotice } = await supabase
    .from('notifications')
    .select('id')
    .eq('type', 'automation_alert')
    .eq('content_id', test.id)
    .gt('created_at', sixHoursAgo)
    .limit(1);

  if (recentNotice && recentNotice.length > 0) {
    console.log(`Alert throttled for test ${test.id}: recent notification exists.`);
    return;
  }

  // 2. Failure Logic
  let shouldNotify = false;
  let alertMessage = "";

  if (isError) {
    shouldNotify = true;
    alertMessage = `Automation Error: Test "${test.test_name}" failed to execute due to a system error or provider connection issue.`;
  } else if (isFailure) {
    // Check for consecutive failure
    const { data: lastRuns } = await supabase
      .from('grc_test_runs')
      .select('result')
      .eq('test_id', test.id)
      .neq('id', currentRun.id)
      .order('executed_at', { ascending: false })
      .limit(1);

    if (lastRuns && lastRuns.length > 0 && lastRuns[0].result === 'fail') {
      shouldNotify = true;
      alertMessage = `Critical: Test "${test.test_name}" has failed for two consecutive runs. Immediate review recommended.`;
    }
  }

  if (shouldNotify) {
    // Determine recipient (prefer creator, fallback to admins)
    const recipientId = test.created_by;
    
    if (recipientId) {
      await supabase.from('notifications').insert({
        recipient_id: recipientId,
        type: 'automation_alert',
        content_id: test.id,
        message: alertMessage
      });
      console.log(`Alert sent to owner [${recipientId}] for test ${test.id}`);
    } else {
      // Broadcast to admins
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('company_id', test.company_id)
        .in('role', ['admin', 'compliance_officer']);

      if (admins && admins.length > 0) {
        const notifications = admins.map((admin: any) => ({
          recipient_id: admin.id,
          type: 'automation_alert',
          content_id: test.id,
          message: alertMessage
        }));
        await supabase.from('notifications').insert(notifications);
        console.log(`Alert broadcast to ${admins.length} admins for test ${test.id}`);
      }
    }
  }
}

