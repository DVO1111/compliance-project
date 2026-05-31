import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Fetching recent calendar events...");

  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('id, event_type, title, status, scheduled_at, legal_planned_at, submission_id')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching events:", error);
    return;
  }

  console.log("Recent Events:");
  events?.forEach(e => {
    console.log(`- [${e.event_type}] Title: "${e.title}" | Status: ${e.status} | Scheduled: ${e.scheduled_at} | Legal Planned: ${e.legal_planned_at} | SubID: ${e.submission_id}`);
  });
}

main();
