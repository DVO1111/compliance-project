-- Waitlist signups from the public marketing pages.
--
-- Every CTA across the five marketing pages writes here. Until now they all
-- discarded what they collected: the form set local React state and nothing
-- else, so a submission was lost the moment the page unloaded.
--
-- SECURITY NOTE — this table is written by anonymous visitors using the public
-- anon key, so the privilege model matters more than usual:
--
--   * INSERT is granted to anon. That is the whole point of a public form.
--   * SELECT is granted to nobody. There is deliberately no SELECT policy and
--     no SELECT grant, so the anon key cannot read the list back. Without this,
--     anyone who opened devtools on the marketing site could enumerate every
--     lead — their name, employer, role and email. Read the table through the
--     Supabase dashboard or a service-role key, both of which bypass RLS.
--   * UPDATE and DELETE are likewise ungranted, so a submission cannot be
--     altered or removed through the public key.
--
-- The CHECK constraints bound what an anonymous caller can store. They are not
-- spam protection — a public endpoint can still be flooded with valid-looking
-- rows. If that becomes a problem the answer is a captcha (Turnstile/hCaptcha)
-- or an Edge Function with rate limiting in front of this insert, not a
-- tighter policy here.

create table if not exists public.waitlist_signups (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  -- Which page and which button produced this row, so the pages can be
  -- compared later. Neither is supplied by the visitor.
  source      text not null,
  intent      text,

  -- The contact form collects all of these. The single-field CTAs on the
  -- other pages collect only an email, so the rest are nullable.
  email       text not null,
  full_name   text,
  company     text,
  role        text,
  industry    text,
  notes       text,

  constraint waitlist_source_valid check (
    source in ('home', 'platform', 'who-its-for', 'about', 'contact')
  ),
  constraint waitlist_email_shape check (
    email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and char_length(email) between 3 and 320
  ),
  constraint waitlist_intent_len   check (intent    is null or char_length(intent)    <= 40),
  constraint waitlist_name_len     check (full_name is null or char_length(full_name) <= 200),
  constraint waitlist_company_len  check (company   is null or char_length(company)   <= 200),
  constraint waitlist_role_len     check (role      is null or char_length(role)      <= 200),
  constraint waitlist_industry_len check (industry  is null or char_length(industry)  <= 100),
  constraint waitlist_notes_len    check (notes     is null or char_length(notes)     <= 2000)
);

-- Deliberately NOT unique on email: someone may sign up from the home page and
-- again from the contact form, and a unique violation would surface to them as
-- a failure for doing nothing wrong. De-duplicate when reading instead.
create index if not exists waitlist_signups_created_at_idx
  on public.waitlist_signups (created_at desc);
create index if not exists waitlist_signups_email_idx
  on public.waitlist_signups (lower(email));

alter table public.waitlist_signups enable row level security;

-- Start from nothing rather than trusting the schema's default privileges,
-- which in a fresh Supabase project grant broadly to anon and authenticated.
revoke all on public.waitlist_signups from anon, authenticated;
grant insert on public.waitlist_signups to anon, authenticated;

drop policy if exists "Anyone can join the waitlist" on public.waitlist_signups;
create policy "Anyone can join the waitlist"
  on public.waitlist_signups
  for insert
  to anon, authenticated
  with check (true);

-- No select/update/delete policies by design. See the security note above.

comment on table public.waitlist_signups is
  'Public marketing waitlist. Insert-only for anon; readable only via service role or the Supabase dashboard.';
