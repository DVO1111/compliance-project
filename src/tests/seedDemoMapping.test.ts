/**
 * The demo seed's source-to-target mapping.
 *
 * The mapping's correctness against the real schema is settled by the
 * rehearsal, which loads it into a database built from the migrations and
 * reports what arrived. What is pinned here is the part that must hold
 * before any database is involved: that every source table is accounted
 * for, that nothing is classified by name similarity, and that the things
 * which must never be seeded are not.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAPPINGS, MAPPABLE, classOf, unclassified } from '../../scripts/seed/demo/mapping';

/** The 42 tables the package generator emits. */
const SOURCE_TABLES = [
  'batch_records', 'batch_stage_parameter_readings', 'batch_stages',
  'calibration_records', 'capas', 'certificates_of_analysis', 'cleaning_records',
  'coa_templates', 'companies', 'company_members', 'deviation_links', 'deviations',
  'dispensing_records', 'documents', 'electronic_signatures', 'entity_current_state',
  'entity_state_history', 'environmental_monitoring', 'equipment', 'licences',
  'line_clearance_records', 'master_formula_materials', 'master_formula_stage_parameters',
  'master_formula_stages', 'master_formulas', 'material_certificates_of_analysis',
  'material_lots', 'material_specifications', 'materials', 'numbering_sequences',
  'personnel_certificates', 'product_registrations', 'production_lines', 'products',
  'qc_results', 'release_configurations', 'release_decisions', 'root_cause_analyses',
  'sites', 'specification_tests', 'training_assignments', 'vendors',
];

describe('every source table is accounted for', () => {
  it('classifies all 42, with none left silent', () => {
    //  A source table nobody has an opinion about would vanish from the
    //  report as well as from the load.
    expect(unclassified(SOURCE_TABLES)).toEqual([]);
  });

  it('gives every mapping a reason, not just a class', () => {
    for (const m of MAPPINGS) {
      expect(m.note.length).toBeGreaterThan(40);
    }
  });

  it('gives every mappable table a target and a load order', () => {
    for (const m of MAPPABLE) {
      expect(m.target).toBeTruthy();
      expect(m.order).toBeGreaterThan(0);
    }
    //  Order must be a total order, or the load is not reproducible.
    const orders = MAPPABLE.map((m) => m.order);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

describe('the things that must never be seeded', () => {
  it('blocks electronic signatures', () => {
    /*
     *  A hash computed under the generator's convention passes the
     *  application's CHECK and fails its verification. There is no safe
     *  way to carry 139 of them across.
     */
    expect(classOf('electronic_signatures')).toBe('blocked');
    expect(MAPPINGS.find((m) => m.source === 'electronic_signatures')!.target).toBeNull();
  });

  it('blocks both lifecycle tables', () => {
    //  State is the lifecycle engine's projection of transitions that
    //  actually happened, not an independent fact to assert.
    expect(classOf('entity_current_state')).toBe('blocked');
    expect(classOf('entity_state_history')).toBe('blocked');
  });

  it('blocks company_members, which would require creating the demo accounts', () => {
    expect(classOf('company_members')).toBe('blocked');
  });

  it('blocks batches, because the application refuses one against a draft formula', () => {
    //  Found by the database, not by reading: BATCH_FORMULA_NOT_APPROVED.
    expect(classOf('batch_records')).toBe('blocked');
    expect(classOf('batch_stages')).toBe('blocked');
  });

  it('emits no signature, member or lifecycle row', () => {
    const emitted = MAPPABLE.map((m) => m.target);
    for (const forbidden of ['electronic_signatures', 'company_members',
                             'entity_current_state', 'entity_state_history',
                             'batch_records', 'batch_stages']) {
      expect(emitted).not.toContain(forbidden);
    }
  });
});

describe('mappings are made on meaning, not on names', () => {
  it('sends the source\'s vendors to suppliers, not to vendors', () => {
    /*
     *  The application's `vendors` is a SERVICE vendor with a category
     *  vocabulary of cloud / payment / legal / logistics. The source's
     *  vendors are material suppliers, and material_lots.supplier_id
     *  references `suppliers`. Matching on the name was the first draft's
     *  mistake and the database refused it.
     */
    const m = MAPPINGS.find((x) => x.source === 'vendors')!;
    expect(m.target).toBe('suppliers');
    expect(m.klass).toBe('mappable');
  });

  it('does not map equipment onto instruments', () => {
    //  An instrument is a calibration-bearing measuring device. Importing
    //  a blender as one would misrepresent it.
    const m = MAPPINGS.find((x) => x.source === 'equipment')!;
    expect(m.klass).toBe('unsupported');
    expect(m.target).toBeNull();
  });

  it('does not map training assignments onto training responses', () => {
    expect(classOf('training_assignments')).toBe('unsupported');
  });

  it('carries the CAPA\'s deviation link without widening a regulated vocabulary', () => {
    /*
     *  capa_records.source has no "deviation" value and the application has
     *  a dedicated source_deviation_id column. The link goes there; the
     *  CHECK is not widened to fit a demo.
     */
    const m = MAPPINGS.find((x) => x.source === 'capas')!;
    expect(m.target).toBe('capa_records');
    expect(m.fields!.source_deviation_id).toBe('source_deviation_id');
    expect(m.constants!.source).toBe('internal_review');
  });
});

describe('values are mapped, never invented', () => {
  it('maps every enum through an explicit table', () => {
    for (const m of MAPPABLE) {
      for (const table of Object.values(m.enums ?? {})) {
        expect(Object.keys(table).length).toBeGreaterThan(0);
      }
    }
  });

  it('lands a source value with no counterpart on "other" rather than guessing', () => {
    //  `raw_ingredient` is neither an active ingredient nor an excipient,
    //  and saying either would assert something the source does not.
    const m = MAPPINGS.find((x) => x.source === 'materials')!;
    expect(m.enums!.material_type.raw_ingredient).toBe('other');
  });

  it('does not read the lot disposition as a status', () => {
    /*
     *  `disposition` is null on 25 of 26 source lots and holds a rejection
     *  disposition on the one returned to its supplier — a different fact
     *  from the lot's state, which the lifecycle engine owns.
     */
    const m = MAPPINGS.find((x) => x.source === 'material_lots')!;
    expect(Object.values(m.fields!)).not.toContain('status');
    expect(m.constants!.status).toBe('quarantine');
  });

  it('derives a denormalised value from the source rather than filling it in', () => {
    //  batch_records.product_name is NOT NULL and the source keeps it on
    //  the product.
    const m = MAPPINGS.find((x) => x.source === 'batch_records')!;
    expect(m.derives!.product_name).toEqual({
      from: 'products', via: 'product_id', take: 'trade_name',
    });
  });
});

describe('the build and reset tooling', () => {
  const BUILD = readFileSync(
    join(process.cwd(), 'scripts/seed/demo/build.ts'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('refuses a source table it has no classification for', () => {
    expect(BUILD).toMatch(/unclassified/);
    expect(BUILD).toMatch(/process\.exit\(1\)/);
  });

  it('wraps the load in one transaction', () => {
    expect(BUILD).toMatch(/'BEGIN;'/);
    expect(BUILD).toMatch(/'COMMIT;'/);
  });

  it('makes a repeated import a no-op', () => {
    expect(BUILD).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
  });

  it('builds the reset from a registry of what it wrote', () => {
    /*
     *  The package's own reset keys on companies.is_demo, which this
     *  application does not have. Deleting by recorded id means the reset
     *  cannot touch a record the seed did not create.
     */
    expect(BUILD).toMatch(/demo_seed_records/);
    expect(BUILD).toMatch(/SELECT record_id FROM demo_seed_records WHERE table_name/);
    expect(BUILD).not.toMatch(/is_demo/);
  });

  it('guards both the load and the reset on the demo environment', () => {
    const guards = BUILD.match(/criateur\.environment/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });
});
