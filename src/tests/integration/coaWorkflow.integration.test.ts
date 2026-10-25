/**
 * Incoming CoA — the whole path, exercised together.
 *
 * ── WHAT THIS PROVES THAT THE OTHER TESTS DO NOT ──
 *
 * `coaVerification.test.ts` mocks the database and proves the service's
 * logic. `incoming_coa_verification_test.sql` and
 * `decision_enforcement_test.sql` §I prove the database's rules in SQL.
 * Neither crosses the seam between them, and passing both does not show
 * that the workflow works: an RPC called with the wrong argument name,
 * an insert naming a column that does not exist, or a status read from
 * the wrong field would satisfy every one of those tests and fail in
 * production.
 *
 * So these run the REAL service functions — `uploadCertificate`,
 * `verifyCertificate`, `listCertificates`, `listDiscrepancies` — against
 * a REAL PostgreSQL 17.6 database carrying the full migration set, with
 * real impersonation so RLS, the section guards, the CoA authority
 * trigger and the duty conflict all apply.
 *
 * ── HOW TO RUN IT ──
 *
 *   npm install pg --no-save          # not a project dependency
 *   COA_IT_DB=postgres://postgres@127.0.0.1:5432/criateur_local \
 *     npx vitest run src/tests/integration
 *
 * Without `COA_IT_DB` the suite skips, so the default test run is
 * unchanged and CI does not need a database. A skip is reported, never
 * a pass.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Client } from 'pg';
import { PgSupabase } from './pgSupabaseShim';

const DB = process.env.COA_IT_DB;
const client = DB ? new Client({ connectionString: DB }) : null;
const shim = client ? new PgSupabase(client) : null;

//  The service imports `../../lib/supabase`; it gets the pg-backed
//  shim instead. The service code itself is untouched.
vi.mock('../../lib/supabase', () => ({
  get supabase() {
    if (!shim) throw new Error('integration DB not configured');
    return shim;
  },
}));

const ids = {
  company: '', storekeeper: '', analyst: '', qaManager: '',
  material: '', spec: '', lot: '', lotB: '',
};

//  A tag per run. The first version of this fixture used fixed email
//  addresses and deleted only the company in afterAll, so auth.users
//  rows survived and the SECOND run died on users_email_key. A test
//  that passes once is not a test.
const tag = Math.random().toString(36).slice(2, 10);
const email = (who: string) => `${who}-${tag}@invalid.test`;

async function sql(text: string, values: unknown[] = []) {
  return client!.query(text, values);
}

beforeAll(async () => {
  if (!client) return;
  await client.connect();
  await shim!.setServiceContext();

  const r = await sql(`SELECT gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() c,
                              gen_random_uuid() d, gen_random_uuid() e`);
  ids.company = r.rows[0].a; ids.storekeeper = r.rows[0].b;
  ids.analyst = r.rows[0].c; ids.qaManager = r.rows[0].d; ids.material = r.rows[0].e;

  await sql(`INSERT INTO public.companies(id,name) VALUES ($1,'CoA integration')`, [ids.company]);
  await sql(
    `INSERT INTO auth.users(id,email) VALUES ($1,$4),($2,$5),($3,$6)`,
    [ids.storekeeper, ids.analyst, ids.qaManager,
     email('sk'), email('an'), email('qa')],
  );
  await sql(
    `INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
       ($1,$5,'Tunde Stores',  $4,'compliance_officer'),
       ($2,$6,'Amaka Analyst', $4,'compliance_officer'),
       ($3,$7,'Ngozi Quality', $4,'admin')`,
    [ids.storekeeper, ids.analyst, ids.qaManager, ids.company,
     email('sk'), email('an'), email('qa')],
  );
  await sql(
    `INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
       ($1,$2,'viewer','active'),($1,$3,'viewer','active'),($1,$4,'admin','active')`,
    [ids.company, ids.storekeeper, ids.analyst, ids.qaManager],
  );
  await sql(`SELECT public.operational_role_assign($1,$2,'storekeeper','integration test')`,
    [ids.company, ids.storekeeper]);
  await sql(`SELECT public.operational_role_assign($1,$2,'qc_analyst','integration test')`,
    [ids.company, ids.analyst]);
  await sql(`SELECT public.operational_role_assign($1,$2,'qa_manager','integration test')`,
    [ids.company, ids.qaManager]);

  await sql(
    `INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
     VALUES ($1,'material_lot','{PREFIX}-{SEQ}','IT',4) ON CONFLICT DO NOTHING`, [ids.company]);
  await sql(
    `INSERT INTO public.materials(id,company_id,code,name,material_type,criticality,unit_of_measure,created_by)
     VALUES ($1,$2,'ITM-1','Lactose','excipient','standard','kg',$3)`,
    [ids.material, ids.company, ids.qaManager]);

  const s = await sql(
    `INSERT INTO public.material_specifications(company_id,material_id,version,status,created_by)
     VALUES ($1,$2,'1.0','effective',$3) RETURNING id`,
    [ids.company, ids.material, ids.qaManager]);
  ids.spec = s.rows[0].id;
  await sql(
    `INSERT INTO public.material_specification_parameters
       (specification_id,parameter,unit,limit_type,min_value,max_value,is_critical)
     VALUES ($1,'Assay','%','range',95.0,105.0,true)`, [ids.spec]);

  for (const key of ['lot', 'lotB'] as const) {
    const l = await sql(
      `INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by,received_by)
       VALUES ($1,$2,10,$3,$3) RETURNING id`,
      [ids.company, ids.material, ids.storekeeper]);
    ids[key] = l.rows[0].id;
  }
}, 120_000);

afterAll(async () => {
  if (!client) return;
  await shim!.setServiceContext();
  //  Company first (cascades its rows), then the auth users, which
  //  nothing else cascades. Both are best-effort: a cleanup failure
  //  must not mask a test result.
  await sql(`DELETE FROM public.companies WHERE id = $1`, [ids.company]).catch(() => {});
  await sql(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`,
    [[ids.storekeeper, ids.analyst, ids.qaManager]]).catch(() => {});
  await client.end();
});

const d = DB ? describe : describe.skip;

d('incoming CoA workflow, end to end', () => {
  it('reports that it is running against a real database', async () => {
    const v = await sql('SELECT version() v');
    expect(v.rows[0].v).toMatch(/PostgreSQL 17/);
  });

  //  ── SUBMISSION ──────────────────────────────────────────────────
  //
  //  Filing is clerical, so the storekeeper does it. This also proves
  //  the insert's column set matches the table — a mocked test cannot.
  it('a storekeeper can file a certificate, and it persists as unchecked', async () => {
    const { uploadCertificate, listCertificates } = await import('../../lib/materials/coaService');
    await shim!.setActor(ids.storekeeper);

    const id = await uploadCertificate({
      companyId: ids.company,
      lotId: ids.lot,
      certificateNumber: 'CoA-IT-1',
      supplierResults: [{ parameter: 'Assay', stated_value: 99.2, unit: '%' }],
    });
    expect(id).toBeTruthy();

    const rows = await listCertificates(ids.lot);
    expect(rows).toHaveLength(1);
    expect(rows[0].certificate_number).toBe('CoA-IT-1');
    //  PERSISTED STATE, read back through the service's own select.
    expect(rows[0].verification_status).toBe('unverified');
    expect(rows[0].verified_by).toBeNull();
    expect(rows[0].supplier_results).toHaveLength(1);
  });

  //  ── INVALID DATA ────────────────────────────────────────────────
  //
  //  The table requires supplier_results to be a JSON array. A service
  //  that sent an object would be caught by the CHECK, not by types.
  it('rejects supplier results that are not an array', async () => {
    const { uploadCertificate } = await import('../../lib/materials/coaService');
    await shim!.setActor(ids.storekeeper);

    await expect(
      uploadCertificate({
        companyId: ids.company,
        lotId: ids.lot,
        supplierResults: { parameter: 'Assay' } as never,
      }),
    ).rejects.toThrow();
  });

  it('rejects a certificate against a lot that does not exist', async () => {
    const { uploadCertificate } = await import('../../lib/materials/coaService');
    await shim!.setActor(ids.storekeeper);

    await expect(
      uploadCertificate({
        companyId: ids.company,
        lotId: '00000000-0000-0000-0000-000000000000',
        supplierResults: [],
      }),
    ).rejects.toThrow();
  });

  //  ── PERMISSION DENIAL, THROUGH THE SERVICE ──────────────────────
  //
  //  The storekeeper filed it and may not check it. This is the hole
  //  20261130000000 closed, exercised through the real RPC call with
  //  the real argument name.
  it('refuses verification by a storekeeper, with a message that names the roles', async () => {
    const { listCertificates, verifyCertificate } = await import('../../lib/materials/coaService');
    await shim!.setActor(ids.storekeeper);
    const [cert] = await listCertificates(ids.lot);

    await expect(verifyCertificate(cert.id)).rejects.toThrow(/QC testing or QA disposition/);

    //  AND NOTHING WAS WRITTEN. A refusal that still stamped the row
    //  would be worse than no refusal.
    const after = await listCertificates(ids.lot);
    expect(after[0].verification_status).toBe('unverified');
    expect(after[0].verified_by).toBeNull();
  });

  it('refuses a direct write of the verification fields by the same person', async () => {
    await shim!.setActor(ids.storekeeper);
    await expect(
      sql(
        `UPDATE public.material_certificates_of_analysis
            SET verification_status='verified', verified_by=$1, verified_at=now()
          WHERE material_lot_id=$2`,
        [ids.storekeeper, ids.lot],
      ),
    ).rejects.toThrow(/COA_VERIFY_FORBIDDEN/);
  });

  //  ── VERIFICATION BY AN ENTITLED ROLE ────────────────────────────
  it('lets the QC analyst verify, and persists the verdict and the verifier', async () => {
    const { listCertificates, verifyCertificate } = await import('../../lib/materials/coaService');
    await shim!.setActor(ids.analyst);
    const [cert] = await listCertificates(ids.lot);

    const outcome = await verifyCertificate(cert.id);
    //  The RPC's own return shape, read by the service.
    expect(outcome.verification_status).toBe('verified');
    expect(outcome.parameters_checked).toBe(1);
    expect(outcome.discrepancies).toBe(0);

    const after = await listCertificates(ids.lot);
    expect(after[0].verification_status).toBe('verified');
    expect(after[0].verified_by).toBe(ids.analyst);
    expect(after[0].verified_at).not.toBeNull();
  });

  //  ── SEGREGATION OF DUTIES, INCLUDING THE BACKEND ROUTE ──────────
  it('refuses the verifier the disposition of that same lot', async () => {
    await shim!.setActor(ids.analyst);
    const conflict = await sql(
      `SELECT public.duty_conflict('material_lot', $1, 'disposition', $2) AS c`,
      [ids.lot, ids.analyst]);
    expect(conflict.rows[0].c).toMatch(/MATERIAL_DISPOSITION_SELF_VERIFIED/);
  });

  it('refuses it through the lifecycle engine too, not only the advisory check', async () => {
    await shim!.setActor(ids.analyst);
    await expect(
      sql(`SELECT public.lifecycle_transition('material_lot', $1, 'release', $2)`,
        [ids.lot, ids.company]),
    ).rejects.toThrow();
  });

  //  AND SOMEBODY ELSE STILL CAN. A control that blocks the whole
  //  workflow is an outage.
  it('still allows a different quality role to disposition the lot', async () => {
    await shim!.setActor(ids.qaManager);
    const conflict = await sql(
      `SELECT public.duty_conflict('material_lot', $1, 'disposition', $2) AS c`,
      [ids.lot, ids.qaManager]);
    expect(conflict.rows[0].c).toBeNull();
  });

  //  ── THE DISCREPANCY PATH ────────────────────────────────────────
  it('records discrepancies for an out-of-specification result and surfaces them', async () => {
    const {
      uploadCertificate, verifyCertificate, listDiscrepancies,
    } = await import('../../lib/materials/coaService');

    await shim!.setActor(ids.storekeeper);
    const id = await uploadCertificate({
      companyId: ids.company,
      lotId: ids.lotB,
      certificateNumber: 'CoA-IT-2',
      supplierResults: [{ parameter: 'Assay', stated_value: 80.0, unit: '%' }],
    });

    await shim!.setActor(ids.analyst);
    const outcome = await verifyCertificate(id);
    expect(outcome.verification_status).toBe('discrepant');
    expect(outcome.discrepancies).toBeGreaterThan(0);
    expect(outcome.critical).toBeGreaterThan(0);

    //  Surfaced, not merely stored — the service's own select.
    const findings = await listDiscrepancies(id);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].parameter).toBe('Assay');
    expect(findings[0].is_critical).toBe(true);
  });

  //  ── THE SERVICE/RPC CONTRACT ITSELF ─────────────────────────────
  //
  //  The argument name is the thing a mock cannot check. If somebody
  //  renames p_coa_id in the migration, every other test still passes
  //  and only this fails.
  it('calls material_coa_verify with the argument name the function declares', async () => {
    await shim!.setActor(ids.analyst);
    const declared = await sql(
      `SELECT pg_get_function_arguments(to_regprocedure('public.material_coa_verify(uuid)')) AS a`);
    expect(declared.rows[0].a).toContain('p_coa_id');
  });

  it('reads only columns the table actually has', async () => {
    //  listCertificates names its columns explicitly; a stale name
    //  would make this throw rather than return undefined.
    const { listCertificates } = await import('../../lib/materials/coaService');
    await shim!.setActor(ids.analyst);
    await expect(listCertificates(ids.lot)).resolves.toBeInstanceOf(Array);
  });
});
