-- ============================================================
-- Publish Outbox — Durable event queue for outbound deliveries
-- Safe, idempotent. Run in Supabase SQL Editor.
-- ============================================================

create table if not exists public.publish_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  content_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'queued', -- queued | processing | delivered | failed
  error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists idx_publish_outbox_status_created
  on public.publish_outbox(status, created_at);

create index if not exists idx_publish_outbox_company
  on public.publish_outbox(company_id);

-- RLS: company members can view their own outbox entries.
alter table public.publish_outbox enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'publish_outbox'
      and policyname = 'Company members can view publish outbox'
  ) then
    create policy "Company members can view publish outbox"
      on public.publish_outbox for select
      using (company_id in (select company_id from public.profiles where id = auth.uid()));
  end if;
end$$;

-- Inserts/updates are typically done by service-role Edge Functions.
-- If you later need client-side inserts, add a WITH CHECK policy carefully.
