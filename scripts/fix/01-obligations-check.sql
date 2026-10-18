SELECT 'regulatory_obligations exists' AS item,
       (to_regclass('public.regulatory_obligations') IS NOT NULL)::text AS value
UNION ALL
SELECT 'its company_id foreign key',
       coalesce((
         SELECT conname || ' -> ' || confrelid::regclass::text
         FROM pg_constraint
         WHERE conrelid = to_regclass('public.regulatory_obligations')
           AND contype = 'f'
           AND pg_get_constraintdef(oid) LIKE '%company_id%'
         LIMIT 1
       ), 'none')
UNION ALL
SELECT 'rows whose company_id is not a company',
       coalesce((
         SELECT count(*)::text FROM public.regulatory_obligations o
         WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = o.company_id)
       ), 'n/a')
UNION ALL
SELECT 'licence_audit_step exists',
       (to_regprocedure('public.licence_audit_step(uuid, text, text, uuid, jsonb)') IS NOT NULL)::text
UNION ALL
SELECT 'audit_logs exists',
       (to_regclass('public.audit_logs') IS NOT NULL)::text;
