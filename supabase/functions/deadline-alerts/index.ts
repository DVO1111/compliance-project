// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts"

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};


// ── Types ────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  company_id: string;
  submission_id: string;
  event_type: string;
  title: string;
  scheduled_at: string;
  legal_planned_at: string | null;
  created_by: string;
  status: string;
}

// ── Main function ────────────────────────────────────────────────────────

serve(async (req) => {
  // Try to authorize request if needed, or allow cron anon access
  const authHeader = req.headers.get("Authorization");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Missing config" }), { status: 500 });
  }

  // Create an admin client to bypass RLS and query all events
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // We are looking for events where the effective deadline is within the next 2 hours
    // Effective deadline: if event_type = 'legal_review', use legal_planned_at. 
    // If event_type = 'marketing_publish', use scheduled_at.
    
    // Postgres doesn't easily let us filter by "between now and 2 hours" using the SDK purely,
    // so we can use a custom RPC or query raw. To keep it simple, we'll fetch events that are pending
    // and process in TypeScript, since the dataset is typically small per run.
    
    const { data: events, error: fetchError } = await supabase
      .from('calendar_events')
      .select('*')
      .in('status', ['pending', 'confirmed'])
      .in('event_type', ['marketing_publish', 'legal_review']);

    if (fetchError) throw fetchError;

    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const results: string[] = [];

    for (const ev of (events as CalendarEvent[])) {
      // Determine deadline
      const deadlineStr = ev.event_type === 'legal_review' 
        ? ev.legal_planned_at 
        : ev.scheduled_at;
      
      if (!deadlineStr) continue;
      const deadline = new Date(deadlineStr);

      // Check if deadline is in the future AND within 2 hours
      if (deadline > now && deadline <= twoHoursFromNow) {
        
        // Ensure we haven't already sent a '2h_deadline' reminder
        const { data: existing } = await supabase
          .from('calendar_reminders')
          .select('id')
          .eq('event_id', ev.id)
          .eq('reminder_type', '2h_deadline')
          .limit(1);

        if (existing && existing.length > 0) {
          continue; // Already sent
        }

        // We need to notify the user. Let's find out who to notify.
        // For marketing publish, notify the creator. For legal review, notify the legal team?
        // Let's just notify the 'created_by' user for simplicity of this alert, 
        // as they are the owner of the submission.
        const recipientId = ev.created_by;
        if (!recipientId) continue;

        // 1. Mark as sent in calendar_reminders
        await supabase.from('calendar_reminders').insert({
          event_id: ev.id,
          reminder_type: '2h_deadline',
          recipient_id: recipientId,
          message: `2-hour deadline warning for ${ev.title}`
        });

        // 2. Insert into notifications table for real-time popup & bell icon
        const eventTypeName = ev.event_type === 'marketing_publish' ? 'Publishing Deadline' : 'Legal Review Deadline';
        const msg = JSON.stringify({
          text: `Event "${ev.title}" is reaching its ${eventTypeName.toLowerCase()} in less than 2 hours.`,
          event_title: ev.title,
          deadline: deadline.toISOString()
        });

        await supabase.from('notifications').insert({
          recipient_id: recipientId,
          type: 'deadline_alert',
          content_id: ev.submission_id,
          message: msg,
        });

        // 3. Stub for offline email logic
        console.log(`[Email Stub] Sending offline email to user ID ${recipientId} for event ${ev.id}: "Deadline in <2 hours!"`);
        
        results.push(`Alerted user ${recipientId} for event ${ev.id}`);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" } });
  }
});
