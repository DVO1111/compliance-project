import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, ...SECURITY_HEADERS }})
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 0. Create job run record
    const { data: jobRun, error: jobRunError } = await supabase
      .from('governance_job_runs')
      .insert({
        job_type: 'policy_reminder_runner',
        job_name: 'Scheduled Policy Reminders',
        source: 'cron',
        status: 'running',
        metadata: { timestamp: new Date().toISOString() }
      })
      .select('id')
      .single()

    if (jobRunError) console.error('Failed to create job run log:', jobRunError)
    const jobRunId = jobRun?.id;
    const startTime = Date.now();

    // 1. Fetch all users needing reminders via RPC
    const { data: targets, error: rpcError } = await supabase
      .rpc('get_users_needing_policy_reminders')

    if (rpcError) throw rpcError
    if (!targets || targets.length === 0) {
      return new Response(JSON.stringify({ message: 'No reminders to send' }), {
        headers: { ...SECURITY_HEADERS, ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Map targets to notification inserts
    const notifications = targets.map((t: any) => ({
      recipient_id: t.recipient_id,
      type: 'policy_reminder',
      message: t.is_overdue 
        ? `OVERDUE: Please acknowledge the latest version of "${t.policy_title}".`
        : `Reminder: You have a pending policy acknowledgement for "${t.policy_title}".`,
      link: '/governance/my-policies'
    }))

    // 3. Bulk insert notifications
    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notifications)

    if (jobRunId) {
      await supabase
        .from('governance_job_runs')
        .update({ 
          status: 'completed', 
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
          metadata: { processed: targets.length }
        })
        .eq('id', jobRunId)
    }

    return new Response(JSON.stringify({ processed: targets.length }), {
      headers: { ...SECURITY_HEADERS, ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    // If we have a jobRunId, mark it as failed
    // (We need to re-initialize supabase or use the existing one if possible)
    console.error('Policy reminder runner failed:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...SECURITY_HEADERS, ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
