-- =====================================================================
--  READ-ONLY PREFLIGHT — contraband_rejection_log.rejection_reason
--
--  WHAT THIS IS FOR
--  ----------------
--  `status` and `flag_type` on the logistics tables are constrained by
--  CHECK. `rejection_reason` is `text NOT NULL` with no constraint at
--  all (20260609100000), even though the application has treated it as
--  a closed list for as long as it has existed.
--
--  THE EVIDENCE THAT IT IS A CLOSED LIST
--  -------------------------------------
--  `REJECTION_REASONS` in src/lib/contrabandService.ts holds eleven
--  values, and ContrabandRejectionPage renders them as a <select> —
--  not a free-text box — and refuses to submit without one:
--
--      Prohibited Item — Narcotics/Drugs
--      Prohibited Item — Weapons/Ammunition
--      Prohibited Item — Counterfeit Goods
--      Prohibited Item — Hazardous Materials
--      Prohibited Item — Wildlife / CITES
--      Prohibited Item — Stolen Property
--      Prohibited Item — Pornographic Material
--      Undeclared / Misdeclared Item
--      Sanctioned Sender / Recipient
--      Customs Declaration Fraud
--      Other Policy Violation
--
--  So the vocabulary is not invented here. It is read out of the code
--  that already writes the column, which is the only evidence that
--  exists for it: W6 does not draw this screen, and no requirement
--  document states the list.
--
--  WHY THAT IS STILL NOT ENOUGH TO ADD A CHECK
--  -------------------------------------------
--  Two reasons, and the second is the one that matters:
--
--    1. The column is free text today, so any row written before the
--       list settled, or written by anything other than that form —
--       a direct API call, an import, a fixture — may hold something
--       else. A CHECK added without looking would abort on it.
--
--    2. `Other Policy Violation` already exists as the tail of the
--       list. A CHECK would mean every genuinely new reason needs a
--       migration before it can be recorded, and a customs officer
--       with a reason the list does not cover would have to file it as
--       "Other" or not at all. Whether that trade is wanted is a
--       product decision, not a schema cleanup.
--
--  This script reports what is actually in the column. It decides
--  nothing and changes nothing.
--
--  HOW TO RUN IT
--  -------------
--      psql "$DATABASE_URL" -X -f scripts/preflight/rejection-reason-vocabulary.sql
--
--  SELECT-only. Note that it prints DISTINCT REASON VALUES, which are
--  operational data; the shipment reference, customer name and items
--  found are deliberately NOT selected.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '  rejection_reason VOCABULARY PREFLIGHT  (read-only)'
\echo '═══════════════════════════════════════════════════════════════'
\echo ''

SELECT current_database() AS database, current_user AS run_as, now() AS run_at;

\echo ''
\echo '── 1. The column as it stands ─────────────────────────────────'
\echo ''

SELECT a.attname        AS column_name,
       format_type(a.atttypid, a.atttypmod) AS type,
       a.attnotnull     AS not_null,
       coalesce((SELECT string_agg(k.conname, ', ')
                   FROM pg_constraint k
                  WHERE k.conrelid = a.attrelid
                    AND k.contype = 'c'
                    AND a.attnum = ANY (k.conkey)), '(none)') AS check_constraints
  FROM pg_attribute a
 WHERE a.attrelid = 'public.contraband_rejection_log'::regclass
   AND a.attname IN ('rejection_reason', 'status')
 ORDER BY a.attname;

\echo ''
\echo '   For contrast: `status` on the same table IS constrained.'
\echo '   That asymmetry is what prompted the question.'
\echo ''

\echo ''
\echo '── 2. Every distinct value actually stored ────────────────────'
\echo ''

SELECT rejection_reason,
       count(*) AS rows,
       min(rejection_date) AS first_seen,
       max(rejection_date) AS last_seen
  FROM public.contraband_rejection_log
 GROUP BY rejection_reason
 ORDER BY count(*) DESC, rejection_reason;

\echo ''
\echo '── 3. Values OUTSIDE the eleven the application offers ────────'
\echo '   These are the rows a CHECK would abort on. The list below is'
\echo '   copied from REJECTION_REASONS in contrabandService.ts; if'
\echo '   that constant changes, change this too or the answer is'
\echo '   stale.'
\echo ''

WITH accepted(value) AS (
  VALUES
    ('Prohibited Item — Narcotics/Drugs'),
    ('Prohibited Item — Weapons/Ammunition'),
    ('Prohibited Item — Counterfeit Goods'),
    ('Prohibited Item — Hazardous Materials'),
    ('Prohibited Item — Wildlife / CITES'),
    ('Prohibited Item — Stolen Property'),
    ('Prohibited Item — Pornographic Material'),
    ('Undeclared / Misdeclared Item'),
    ('Sanctioned Sender / Recipient'),
    ('Customs Declaration Fraud'),
    ('Other Policy Violation')
)
SELECT r.rejection_reason AS unrecognised_value,
       count(*) AS rows,
       --  A value that differs only by whitespace or case is a
       --  different problem from a genuinely new reason: the first can
       --  be normalised, the second needs a decision.
       EXISTS (SELECT 1 FROM accepted a
                WHERE lower(btrim(a.value)) = lower(btrim(r.rejection_reason)))
         AS matches_apart_from_case_or_spacing
  FROM public.contraband_rejection_log r
 WHERE r.rejection_reason NOT IN (SELECT value FROM accepted)
 GROUP BY r.rejection_reason
 ORDER BY count(*) DESC;

\echo ''
\echo '── 4. Blank and near-blank values ────────────────────────────'
\echo '   NOT NULL does not catch an empty string, and the dash in the'
\echo '   accepted values is an EM DASH (U+2014) — a value typed with a'
\echo '   hyphen would not match.'
\echo ''

SELECT count(*) FILTER (WHERE btrim(rejection_reason) = '')          AS blank,
       count(*) FILTER (WHERE rejection_reason <> btrim(rejection_reason)) AS padded,
       count(*) FILTER (WHERE rejection_reason LIKE '%' || chr(8212) || '%') AS uses_em_dash,
       count(*) FILTER (WHERE rejection_reason LIKE '%-%')           AS uses_hyphen,
       count(*)                                                      AS total
  FROM public.contraband_rejection_log;

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '  PROPOSAL  (not applied — no migration file is created)'
\echo '═══════════════════════════════════════════════════════════════'
\echo ''
\echo '  If section 3 is EMPTY and the product owner accepts that a new'
\echo '  reason needs a migration, the safe form is the one already'
\echo '  used for shipment_events_event_type_check in 20261203000000:'
\echo ''
\echo '    ALTER TABLE public.contraband_rejection_log'
\echo '      ADD CONSTRAINT contraband_rejection_reason_chk'
\echo '      CHECK (rejection_reason IN ( ...the eleven... )) NOT VALID;'
\echo ''
\echo '    ALTER TABLE public.contraband_rejection_log'
\echo '      VALIDATE CONSTRAINT contraband_rejection_reason_chk;'
\echo ''
\echo '  NOT VALID first means a pre-existing odd row surfaces at'
\echo '  VALIDATE rather than aborting the deployment, and VALIDATE'
\echo '  takes a weaker lock than adding a valid constraint outright.'
\echo ''
\echo '  If section 3 is NOT empty: do not add the constraint. Decide'
\echo '  each value first. A rejection reason is the stated grounds on'
\echo '  which somebody refused a shipment, so rewriting one to fit a'
\echo '  list changes a record of a decision.'
\echo ''
\echo '  A WEAKER OPTION, if the list is not meant to be closed:'
\echo '  constrain only what is certainly wrong —'
\echo ''
\echo '    CHECK (btrim(rejection_reason) <> '''')'
\echo ''
\echo '  which follows material_rejection_reason_chk in'
\echo '  20261004000000 and rules out a blank without fixing the'
\echo '  vocabulary. This is the recommended step if the product owner'
\echo '  has not decided whether the list is closed.'
\echo ''
