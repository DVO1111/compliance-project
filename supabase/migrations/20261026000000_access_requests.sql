-- =====================================================================
--  W2-0 · Dashboard & permissions — asking for access, and deciding
-- =====================================================================
--  The design's page header states the flow, and this file is the half
--  of it that a browser cannot be trusted with:
--
--    "2. They pick the section, View or Act... Act is disabled where
--        segregation of duties forbids it.
--     3. The request goes to the Compliance admin with an automatic
--        conflict check.
--     4. The admin grants as asked, grants with limits (shorter time,
--        fewer records, with a note) or declines with a reason.
--     5. Later the admin can restrict, pause or revoke the grant...
--        Everything is logged."
--
--  And one rule carried from the sources: "Release is a step
--  permission, not a page permission; it can't be requested (2.5,
--  C8.6)."
--
--  THREE DECISIONS, STATED HERE SO THEY ARE NOT INFERRED FROM THE DDL.
--
--  1. THE DUTIES RULE IS DATA, NOT CODE. access_duty_conflicts is a
--     table, seeded with the eight pairs, and access_decide() reads it.
--     Segregation of duties is the control an inspector tests first,
--     and "show me the rule" has to be answerable by a SELECT, not by
--     reading a function body. It also means a company adding a rule is
--     an INSERT rather than a migration.
--
--  2. THE CHECK RUNS IN THE DATABASE, AGAIN. The request dialog
--     disables Act and the review drawer refuses the grant, and both of
--     those run in a browser. access_decide() re-checks and raises. A
--     browser is not a security boundary; the only thing that stops a
--     crafted POST is this function.
--
--  3. THE REQUEST IS NOT THE GRANT. A decided request is a record of
--     what was asked and answered; access_grants is what is in force.
--     Collapsing them would mean editing history every time an admin
--     later restricted or revoked a grant (step 5), and the one thing
--     an access log must not be is editable.
--
--  NOTHING HERE CLAIMS PART 11 VALIDATION. These are access controls
--  with an audit trail, which is a precondition for that claim and not
--  the claim itself.
-- =====================================================================

-- ── 1. The sections access can be held on ────────────────────────────
--  A table and not an enum: an enum cannot carry the two facts that
--  make the UI work — whether a section can be requested at all, and
--  what View and Act mean there — and ALTER TYPE ... ADD VALUE cannot
--  run inside a transaction, which makes an enum a bad home for a list
--  that will grow.
CREATE TABLE IF NOT EXISTS public.access_sections (
  key              text PRIMARY KEY,
  label            text NOT NULL,
  --  NULL means it can be requested. A sentence means it cannot, and
  --  the sentence is what the locked tile shows. There is no boolean,
  --  because a boolean would let somebody mark a section
  --  unrequestable without saying why.
  unrequestable_reason text,
  sort_order       int  NOT NULL DEFAULT 100
);

ALTER TABLE public.access_sections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'access_sections'
      AND policyname = 'access_sections_readable'
  ) THEN
    --  Readable by every signed-in user and writable by none. The list
    --  of sections is not company data; it is the product's own shape,
    --  and a user who cannot read it cannot be shown why they are
    --  locked out of one.
    CREATE POLICY access_sections_readable ON public.access_sections
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

INSERT INTO public.access_sections (key, label, unrequestable_reason, sort_order) VALUES
  ('batch_records',          'Batch records',            NULL, 10),
  ('batch_release',          'Batch release decision',
     'Batch release is a step permission held by the designated QA release role. '
     'It cannot be requested — it is assigned with the role.',                  20),
  ('qc_testing',             'QC testing',               NULL, 30),
  ('qa_disposition',         'QA disposition',           NULL, 40),
  ('material_lots',          'Material lots',            NULL, 50),
  ('deviation_capa',         'Deviation / CAPA',         NULL, 60),
  ('change_control',         'Change control',           NULL, 70),
  ('sop_library',            'SOP library',              NULL, 80),
  ('gmp_inspection',         'GMP inspection',           NULL, 90),
  ('products',               'Products',                 NULL, 100),
  ('registrations_licences', 'Registrations & Licences', NULL, 110),
  ('obligations',            'Obligations',              NULL, 120),
  ('risk_register',          'Risk register',            NULL, 130),
  ('policies',               'Policies',                 NULL, 140),
  ('audit_trail',            'Audit trail',              NULL, 150)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      unrequestable_reason = EXCLUDED.unrequestable_reason,
      sort_order = EXCLUDED.sort_order;

-- ── 2. The duties rule, as rows ──────────────────────────────────────
--  Each row is a job that may not ACT on a section, and why. VIEW is
--  deliberately absent from this table: seeing a record you cannot
--  change is how people do their jobs, and the design's own example
--  grants a storekeeper View on QC testing with "No conflict". The
--  table is keyed on (work_role, section_key) with no level column, so
--  there is no way to express "View is forbidden" by accident.
CREATE TABLE IF NOT EXISTS public.access_duty_conflicts (
  --  A surrogate key, and not (work_role, section_key, company_id).
  --  A column in a PRIMARY KEY is implicitly NOT NULL, and company_id
  --  has to be nullable: NULL is how a rule says "this one ships with
  --  the product and applies everywhere".
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_role    text NOT NULL,
  section_key  text NOT NULL REFERENCES public.access_sections(key) ON DELETE CASCADE,
  --  Written as the inspector's question, not as a rule number.
  reason       text NOT NULL CHECK (length(btrim(reason)) > 0),
  --  Where the work actually belongs. A refusal that names the right
  --  person is a redirection; one that does not is a wall.
  instead_ask  text NOT NULL CHECK (length(btrim(instead_ask)) > 0),
  --  NULL for the eight the product ships. A company_id makes a rule
  --  that company's own, which is how a site adds one without a
  --  migration.
  company_id   uuid REFERENCES public.companies(id) ON DELETE CASCADE
);

--  Uniqueness in two halves, because a plain UNIQUE would treat every
--  NULL company_id as distinct and let the eight shipped rules be
--  inserted twice.
CREATE UNIQUE INDEX IF NOT EXISTS access_duty_conflicts_global_uniq
  ON public.access_duty_conflicts (work_role, section_key)
  WHERE company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS access_duty_conflicts_company_uniq
  ON public.access_duty_conflicts (company_id, work_role, section_key)
  WHERE company_id IS NOT NULL;

ALTER TABLE public.access_duty_conflicts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'access_duty_conflicts'
      AND policyname = 'access_duty_conflicts_readable'
  ) THEN
    --  Everyone may read the rules that apply to them: the shipped
    --  ones, and their own company's. A rule you cannot read is a rule
    --  you cannot comply with.
    CREATE POLICY access_duty_conflicts_readable ON public.access_duty_conflicts
      FOR SELECT TO authenticated
      USING (company_id IS NULL OR public.app_is_company_member(company_id));
  END IF;
END $$;

INSERT INTO public.access_duty_conflicts (work_role, section_key, reason, instead_ask) VALUES
  ('qc_analyst', 'qa_disposition',
   'A QC analyst tests the material. Deciding its disposition as well would mean approving their own result.',
   'QA disposition belongs to a QA officer or QA manager.'),
  ('production_operator', 'qa_disposition',
   'Production makes the batch. Disposition is the independent check on it.',
   'Ask a QA officer to record the disposition.'),
  ('production_supervisor', 'qa_disposition',
   'Production makes the batch. Disposition is the independent check on it.',
   'Ask a QA officer to record the disposition.'),
  ('production_operator', 'qc_testing',
   'Testing the batch you produced is not an independent test.',
   'QC testing belongs to a QC analyst.'),
  ('production_supervisor', 'qc_testing',
   'Testing the batch your line produced is not an independent test.',
   'QC testing belongs to a QC analyst.'),
  ('production_operator', 'material_lots',
   'Issuing material to your own line removes the second pair of hands between the store and the batch.',
   'Issuing material is a storekeeper task.'),
  ('storekeeper', 'qc_testing',
   'QC results must be recorded by QC, so the person receiving material never tests it.',
   'QC testing belongs to a QC analyst.'),
  ('qc_analyst', 'batch_records',
   'A QC analyst records results against a batch. Editing the batch record itself would let the result and the record be changed together.',
   'Batch records belong to production.'),
  --  "Enforced for everyone, INCLUDING ADMINS." The admin who decides
  --  who holds access must not also hold the decision they would be
  --  granting, or the access log shows self-dealing as routine
  --  administration.
  ('compliance_admin', 'qa_disposition',
   'A Compliance admin decides who holds access. Acting in QA disposition as well would let one person grant themselves the decision they then make.',
   'QA disposition belongs to a QA officer or QA manager.')
ON CONFLICT (work_role, section_key) WHERE company_id IS NULL DO UPDATE
  SET reason = EXCLUDED.reason, instead_ask = EXCLUDED.instead_ask;

-- ── 2b. Sections only named roles may act in ─────────────────────────
--  WHY AN ALLOWLIST SITS BESIDE THE DENYLIST. PM-03's matrix shows QA
--  disposition locked for Procurement, Storekeeper, QC Analyst,
--  Production supervisor and the Compliance admin -- everyone drawn
--  except QA. Five more rows in access_duty_conflicts would look the
--  same on that screen and be wrong in the one case the screen does
--  not draw: a role nobody thought of. Roles get added, 'other'
--  exists, and a denylist says yes to every one of them.
--
--  So the sections where ACTING IS THE CONTROL get named owners, and
--  anything not named is refused. A denylist is only safe if it is
--  complete, and nothing keeps it complete.
CREATE TABLE IF NOT EXISTS public.access_act_owners (
  section_key text NOT NULL REFERENCES public.access_sections(key) ON DELETE CASCADE,
  work_role   text NOT NULL,
  --  Why this section has named owners at all. Shown to anybody
  --  refused, so the refusal is a sentence and not a rule number.
  reason      text NOT NULL CHECK (length(btrim(reason)) > 0),
  instead_ask text NOT NULL CHECK (length(btrim(instead_ask)) > 0),
  PRIMARY KEY (section_key, work_role)
);

ALTER TABLE public.access_act_owners ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'access_act_owners'
      AND policyname = 'access_act_owners_readable'
  ) THEN
    CREATE POLICY access_act_owners_readable ON public.access_act_owners
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

INSERT INTO public.access_act_owners (section_key, work_role, reason, instead_ask) VALUES
  ('qa_disposition', 'qa_officer',
   'Deciding the disposition of material is the independent quality check on everyone else''s work.',
   'QA disposition belongs to a QA officer or QA manager.'),
  ('qa_disposition', 'qa_manager',
   'Deciding the disposition of material is the independent quality check on everyone else''s work.',
   'QA disposition belongs to a QA officer or QA manager.')
ON CONFLICT (section_key, work_role) DO UPDATE
  SET reason = EXCLUDED.reason, instead_ask = EXCLUDED.instead_ask;

-- ── 3. How long a temporary grant may run ────────────────────────────
--  The design asks the question — "Maximum length of a temporary grant
--  (suggest 90 days)?" — and this is its suggestion, stored rather than
--  hard-coded so answering it later is an UPDATE. Per company, with a
--  NULL row as the shipped default.
CREATE TABLE IF NOT EXISTS public.access_settings (
  company_id      uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  max_grant_days  int NOT NULL DEFAULT 90 CHECK (max_grant_days BETWEEN 1 AND 3650)
);

ALTER TABLE public.access_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'access_settings'
      AND policyname = 'access_settings_readable'
  ) THEN
    CREATE POLICY access_settings_readable ON public.access_settings
      FOR SELECT TO authenticated USING (public.app_is_company_member(company_id));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.access_max_grant_days(p_company_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT max_grant_days FROM public.access_settings
                   WHERE company_id = p_company_id), 90);
$$;

-- ── 4. The requests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.access_request_counters (
  company_id  uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0
);

ALTER TABLE public.access_request_counters ENABLE ROW LEVEL SECURITY;
--  No policy, deliberately. Only access_request_raise touches it, and
--  that is SECURITY DEFINER. See the deviation counter for the full
--  reasoning on why this allocation pattern is race-free.

CREATE TABLE IF NOT EXISTS public.access_permission_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  --  "REQ-0193".
  reference       text NOT NULL,
  requested_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  --  Recorded AT REQUEST TIME and never recomputed. The duties check
  --  that was run depended on the job the person held then; if they
  --  change jobs, the decision that was made must still be explicable.
  work_role       text NOT NULL,
  section_key     text NOT NULL REFERENCES public.access_sections(key),
  level           text NOT NULL CHECK (level IN ('view', 'act')),
  --  Free text on screen: "Lots they received".
  scope           text NOT NULL CHECK (length(btrim(scope)) > 0),
  --  NULL means "No end date", which is a real choice on the dialog.
  requested_until date,
  --  "Why do you need it? Required." Not nullable, not blank.
  reason          text NOT NULL CHECK (length(btrim(reason)) > 0),

  status          text NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting', 'granted', 'granted_narrowed', 'declined', 'withdrawn')),

  decided_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at      timestamptz,
  --  The note on a narrowed grant, or the reason on a decline. One
  --  column because they are the same thing from the asker's side:
  --  the sentence explaining what happened to their request.
  decision_note   text,
  --  What was actually granted, when it differed from what was asked.
  granted_level   text CHECK (granted_level IN ('view', 'act')),
  granted_scope   text,
  granted_until   date,

  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, reference),

  --  A decided request carries who decided and when; a waiting one
  --  carries neither. Enforced rather than assumed, because every
  --  report on this table joins on decided_at.
  CONSTRAINT access_request_decided_consistently CHECK (
    (status = 'waiting' AND decided_by IS NULL AND decided_at IS NULL)
    OR (status <> 'waiting' AND decided_at IS NOT NULL)
  ),
  --  "Decline. A reason is required." / "Note to Tunde (required when
  --  you change the request)." The UI enforces both; so does the row,
  --  so a decision written any other way cannot land without one.
  CONSTRAINT access_request_explained CHECK (
    status NOT IN ('declined', 'granted_narrowed')
    OR length(btrim(COALESCE(decision_note, ''))) > 0
  )
);

CREATE INDEX IF NOT EXISTS access_permission_requests_waiting_idx
  ON public.access_permission_requests (company_id, created_at)
  WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS access_permission_requests_person_idx
  ON public.access_permission_requests (company_id, requested_by, created_at DESC);

ALTER TABLE public.access_permission_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'access_permission_requests'
      AND policyname = 'access_permission_requests_readable'
  ) THEN
    --  Any member of the company may read them. Narrower would be
    --  wrong: "Everything is logged" is a promise to the person who
    --  asked as much as to the auditor, and a request you cannot see
    --  is one you cannot chase.
    CREATE POLICY access_permission_requests_readable ON public.access_permission_requests
      FOR SELECT TO authenticated USING (public.app_is_company_member(company_id));
  END IF;
END $$;

--  No INSERT, UPDATE or DELETE policy anywhere on this table. Every
--  write goes through the two SECURITY DEFINER functions below, which
--  is what makes the checks unavoidable: with RLS on and no write
--  policy, a direct POST to PostgREST writes nothing at all.

-- ── 5. The grants, which are what is actually in force ───────────────
CREATE TABLE IF NOT EXISTS public.access_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_key   text NOT NULL REFERENCES public.access_sections(key),
  level         text NOT NULL CHECK (level IN ('view', 'act')),
  scope         text NOT NULL,
  --  NULL is "no end date". A date is enforced by access_grant_active.
  valid_until   date,
  request_id    uuid REFERENCES public.access_permission_requests(id) ON DELETE SET NULL,
  granted_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  --  Step 5: "Later the admin can restrict, pause or revoke." A
  --  revoked grant is kept, not deleted, with who and why.
  revoked_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at    timestamptz,
  revoke_reason text,
  CONSTRAINT access_grant_revoked_consistently CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL)
    OR (revoked_at IS NOT NULL AND length(btrim(COALESCE(revoke_reason, ''))) > 0)
  )
);

--  One live grant per person per section. A second one would make
--  "what can this person open" ambiguous, and the review drawer's
--  third check — "No other active grant for this section" — exists to
--  stop one being created by hand.
CREATE UNIQUE INDEX IF NOT EXISTS access_grants_one_live_per_section
  ON public.access_grants (company_id, user_id, section_key)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS access_grants_user_idx
  ON public.access_grants (company_id, user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'access_grants'
      AND policyname = 'access_grants_readable'
  ) THEN
    CREATE POLICY access_grants_readable ON public.access_grants
      FOR SELECT TO authenticated USING (public.app_is_company_member(company_id));
  END IF;
END $$;

--  "Grants with an end date are removed automatically when they
--  expire." Expiry is computed, not swept: a nightly job that failed
--  would silently leave access in force, and a view cannot fail to
--  run. The row stays for the audit trail; it just stops counting.
--  security_invoker is not optional here and is not boilerplate. A
--  view without it runs as its owner, which on this schema means
--  reading access_grants with RLS bypassed — so "which grants are in
--  force" would answer for every company at once. view_security_invoker_test
--  enforces this across the whole schema; it caught this one.
CREATE OR REPLACE VIEW public.access_grants_active
WITH (security_invoker = true) AS
  SELECT g.*
  FROM public.access_grants g
  WHERE g.revoked_at IS NULL
    AND (g.valid_until IS NULL OR g.valid_until >= CURRENT_DATE);

-- ── 6. The conflict check, as a function ─────────────────────────────
--  Returns the conflicting rule, or no rows. Callable from the client
--  so the request dialog and the review drawer read the same answer
--  the decision function will.
CREATE OR REPLACE FUNCTION public.access_conflict(
  p_company_id uuid, p_work_role text, p_section_key text, p_level text
) RETURNS TABLE (reason text, instead_ask text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  --  Viewing is never a conflict. Stated once, here, and neither
  --  table below can express anything else.
  --
  --  The explicit pair is preferred over the allowlist's generic
  --  sentence when both apply, because a pair's wording is written for
  --  that role -- "approving their own result" says more to a QC
  --  analyst than "this is the independent check" does.
  SELECT x.reason, x.instead_ask FROM (
    SELECT c.reason, c.instead_ask, 0 AS rank, c.company_id
    FROM public.access_duty_conflicts c
    WHERE p_level = 'act'
      AND c.work_role = p_work_role
      AND c.section_key = p_section_key
      AND (c.company_id IS NULL OR c.company_id = p_company_id)

    UNION ALL

    --  The allowlist: a section with named owners refuses every role
    --  that is not one of them, including roles with no pair.
    SELECT DISTINCT o.reason, o.instead_ask, 1 AS rank, NULL::uuid AS company_id
    FROM public.access_act_owners o
    WHERE p_level = 'act'
      AND o.section_key = p_section_key
      AND NOT EXISTS (
        SELECT 1 FROM public.access_act_owners o2
        WHERE o2.section_key = p_section_key AND o2.work_role = p_work_role
      )
  ) x
  --  A company's own rule wins over the shipped one for the same pair.
  ORDER BY x.rank, x.company_id NULLS LAST
  LIMIT 1;
$$;

-- ── 7. Raising a request ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.access_request_raise(
  p_company_id uuid,
  p_section_key text,
  p_level text,
  p_scope text,
  p_until date,
  p_reason text,
  p_work_role text
) RETURNS public.access_permission_requests
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_block  text;
  v_number bigint;
  v_row    public.access_permission_requests;
  v_max    int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_NOT_SIGNED_IN';
  END IF;

  IF NOT public.app_is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_NOT_A_MEMBER';
  END IF;

  --  "Release is a step permission... it can't be requested."
  SELECT unrequestable_reason INTO v_block
  FROM public.access_sections WHERE key = p_section_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_UNKNOWN_SECTION: %', p_section_key;
  END IF;

  IF v_block IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_NOT_REQUESTABLE: %', v_block;
  END IF;

  IF p_level NOT IN ('view', 'act') THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_BAD_LEVEL: %', p_level;
  END IF;

  --  Asking for something the duties rule forbids is refused at the
  --  point of asking, not left for the admin to decline. The dialog
  --  already disables it; this is what makes that more than styling.
  IF EXISTS (SELECT 1 FROM public.access_conflict(p_company_id, p_work_role, p_section_key, p_level)) THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_DUTY_CONFLICT: %',
      (SELECT reason || ' ' || instead_ask
       FROM public.access_conflict(p_company_id, p_work_role, p_section_key, p_level));
  END IF;

  IF length(btrim(COALESCE(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_NO_REASON';
  END IF;

  v_max := public.access_max_grant_days(p_company_id);
  IF p_until IS NOT NULL THEN
    IF p_until < CURRENT_DATE THEN
      RAISE EXCEPTION 'ACCESS_REQUEST_END_DATE_PAST';
    END IF;
    IF p_until > CURRENT_DATE + v_max THEN
      RAISE EXCEPTION 'ACCESS_REQUEST_TOO_LONG: at most % days', v_max;
    END IF;
  END IF;

  --  One waiting request per person per section. Two would give the
  --  admin the same question twice, and the dashboard shows
  --  "Requested" rather than a second Request button for this reason.
  IF EXISTS (
    SELECT 1 FROM public.access_permission_requests
    WHERE company_id = p_company_id AND requested_by = v_user
      AND section_key = p_section_key AND status = 'waiting'
  ) THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_ALREADY_WAITING';
  END IF;

  INSERT INTO public.access_request_counters (company_id, last_number)
  VALUES (p_company_id, 1)
  ON CONFLICT (company_id) DO UPDATE SET last_number = access_request_counters.last_number + 1
  RETURNING last_number INTO v_number;

  INSERT INTO public.access_permission_requests (
    company_id, reference, requested_by, work_role, section_key,
    level, scope, requested_until, reason
  ) VALUES (
    p_company_id, 'REQ-' || lpad(v_number::text, 4, '0'), v_user, p_work_role, p_section_key,
    p_level, btrim(p_scope), p_until, btrim(p_reason)
  ) RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- ── 8. Deciding ──────────────────────────────────────────────────────
--  One function for all three outcomes, because they share every
--  check. Splitting it into grant/narrow/decline would give three
--  places for the duties rule to be forgotten.
CREATE OR REPLACE FUNCTION public.access_decide(
  p_request_id uuid,
  p_decision text,             -- 'grant' | 'narrow' | 'decline'
  p_level text DEFAULT NULL,   -- narrow only
  p_scope text DEFAULT NULL,   -- narrow only
  p_until date DEFAULT NULL,   -- narrow only
  p_note text DEFAULT NULL     -- required for narrow and decline
) RETURNS public.access_permission_requests
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin  uuid := auth.uid();
  v_req    public.access_permission_requests;
  v_level  text;
  v_scope  text;
  v_until  date;
  v_status text;
  v_max    int;
  v_conf   record;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'ACCESS_DECIDE_NOT_SIGNED_IN';
  END IF;

  --  FOR UPDATE: two admins opening the same request is the ordinary
  --  case, and the second one must find it already decided rather than
  --  overwrite the first.
  SELECT * INTO v_req FROM public.access_permission_requests
  WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_DECIDE_NOT_FOUND';
  END IF;

  IF NOT public.app_is_company_member(v_req.company_id) THEN
    RAISE EXCEPTION 'ACCESS_DECIDE_NOT_A_MEMBER';
  END IF;

  IF v_req.status <> 'waiting' THEN
    RAISE EXCEPTION 'ACCESS_DECIDE_ALREADY_DECIDED: %', v_req.status;
  END IF;

  --  Nobody decides their own request. This is the segregation rule
  --  applied to the access system itself, and it is the one an
  --  inspector will think to try.
  IF v_req.requested_by = v_admin THEN
    RAISE EXCEPTION 'ACCESS_DECIDE_OWN_REQUEST';
  END IF;

  IF p_decision = 'decline' THEN
    IF length(btrim(COALESCE(p_note, ''))) = 0 THEN
      RAISE EXCEPTION 'ACCESS_DECIDE_NO_REASON';
    END IF;

    UPDATE public.access_permission_requests
    SET status = 'declined', decided_by = v_admin, decided_at = now(),
        decision_note = btrim(p_note)
    WHERE id = p_request_id RETURNING * INTO v_req;
    RETURN v_req;
  END IF;

  IF p_decision NOT IN ('grant', 'narrow') THEN
    RAISE EXCEPTION 'ACCESS_DECIDE_BAD_DECISION: %', p_decision;
  END IF;

  IF p_decision = 'grant' THEN
    v_level := v_req.level; v_scope := v_req.scope; v_until := v_req.requested_until;
    v_status := 'granted';
  ELSE
    v_level := COALESCE(p_level, v_req.level);
    v_scope := COALESCE(btrim(p_scope), v_req.scope);
    v_until := p_until;
    v_status := 'granted_narrowed';

    IF v_level = v_req.level AND v_scope = v_req.scope
       AND v_until IS NOT DISTINCT FROM v_req.requested_until THEN
      RAISE EXCEPTION 'ACCESS_DECIDE_NOTHING_NARROWED';
    END IF;

    --  Widening is not narrowing. An admin who wants to give more than
    --  was asked for is making a different decision, and it must not
    --  travel under a note addressed to the asker.
    IF v_req.level = 'view' AND v_level = 'act' THEN
      RAISE EXCEPTION 'ACCESS_DECIDE_WIDENS_REQUEST';
    END IF;

    IF length(btrim(COALESCE(p_note, ''))) = 0 THEN
      RAISE EXCEPTION 'ACCESS_DECIDE_NO_NOTE';
    END IF;
  END IF;

  --  THE CHECK THAT CANNOT BE CLICKED THROUGH. It runs for both grant
  --  shapes, against the level actually being written, and after the
  --  narrowing — so narrowing Act down to View passes and dressing a
  --  conflicting Act up as a limited grant does not.
  SELECT * INTO v_conf FROM public.access_conflict(
    v_req.company_id, v_req.work_role, v_req.section_key, v_level);
  IF FOUND THEN
    RAISE EXCEPTION 'ACCESS_DECIDE_DUTY_CONFLICT: % %', v_conf.reason, v_conf.instead_ask;
  END IF;

  IF (SELECT unrequestable_reason FROM public.access_sections
      WHERE key = v_req.section_key) IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_DECIDE_NOT_REQUESTABLE';
  END IF;

  v_max := public.access_max_grant_days(v_req.company_id);
  IF v_until IS NOT NULL THEN
    IF v_until < CURRENT_DATE THEN
      RAISE EXCEPTION 'ACCESS_DECIDE_END_DATE_PAST';
    END IF;
    IF v_until > CURRENT_DATE + v_max THEN
      RAISE EXCEPTION 'ACCESS_DECIDE_TOO_LONG: at most % days', v_max;
    END IF;
  END IF;

  --  The drawer's third check, enforced. Two live grants on one
  --  section would make "what can this person open" ambiguous.
  IF EXISTS (
    SELECT 1 FROM public.access_grants
    WHERE company_id = v_req.company_id AND user_id = v_req.requested_by
      AND section_key = v_req.section_key AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'ACCESS_DECIDE_EXISTING_GRANT';
  END IF;

  INSERT INTO public.access_grants (
    company_id, user_id, section_key, level, scope, valid_until, request_id, granted_by
  ) VALUES (
    v_req.company_id, v_req.requested_by, v_req.section_key,
    v_level, v_scope, v_until, v_req.id, v_admin
  );

  UPDATE public.access_permission_requests
  SET status = v_status, decided_by = v_admin, decided_at = now(),
      decision_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
      granted_level = v_level, granted_scope = v_scope, granted_until = v_until
  WHERE id = p_request_id RETURNING * INTO v_req;

  RETURN v_req;
END $$;

-- ── 9. Restricting or revoking a grant (step 5) ──────────────────────
CREATE OR REPLACE FUNCTION public.access_grant_revoke(
  p_grant_id uuid, p_reason text
) RETURNS public.access_grants
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_row   public.access_grants;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'ACCESS_REVOKE_NOT_SIGNED_IN';
  END IF;

  IF length(btrim(COALESCE(p_reason, ''))) = 0 THEN
    --  Same rule as a decline: a removal with no reason cannot be
    --  appealed or learned from, and reads as a mistake.
    RAISE EXCEPTION 'ACCESS_REVOKE_NO_REASON';
  END IF;

  SELECT * INTO v_row FROM public.access_grants WHERE id = p_grant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_REVOKE_NOT_FOUND';
  END IF;

  IF NOT public.app_is_company_member(v_row.company_id) THEN
    RAISE EXCEPTION 'ACCESS_REVOKE_NOT_A_MEMBER';
  END IF;

  IF v_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_REVOKE_ALREADY_REVOKED';
  END IF;

  UPDATE public.access_grants
  SET revoked_by = v_admin, revoked_at = now(), revoke_reason = btrim(p_reason)
  WHERE id = p_grant_id RETURNING * INTO v_row;

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.access_conflict(uuid, text, text, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.access_max_grant_days(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.access_request_raise(uuid, text, text, text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.access_decide(uuid, text, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.access_grant_revoke(uuid, text)                TO authenticated;
GRANT SELECT ON public.access_grants_active TO authenticated;

-- ── 10. Deploy-time assertions ───────────────────────────────────────
--  The two rules that must not silently stop being true. Both are
--  phrased as "this migration did not do its job", so a failed deploy
--  names the control rather than a constraint.
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.access_sections
  WHERE key = 'batch_release' AND unrequestable_reason IS NOT NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'W2_0_VIOLATION: batch release must be marked unrequestable '
      '(2.5, C8.6) — release is a step permission, not a page permission.';
  END IF;

  SELECT count(*) INTO v_n FROM public.access_duty_conflicts WHERE company_id IS NULL;
  IF v_n < 9 THEN
    RAISE EXCEPTION 'W2_0_VIOLATION: expected at least 9 shipped segregation-of-duties '
      'rules, found %. The automatic conflict check has nothing to check against.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.access_act_owners
  WHERE section_key = 'qa_disposition';
  IF v_n < 2 THEN
    RAISE EXCEPTION 'W2_0_VIOLATION: QA disposition has % named Act owner(s). With none, '
      'the allowlist is empty and every role may act in it.', v_n;
  END IF;

  --  No write policy on the requests table: every write must go
  --  through access_request_raise or access_decide, or the duties
  --  check can be bypassed with a direct POST.
  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'access_permission_requests'
    AND cmd <> 'SELECT';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'W2_0_VIOLATION: % write polic(ies) on access_permission_requests. '
      'Writes must go through the SECURITY DEFINER functions so the duties check runs.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'access_grants' AND cmd <> 'SELECT';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'W2_0_VIOLATION: % write polic(ies) on access_grants. A grant must '
      'only ever be written by access_decide.', v_n;
  END IF;
END $$;
