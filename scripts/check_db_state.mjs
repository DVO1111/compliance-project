import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ovxfflilbqaxedzovgmz.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92eGZmbGlsYnFheGVkem92Z216Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTA1NDc0NDUsImV4cCI6MTk5MDMyMzQ0NX0.xxx'; // We can just use the internal script that already imports it

async function check() {
    const { config } = await import('dotenv');
    config({ path: '.env' });
    const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

    const { data, error } = await client
        .from('content_submissions')
        .select('id, title, legal_decided_by, signoff_status, legal_planned_at')
        .order('created_at', { ascending: false })
        .limit(3);

    console.log('--- RECENT SUBMISSIONS ---');
    console.dir(data, { depth: null });
    console.log('Error:', error);
}

check();
