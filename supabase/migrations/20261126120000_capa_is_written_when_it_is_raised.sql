-- =====================================================================
--  A CAPA IS SOMETHING YOU WRITE, NOT A BOX THAT GETS TICKED.
--
--  UAT: "After clicking 'raise CAPA', it just changes the status to a
--  CAPA has been raised without actually allowing me to write the CAPA,
--  add responsibility and timeline."
--
--  Exactly right, and it is the same shape as the change control
--  finding: an action that records an OUTCOME without capturing the
--  WORK. The deviation's closure checklist then ticks "A CAPA has been
--  raised" and the deviation becomes closeable on the strength of a
--  record that says nothing, has nobody's name on it and is due never.
--
--  WHERE THE GAP ACTUALLY IS. capa_raise_from_deviation is a good
--  function: it carries severity across as priority rather than quietly
--  downgrading somebody's assessment, writes a provenance line so the
--  CAPA is never an orphan, and links both directions. It simply has no
--  parameter for the three things the investigator has in their head at
--  the moment they raise it:
--
--    the description   there is a p_title, but description is OVERWRITTEN
--                      with the generated provenance line, so whatever
--                      the person wrote had nowhere to go
--    the owner         no parameter, and no column either — owner_name
--                      is text and nothing has ever written to it
--    the due date      p_due_date exists and the application never
--                      passed it
--
--  WHAT CHANGES
--
--  1. capa_records gains owner_id, a real reference, beside the legacy
--     owner_name text. A name is not an identity: that distinction was
--     the whole of yesterday's deviation-panel bug, where a record with
--     an owner reported "no owner" because only the name was carried.
--     Repeating it here with a text column would be choosing the same
--     bug on purpose.
--
--  2. The RPC accepts p_description and p_owner_id. The provenance line
--     is KEPT and the author's text is appended under it, because the
--     reason that line exists — "a CAPA that does not name its deviation
--     is an orphan the first time somebody asks why it exists" — is not
--     weakened by the person also explaining themselves.
--
--  3. An owner must be a member of the company the CAPA belongs to.
--     That is the one rule here worth enforcing server-side, and it is
--     cheap: assigning work to somebody outside the workspace produces a
--     CAPA nobody can see and nobody will do.
--
--  WHAT IS NOT ENFORCED HERE, said plainly rather than implied. The form
--  requires a description, an owner and a due date; the DATABASE still
--  permits all three to be null. Two reasons, and neither is laziness:
--  a NOT NULL would reject the CAPA already in this project that has
--  none of them, and a required argument would break any browser still
--  running the previous bundle the moment this applied — a cache making
--  the product fail is a worse outcome than a CAPA with a thin
--  description. Tightening belongs in its own migration once the old
--  bundle is gone, and the columns are shaped for it.
-- =====================================================================

ALTER TABLE public.capa_records
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.capa_records.owner_id IS
  'Who is accountable for completing this CAPA. The identity; owner_name is a legacy display string and is not authoritative.';

CREATE INDEX IF NOT EXISTS capa_records_owner_idx
  ON public.capa_records (owner_id) WHERE owner_id IS NOT NULL;

--  DROPPED, NOT "OR REPLACED". Postgres identifies a function by its
--  argument types, so adding p_description and p_owner_id to a CREATE OR
--  REPLACE produces a SECOND function rather than a new version of this
--  one — and which of the two PostgREST calls would then depend on the
--  arguments the browser happened to send, which is a coin toss between
--  a CAPA that records the author's text and one that silently drops it.
--  The assertion at the foot of this file fails if two ever coexist.
DROP FUNCTION IF EXISTS public.capa_raise_from_deviation(
  uuid, text, text, text, boolean, timestamptz);

CREATE OR REPLACE FUNCTION public.capa_raise_from_deviation(
  p_deviation_id uuid,
  p_title        text    DEFAULT NULL,
  p_capa_type    text    DEFAULT 'corrective',
  p_priority     text    DEFAULT NULL,
  p_is_systemic  boolean DEFAULT false,
  p_due_date     timestamptz DEFAULT NULL,
  p_description  text    DEFAULT NULL,
  p_owner_id     uuid    DEFAULT NULL
)
RETURNS public.capa_records
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_dev  public.deviations;
  v_n    bigint;
  v_row  public.capa_records;
  v_prio text;
  v_own  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'CAPA_UNAUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_dev FROM public.deviations WHERE id = p_deviation_id;
  IF v_dev.id IS NULL THEN
    RAISE EXCEPTION 'CAPA_DEVIATION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.app_is_company_member(v_dev.company_id, v_uid) THEN
    RAISE EXCEPTION 'CAPA_FORBIDDEN: not a member of that company' USING ERRCODE = 'P0001';
  END IF;

  --  Work assigned outside the workspace is work nobody can see and
  --  nobody will do, so this one is refused rather than recorded.
  IF p_owner_id IS NOT NULL
     AND NOT public.app_is_company_member(v_dev.company_id, p_owner_id) THEN
    RAISE EXCEPTION 'CAPA_OWNER_NOT_A_MEMBER: that person is not a member of this workspace'
      USING ERRCODE = 'P0001';
  END IF;

  --  Severity carries over as priority unless the caller says otherwise.
  --  A critical deviation producing a medium CAPA by default would be a
  --  quiet downgrade of somebody else's assessment.
  v_prio := coalesce(p_priority, CASE v_dev.severity
    WHEN 'critical' THEN 'critical' WHEN 'major' THEN 'high' ELSE 'medium' END);

  --  Kept for the screens that still read the text column, and derived
  --  rather than typed so the two cannot disagree about who the owner is.
  SELECT coalesce(nullif(btrim(pr.full_name), ''), pr.email)
    INTO v_own
    FROM public.profiles pr WHERE pr.id = p_owner_id;

  SELECT coalesce(max(substring(capa_number from '[0-9]+$')::bigint), 0) + 1
    INTO v_n
    FROM public.capa_records
   WHERE company_id = v_dev.company_id
     AND capa_number ~ '^CAPA-[0-9]+$';

  INSERT INTO public.capa_records (
    company_id, capa_number, title, description, source, capa_type, priority,
    batch_id, is_systemic, source_deviation_id, due_date, owner_id, owner_name, created_by
  ) VALUES (
    v_dev.company_id,
    'CAPA-' || lpad(v_n::text, 5, '0'),
    coalesce(nullif(btrim(coalesce(p_title,'')), ''),
             v_dev.deviation_number || ' — ' || v_dev.title),
    --  THE PROVENANCE LINE IS KEPT, and the author's own text goes under
    --  it. The line exists because a CAPA that does not name its
    --  deviation is an orphan the first time somebody asks why it
    --  exists; the person also explaining themselves does not make that
    --  less true, so this appends rather than replaces.
    'Raised from deviation ' || v_dev.deviation_number || ' (' || v_dev.severity
      || ', product quality impact: ' || v_dev.product_quality_impact || ').'
      || coalesce(E'\n\n' || v_dev.description, '')
      || coalesce(E'\n\n' || nullif(btrim(coalesce(p_description, '')), ''), ''),
    'internal_review',
    p_capa_type,
    v_prio,
    CASE WHEN v_dev.source_type = 'batch' THEN v_dev.source_id ELSE NULL END,
    coalesce(p_is_systemic, false),
    v_dev.id,
    p_due_date,
    p_owner_id,
    v_own,
    v_uid
  ) RETURNING * INTO v_row;

  --  The link in both directions. deviation_links is what the deviation
  --  screen reads; source_deviation_id is what the CAPA screen reads.
  INSERT INTO public.deviation_links (company_id, deviation_id, linked_type, linked_id, created_by)
  VALUES (v_dev.company_id, v_dev.id, 'capa', v_row.id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN v_row;
END
$function$;

COMMENT ON FUNCTION public.capa_raise_from_deviation(uuid, text, text, text, boolean, timestamptz, text, uuid) IS
  'Raises a CAPA from a deviation, carrying the deviation''s severity across as priority and linking both directions. Accepts the investigator''s description, owner and due date; the owner must be a member of the same workspace.';

--  The drop took the grants with it, so they are restored exactly as
--  they were: postgres, anon, authenticated, service_role. anon is
--  included because it was there before and this migration is not the
--  place to change who may call it — the function refuses an
--  unauthenticated caller on its first line regardless.
GRANT EXECUTE ON FUNCTION public.capa_raise_from_deviation(
  uuid, text, text, text, boolean, timestamptz, text, uuid)
  TO anon, authenticated, service_role;

-- ── Deploy-time assertions ──────────────────────────────────────────────────

DO $assert$
DECLARE v_src text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='capa_records'
                    AND column_name='owner_id') THEN
    RAISE EXCEPTION 'DEPLOY GUARD: capa_records.owner_id was not created.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='capa_raise_from_deviation' AND p.prokind='f'
   LIMIT 1;

  IF v_src IS NULL OR v_src NOT LIKE '%p_owner_id%' OR v_src NOT LIKE '%p_description%' THEN
    RAISE EXCEPTION 'DEPLOY GUARD: the CAPA raise function does not accept an owner and a description.';
  END IF;

  --  The provenance line is the thing most easily lost when a function
  --  this size is restated, and losing it is how a CAPA becomes an
  --  orphan.
  IF v_src NOT LIKE '%Raised from deviation%' THEN
    RAISE EXCEPTION 'DEPLOY GUARD: the provenance line was dropped from the description.';
  END IF;

  IF v_src NOT LIKE '%CAPA_OWNER_NOT_A_MEMBER%' THEN
    RAISE EXCEPTION 'DEPLOY GUARD: the owner membership check is missing.';
  END IF;

  --  Only one overload may exist. Two would make which one PostgREST
  --  picks depend on the arguments the client happened to send.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='capa_raise_from_deviation') <> 1 THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: more than one capa_raise_from_deviation exists; the old signature must be replaced, not joined.';
  END IF;
END $assert$;
