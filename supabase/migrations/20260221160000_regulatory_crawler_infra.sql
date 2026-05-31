/* ============================================================
   Regulatory Crawler Infrastructure (Single SQL File)
   - Creates crawler source tables
   - Creates crawl run logs
   - Adds linkage for regulatory_update alerts (optional)
   - Adds dedupe index for regulatory_circulars.source_url
   - Adds RLS + policies (only if public.profiles exists)
   ============================================================ */

-- 0) Extensions (gen_random_uuid)
create extension if not exists pgcrypto;

-- 1) Regulatory sources table (where crawler pulls from)
create table if not exists public.regulatory_sources (
  id uuid not null default gen_random_uuid(),
  name text not null,
  jurisdiction text not null default 'all',
  source_type text not null default 'rss', -- rss | atom | html
  url text not null,
  is_active boolean not null default true,
  priority int not null default 50,
  crawl_interval_minutes int not null default 720, -- 12 hours default
  last_crawled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regulatory_sources_pkey primary key (id)
);

create unique index if not exists idx_regulatory_sources_unique_url
on public.regulatory_sources (url);

create index if not exists idx_regulatory_sources_jurisdiction
on public.regulatory_sources (jurisdiction);

-- 2) Crawl runs table (logs each run for visibility/debugging)
create table if not exists public.regulatory_crawl_runs (
  id uuid not null default gen_random_uuid(),
  source_id uuid null references public.regulatory_sources(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null default 'running', -- running | success | error
  fetched_count int not null default 0,
  inserted_count int not null default 0,
  updated_count int not null default 0,
  error_message text null,
  created_at timestamptz not null default now(),
  constraint regulatory_crawl_runs_pkey primary key (id)
);

create index if not exists idx_regulatory_crawl_runs_started_at
on public.regulatory_crawl_runs (started_at desc);

create index if not exists idx_regulatory_crawl_runs_source_id
on public.regulatory_crawl_runs (source_id);

-- 3) Add circular_id to watchdog_alerts (optional link from update → alert)
do $$
begin
  if to_regclass('public.watchdog_alerts') is not null then
    alter table public.watchdog_alerts
      add column if not exists circular_id uuid null references public.regulatory_circulars(id) on delete set null;
    create index if not exists idx_watchdog_alerts_circular_id
      on public.watchdog_alerts (circular_id);
  end if;
end
$$;

-- 4) Dedupe: avoid inserting same update multiple times (source_url is best key)
-- Your regulatory_circulars already has source_url; this will enforce uniqueness when not null.
do $$
begin
  if to_regclass('public.regulatory_circulars') is not null then
    -- Create a partial unique index: only enforce uniqueness when source_url is present
    execute 'create unique index if not exists idx_reg_circulars_unique_source_url
             on public.regulatory_circulars (source_url)
             where source_url is not null';
  end if;
end
$$;

-- 5) Seed a few default sources (you can edit in Table Editor later)
insert into public.regulatory_sources (name, jurisdiction, source_type, url, priority, crawl_interval_minutes)
values
  ('FDA Press Releases (RSS)', 'usa', 'rss', 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds', 20, 720),
  ('FTC News (RSS)', 'usa', 'rss', 'https://www.ftc.gov/news-events/news/press-releases/rss', 30, 720),
  ('MHRA News (RSS)', 'europe', 'rss', 'https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency.atom', 30, 720)
on conflict (url) do nothing;

-- 6) RLS enablement (safe)
alter table public.regulatory_sources enable row level security;
alter table public.regulatory_crawl_runs enable row level security;

-- 7) Policies
-- IMPORTANT:
-- We only create policies if `public.profiles` exists.
-- Expected: profiles has (id uuid) and (role text).
-- Roles allowed: admin, executive, legal.
do $$
begin
  if to_regclass('public.profiles') is not null then

    -- Regulatory sources policies
    execute 'drop policy if exists "Admins can manage regulatory sources" on public.regulatory_sources';
    execute $pol$
      create policy "Admins can manage regulatory sources"
      on public.regulatory_sources
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'executive', 'legal')
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'executive', 'legal')
        )
      )
    $pol$;

    -- Crawl runs policies (view-only)
    execute 'drop policy if exists "Admins can view crawl runs" on public.regulatory_crawl_runs';
    execute $pol$
      create policy "Admins can view crawl runs"
      on public.regulatory_crawl_runs
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'executive', 'legal')
        )
      )
    $pol$;

  end if;
end
$$;