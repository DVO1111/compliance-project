const url = "https://ovxfflilbqaxedzovgmz.supabase.co/rest/v1/calendar_events?select=id,event_type,title,status,scheduled_at,legal_planned_at,submission_id&order=created_at.desc&limit=5";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92eGZmbGlsYnFheGVkem92Z216Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwODc3OTYsImV4cCI6MjA4NjY2Mzc5Nn0.HSUEnM_wSVQbXAR6Ey0Dn7CdhSQW5QcqZa6S4HlsluM";

fetch(url, {
    headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
    }
}).then(res => res.json()).then(data => {
    console.log("LAST 5 EVENTS CREATED:");
    data.forEach(e => {
        console.log(`[${e.event_type}] Title: "${e.title}" | Status: ${e.status} | Scheduled: ${e.scheduled_at} | Legal Planned: ${e.legal_planned_at} | SubID: ${e.submission_id}`);
    });
}).catch(console.error);
