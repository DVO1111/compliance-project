/**
 * Source-to-target mapping for the Criateur demonstration seed.
 *
 * The supplied generator targets `source/prd_tables_extracted.sql`. This
 * application's schema moved on from that extract independently, so every
 * source table is classified here against what the application actually
 * has — judged on field semantics, relationships and constraints, not on
 * table-name similarity.
 *
 * `docs/seed/RECONCILIATION_2026-10-27.md` has the evidence: candidate
 * matches scored by column overlap, where the best was 70% and most were
 * generic `id`/`company_id`/`created_at` noise. Nothing here was chosen
 * because two tables had similar names.
 *
 * ── THE FOUR CLASSES ──────────────────────────────────────────────────────
 *
 *   mappable     an application table holds the same thing. Field names
 *                differ; meaning does not.
 *   adaptable    the application models it, in a different shape. The
 *                transformation is real work and is described per table.
 *   unsupported  the application has no entity or workflow for it. Not a
 *                gap to fill from a demo seed.
 *   blocked      a product or security decision has to come first.
 *
 * Only `mappable` is emitted by build.ts. The rest are reported, with the
 * reason, so the gap is visible rather than silently dropped.
 */

export type MappingClass = 'mappable' | 'adaptable' | 'unsupported' | 'blocked';

export interface TableMapping {
  source: string;
  target: string | null;
  klass: MappingClass;
  /** Why — in terms of what the data means, not what it is called. */
  note: string;
  /** source column -> target column. Columns absent here are dropped. */
  fields?: Record<string, string>;
  /** Values the target must carry that the source does not supply. */
  constants?: Record<string, string | number | boolean | null>;
  /** Source values the target's CHECK will not accept, mapped across. */
  enums?: Record<string, Record<string, string>>;
  /**
   * A target column whose value lives on a RELATED source row.
   *
   * The application denormalises some values the source keeps normalised —
   * `batch_records.product_name` is the clearest case. Resolving it from
   * the source's own products table preserves the meaning exactly; filling
   * it with a constant would invent it.
   */
  derives?: Record<string, { from: string; via: string; take: string }>;
  /**
   * Emit only the source rows where this field has this value.
   *
   * For a source table that mixes two kinds of thing where the application
   * models only one — not a filter for convenience. Dropped rows are
   * reported.
   */
  only?: { field: string; equals: string };
  /**
   * Emit only rows whose foreign key resolves to a row this build EMITTED.
   *
   * Not the same as `only`. A source table can reference a parent the
   * mapping deliberately did not emit — `specification_tests` has 9 of 54
   * rows against the one `material_specifications` row that is a PRODUCT
   * specification and is filtered out. Loading them would violate the
   * foreign key halfway through the transaction and abort the whole import.
   *
   * Each dropped row is reported with the parent it wanted, so this is a
   * stated consequence of an earlier decision rather than a silent trim.
   */
  requires?: { field: string; from: string }[];
  /**
   * A target column computed from the source row itself.
   *
   * For the cases where the application requires a value that the source
   * DOES supply, but spread across columns rather than named. Two in use:
   *
   *   limit_type   the application names the shape of an acceptance limit;
   *                the source expresses it by which of min/max/text it
   *                filled in. Reading that back is a restatement, not a
   *                guess.
   *   role         a material's role in a formula. The source records the
   *                material's own TYPE, so `api` gives `active` as a fact.
   *                Everything else gets the application's own catch-all
   *                rather than a guessed excipient function.
   *
   * A function, not a lookup table, because the inputs are several columns.
   * It returns `undefined` to leave the column unset.
   */
  computed?: Record<string, (row: Record<string, unknown>,
                             tables: Record<string, Record<string, unknown>[]>) => unknown>;
  /**
   * The reset does not delete this table; its parent's delete cascades it.
   *
   * Needed, not tidiness. The three master-formula child tables carry
   * `fn_master_formula_child_freeze`, which refuses INSERT, UPDATE and
   * DELETE on the children of an APPROVED formula:
   *
   *   MASTER_FORMULA_APPROVED_FROZEN: master_formula_materials cannot be
   *   changed on an approved formula.
   *
   * That rule is correct — an approved formula is frozen and a change
   * means a new version — and it means the reset's default of deleting in
   * reverse insertion order cannot undo a formula that has since been
   * approved through the application. The children's foreign key is
   * ON DELETE CASCADE, and the trigger resolves the parent's status by
   * SELECT, so once the parent row is gone it reads NULL and the delete is
   * permitted. Deleting the parent first therefore works where deleting
   * the children first does not — verified against the database, and the
   * registry still bounds exactly what goes.
   */
  resetVia?: 'cascade';
  /** Load order within the mappable set; lower first. */
  order?: number;
}

export const MAPPINGS: TableMapping[] = [
  // ── mappable ───────────────────────────────────────────────────────────
  {
    source: 'companies', target: 'companies', klass: 'mappable', order: 1,
    note: 'The same entity. `industry` and `is_demo` have no counterpart: '
      + 'the application segments by product_categories, and demo ownership '
      + 'is tracked in the seed registry rather than on the row.',
    fields: { id: 'id', name: 'name', trading_name: 'trading_name', country: 'country' },
  },
  {
    source: 'sites', target: 'sites', klass: 'mappable', order: 2,
    note: 'The same entity. site_type is constrained to manufacturing / '
      + 'warehouse / laboratory / office.',
    fields: { id: 'id', company_id: 'company_id', name: 'name', address: 'address' },
    constants: { site_type: 'manufacturing' },
  },
  {
    source: 'production_lines', target: 'production_lines', klass: 'mappable', order: 3,
    note: 'The same entity. The application keys a line by `code` within a company.',
    fields: {
      id: 'id', company_id: 'company_id', line_code: 'code', name: 'name',
      description: 'description',
    },
  },
  {
    source: 'vendors', target: 'suppliers', klass: 'mappable', order: 4,
    /*
     *  NOT the application's `vendors` table, despite the name.
     *
     *  `vendors.category` is a SERVICE vocabulary — cloud, payment, legal,
     *  logistics_carrier, customs_broker, contract_manufacturer. The
     *  source's vendors are material suppliers, and the application keeps
     *  those in `suppliers`, which is what material_lots.supplier_id
     *  actually references.
     *
     *  Caught by the database refusing the load, not by reading: the first
     *  draft of this mapping matched on the table name and the shape, which
     *  is the mistake this whole exercise is supposed to avoid.
     *
     *  One source row is a CUSTOMER rather than a supplier. It has no home
     *  here and is not emitted — the application has no customer register.
     */
    note: 'Material suppliers. The application keeps them in `suppliers`, '
      + 'which material_lots.supplier_id references; its `vendors` table is '
      + 'for service vendors and has an unrelated category vocabulary. The '
      + 'single customer row is dropped and reported — there is no customer '
      + 'register to put it in.',
    fields: {
      id: 'id', company_id: 'company_id', name: 'name', country: 'country',
      qualification_status: 'qualification_status',
      next_review_date: 'qualified_until',
    },
    enums: {
      qualification_status: {
        approved: 'qualified', qualified: 'qualified',
        conditional: 'conditional', suspended: 'suspended',
        pending: 'pending', disqualified: 'disqualified',
      },
    },
    //  Emitted only where the source row is a supplier.
    only: { field: 'vendor_type', equals: 'supplier' },
  },
  {
    source: 'materials', target: 'materials', klass: 'mappable', order: 5,
    note: 'The same entity. material_type is a closed vocabulary; the '
      + 'source\'s free text is mapped onto it rather than widened.',
    fields: {
      id: 'id', company_id: 'company_id', material_code: 'code',
      material_name: 'name', storage_conditions: 'storage_conditions',
      default_retest_period_days: 'retest_period_days',
    },
    constants: { material_type: 'excipient' },
    enums: {
      material_type: {
        api: 'active_ingredient', active: 'active_ingredient',
        excipient: 'excipient', packaging: 'packaging', solvent: 'solvent',
        reagent: 'reagent', intermediate: 'intermediate',
        //  The application has no "raw ingredient". Calling it an active
        //  ingredient or an excipient would assert something about the
        //  material that the source does not say, so it lands on `other`.
        raw_ingredient: 'other',
      },
    },
  },
  {
    source: 'products', target: 'products', klass: 'mappable', order: 6,
    note: 'The same entity. `category` is required and constrained; these '
      + 'are pharmaceuticals.',
    fields: {
      id: 'id', company_id: 'company_id', product_code: 'product_code',
      trade_name: 'trade_name', generic_name: 'generic_name',
      dosage_form: 'dosage_form',
    },
    constants: { category: 'drug_pharmaceutical' },
  },
  {
    source: 'material_specifications', target: 'material_specifications',
    klass: 'mappable', order: 7,
    note: 'The same entity — a versioned specification for a material.',
    //  The source keys a specification by applies_to_type/applies_to_id;
    //  only the material ones have a home in material_specifications.
    fields: {
      id: 'id', company_id: 'company_id', applies_to_id: 'material_id',
      version: 'version', specification_number: 'reference',
      effective_date: 'effective_date',
    },
    //  The application's vocabulary is draft / effective / superseded /
    //  withdrawn; a specification in force is `effective`.
    constants: { status: 'effective' },
    /*
     *  The source keys a specification by applies_to_type/applies_to_id and
     *  covers both materials and products. material_specifications is for
     *  materials; the product ones belong in product_specifications, which
     *  has its own parameter and review model. Emitting them here would
     *  point material_id at a product.
     */
    only: { field: 'applies_to_type', equals: 'material' },
  },
  {
    source: 'material_lots', target: 'material_lots', klass: 'mappable', order: 8,
    note: 'The same entity. The status vocabulary matches the application\'s '
      + 'quarantine / under_test / approved / rejected / expired / exhausted / '
      + 'on_hold, which is what the quarantine story turns on.',
    fields: {
      id: 'id', company_id: 'company_id', material_id: 'material_id',
      internal_lot_number: 'lot_number', supplier_id: 'supplier_id',
      supplier_batch_number: 'supplier_batch_number',
      quantity_received: 'quantity_received',
      quantity_remaining: 'quantity_available', unit: 'unit_of_measure',
      received_date: 'received_date', manufacture_date: 'manufacture_date',
      expiry_date: 'supplier_expiry_date', retest_date: 'retest_due_date',
      storage_location: 'storage_location',
    },
    /*
     *  `disposition` is NOT the lot status — it is null on 25 of the 26
     *  source lots and holds a rejection disposition on the one that was
     *  returned. The lot's actual state lives in entity_current_state,
     *  which the lifecycle engine owns and which is BLOCKED.
     *
     *  So every lot loads as `quarantine`, the application's own column
     *  default for a newly received lot, and the quarantine/released
     *  distinction the demo story turns on is NOT reproduced. Recorded in
     *  docs/seed/DEMO_STORY_GAPS.md rather than faked by reading a
     *  disposition that means something else.
     */
    constants: { status: 'quarantine' },
  },
  {
    source: 'master_formulas', target: 'master_formulas', klass: 'mappable', order: 9,
    note: 'The same entity. batch_size and its unit are required by the '
      + 'application and supplied by the source.',
    fields: {
      id: 'id', company_id: 'company_id', product_id: 'product_id',
      version: 'version', batch_size: 'batch_size',
      batch_size_unit: 'batch_size_unit', effective_from: 'effective_date',
    },
    /*
     *  Loaded as `draft`, not `approved`.
     *
     *  master_formulas_approval_chk requires approved_by AND approved_at
     *  whenever status is 'approved', and approved_by references a user.
     *  The demo has no Auth accounts, so an approved formula would either
     *  carry a dangling approver or claim an approval nobody made. A
     *  master formula's approval is a signed act, and the demo cannot
     *  reproduce it — see docs/seed/DEMO_STORY_GAPS.md.
     */
    constants: { status: 'draft' },
  },
  {
    source: 'batch_records', target: 'batch_records', klass: 'blocked', order: 10,
    /*
     *  BLOCKED BY THE APPLICATION'S OWN INTEGRITY RULE, discovered by the
     *  database refusing the load:
     *
     *    BATCH_FORMULA_NOT_APPROVED: formula version 2 is "draft", so a
     *    batch cannot be manufactured to it
     *
     *  A batch needs an APPROVED master formula. An approved formula needs
     *  approved_by and approved_at (master_formulas_approval_chk), which
     *  name a user. The demo has no Auth accounts, so the chain cannot be
     *  completed without them — and a formula approval is a signed act, not
     *  a column to fill in.
     *
     *  The trigger is doing exactly what it exists for: refusing a batch
     *  whose governing formula was never approved. It is not weakened, not
     *  disabled, and not worked around.
     */
    note: 'Needs an approved master formula, which needs an approver, which '
      + 'needs an Auth account. The application refuses a batch against a '
      + 'draft formula (BATCH_FORMULA_NOT_APPROVED) and that refusal is '
      + 'correct. Unblocks once demo identities exist and the formula is '
      + 'approved through the application.',
    fields: {
      id: 'id', company_id: 'company_id', batch_number: 'batch_number',
      product_id: 'product_id', master_formula_id: 'formula_id',
      planned_batch_size: 'batch_size', manufacturing_date: 'manufacturing_date',
      expiry_date: 'expiry_date', hold_reason: 'hold_reason',
    },
    //  product_name is NOT NULL and the source keeps it normalised on the
    //  product. Resolved from the source's own products table rather than
    //  filled with a placeholder.
    derives: {
      product_name: { from: 'products', via: 'product_id', take: 'trade_name' },
    },
    constants: { status: 'in_progress' },
  },
  {
    source: 'batch_stages', target: 'batch_stages', klass: 'blocked', order: 11,
    note: 'Depends on batch_records, which is blocked. The mapping itself is '
      + 'settled — stage_name becomes name, sequence_order becomes '
      + 'sequence_no, and company_id is derived from the batch — so this '
      + 'loads as soon as batches do.',
    //  The source's stages carry no company_id; it belongs to the batch.
    fields: {
      id: 'id', batch_record_id: 'batch_id',
      sequence_order: 'sequence_no', stage_name: 'name',
    },
    derives: {
      company_id: { from: 'batch_records', via: 'batch_record_id', take: 'company_id' },
    },
  },
  {
    source: 'deviations', target: 'deviations', klass: 'mappable', order: 12,
    note: 'The same entity. product_quality_impact is required and is a '
      + 'yes/no/undetermined judgement the source expresses differently; '
      + 'source_type is the application\'s own entry-point vocabulary.',
    fields: {
      id: 'id', company_id: 'company_id', deviation_number: 'deviation_number',
      title: 'title', description: 'description', severity: 'severity',
      product_quality_impact: 'product_quality_impact',
      immediate_action: 'immediate_action', containment_action: 'containment',
      investigation_due_date: 'investigation_due_date', raised_at: 'raised_at',
      closed_at: 'closed_at',
    },
    /*
     *  `manual` is an ENTRY POINT, not a source type — two different
     *  columns with two different vocabularies, which I conflated on the
     *  first pass and the constraint caught.
     *
     *  deviations_source_id_required: source_type process|facility must
     *  have a NULL source_id; anything else must have one. These are
     *  process deviations raised by a person, so: source_type `process`,
     *  source_id null, entry_point `manual`.
     */
    constants: { source_type: 'process', entry_point: 'manual' },
    enums: {
      severity: { critical: 'critical', major: 'major', minor: 'minor' },
      product_quality_impact: {
        yes: 'yes', no: 'no', undetermined: 'undetermined',
        none: 'no', potential: 'undetermined', confirmed: 'yes',
      },
    },
  },
  {
    source: 'capas', target: 'capa_records', klass: 'mappable', order: 13,
    note: 'capa_records is the application\'s CAPA. Its `source` vocabulary '
      + 'has no "deviation" value, but it has a dedicated source_deviation_id '
      + 'column — so the link is carried there and `source` is recorded as '
      + 'internal_review rather than widening a regulated vocabulary to fit '
      + 'a demo. This is the same gap already raised for facility sources.',
    fields: {
      id: 'id', company_id: 'company_id', capa_number: 'capa_number',
      title: 'title', source_deviation_id: 'source_deviation_id',
      due_date: 'due_date', owner: 'owner_name', status: 'status',
      action_type: 'capa_type',
    },
    //  description is NOT NULL on the application's CAPA and the source has
    //  no separate description; the title carries the same text.
    derives: {
      description: { from: 'capas', via: 'id', take: 'title' },
    },
    constants: { source: 'internal_review' },
    enums: {
      capa_type: {
        corrective: 'corrective', preventive: 'preventive', both: 'both',
        corrective_and_preventive: 'both',
      },
    },
  },

  /*
   *  ── THE MASTER FORMULA'S OWN CONTENTS ────────────────────────────────
   *
   *  These three were `unsupported` on the grounds that they "depend on the
   *  formula's own versioning". Checked against the schema rather than
   *  assumed: they do not. Each hangs off `formula_id` or `stage_id` and
   *  carries no version column of its own — the version lives on
   *  master_formulas, which is already emitted. So the dependency was on
   *  master_formulas existing, and it does.
   *
   *  Without them a master formula loads as a header with no stages and no
   *  bill of materials, which is the part of it that matters.
   */
  {
    source: 'master_formula_stages', target: 'master_formula_stages',
    klass: 'mappable', order: 14,
    resetVia: 'cascade',
    note: 'The same entity: an ordered manufacturing stage of a formula. '
      + '`requires_dual_signoff` becomes `requires_signoff` — the '
      + 'application records THAT a stage needs signing, not how many '
      + 'people, so a dual requirement is carried as a requirement and the '
      + 'count is not asserted. requires_line_clearance, required_sop_id '
      + 'and the yield-reconciliation fields have no column here; line '
      + 'clearance and yield reconciliation are separate features with '
      + 'their own tables, and inventing a link to them from a flag would '
      + 'be a guess about which record.',
    fields: {
      id: 'id', master_formula_id: 'formula_id', stage_key: 'stage_code',
      stage_name: 'name', sequence_order: 'sequence_no',
      requires_dual_signoff: 'requires_signoff',
    },
  },
  {
    source: 'master_formula_stage_parameters',
    target: 'master_formula_stage_parameters', klass: 'mappable', order: 15,
    resetVia: 'cascade',
    note: 'The same entity, and the parameter_type vocabulary matches the '
      + 'application\'s exactly — machine_setting and product_attribute, '
      + 'both sides. Verified that all 14 rows already satisfy the '
      + 'application\'s three conditional CHECKs (a machine_setting carries '
      + 'a target, a product_attribute carries a range, and no range is '
      + 'inverted), so nothing had to be filled in to make them load.',
    fields: {
      id: 'id', stage_id: 'stage_id', parameter_name: 'parameter',
      parameter_type: 'parameter_type', unit: 'unit',
      target_value: 'target_value', min_value: 'min_value',
      max_value: 'max_value', is_critical: 'is_critical',
    },
    //  A parameter whose stage was not emitted cannot be emitted either.
    requires: [{ field: 'stage_id', from: 'master_formula_stages' }],
  },
  {
    source: 'master_formula_materials', target: 'master_formula_materials',
    klass: 'mappable', order: 16,
    resetVia: 'cascade',
    note: 'The formula\'s bill of materials. The application requires a '
      + '`role` from a controlled list and the source does not record one — '
      + 'so it is taken from the MATERIAL\'S OWN TYPE, which the source does '
      + 'record: `api` gives `active`, which is a restatement. Every other '
      + 'type gives the application\'s own `other`, because which excipient '
      + 'function a material serves in a particular formula (binder, '
      + 'lubricant, glidant) is genuinely not in the source and naming one '
      + 'would be a fabricated formulation detail. Confirmed all 15 '
      + '(formula, material) pairs are distinct, so the UNIQUE on '
      + '(formula_id, material_id, role) holds.',
    fields: {
      id: 'id', master_formula_id: 'formula_id', material_id: 'material_id',
      quantity_required: 'quantity_per_batch', unit: 'unit',
      tolerance_pct: 'tolerance_pct', sequence_order: 'sort_order',
    },
    computed: {
      role: (row, tables) => {
        const mat = (tables.materials ?? []).find((m) => m.id === row.material_id);
        return mat?.material_type === 'api' ? 'active' : 'other';
      },
    },
  },
  {
    source: 'specification_tests', target: 'material_specification_parameters',
    klass: 'mappable', order: 17,
    note: 'The application holds specification parameters per material '
      + 'specification. The source\'s test rows reference '
      + 'material_specifications directly, so the "which of the two kinds" '
      + 'question that made this adaptable resolves by the same rule the '
      + 'parent already uses: the one source specification with '
      + 'applies_to_type = product is not emitted, and its 9 test rows are '
      + 'dropped and reported rather than orphaned. 45 of 54 load. '
      + '`limit_type` is NOT NULL from a controlled list and the source '
      + 'expresses the same thing by which columns it filled in, so it is '
      + 'read back: both bounds give range, one gives min or max, and text '
      + 'alone gives `complies` — not `exact_text`, because "Complies with '
      + 'reference spectrum" is a compliance statement and not a string to '
      + 'match. Census over all 54: 14 range, 1 min, 20 max, 19 text.',
    fields: {
      id: 'id', specification_id: 'specification_id', test_name: 'parameter',
      unit: 'unit', min_value: 'min_value', max_value: 'max_value',
      acceptance_criteria: 'expected_text', sequence_order: 'sort_order',
    },
    computed: {
      limit_type: (row) => {
        const mn = row.min_value;
        const mx = row.max_value;
        if (mn !== null && mn !== undefined && mx !== null && mx !== undefined) return 'range';
        if (mn !== null && mn !== undefined) return 'min';
        if (mx !== null && mx !== undefined) return 'max';
        //  Text only. `complies` carries the criterion in expected_text
        //  without claiming it is a value to compare against.
        return 'complies';
      },
    },
    requires: [{ field: 'specification_id', from: 'material_specifications' }],
  },
  {
    source: 'licences', target: 'regulatory_licences', klass: 'mappable',
    order: 18,
    note: 'The application\'s licence register. Two things the source does '
      + 'not supply, both resolved from what it does: `licence_type` is a '
      + 'controlled list with no PCN premises option, so a PCN licence is '
      + 'recorded as `other` with its real type kept in the notes rather '
      + 'than filed under a NAFDAC or ministry category it does not belong '
      + 'to; and `status` is read off the dates — all four were issued in '
      + 'the past and expire in the future, so `active` is a fact about the '
      + 'record. The renewal states (renewal_due, renewal_in_progress, '
      + 'renewed) are NOT set: those belong to a workflow the source has no '
      + 'concept of, and asserting one would invent a renewal history.',
    fields: {
      id: 'id', company_id: 'company_id', licence_number: 'registration_number',
      covers: 'name', issued_date: 'issue_date', expiry_date: 'expiry_date',
      licence_type: 'licence_type',
    },
    constants: { status: 'active' },
    enums: {
      licence_type: {
        nafdac_gmp_certificate: 'nafdac_gmp_certificate',
        nafdac_product_registration: 'nafdac_product_registration',
        import_permit: 'nafdac_import_permit',
        son_mancap: 'son_mancap_approval',
        pcn_premises_licence: 'other',
      },
    },
    computed: {
      //  Nothing from the source is discarded: the issuer and the source's
      //  own type string are preserved verbatim, which is what makes the
      //  `other` above honest rather than lossy.
      notes: (row) => `Issuer: ${String(row.issuer ?? 'not recorded')}. `
        + `Source licence type: ${String(row.licence_type ?? 'not recorded')}.`,
      regulatory_body: (row) => {
        const t = String(row.licence_type ?? '');
        if (t.startsWith('nafdac') || t === 'import_permit') return 'nafdac';
        if (t.startsWith('son')) return 'son';
        if (t.startsWith('pcn')) return 'pcn';
        return 'other';
      },
    },
  },

  // ── adaptable ──────────────────────────────────────────────────────────
  {
    source: 'environmental_monitoring', target: 'facility_log_entries',
    klass: 'adaptable',
    note: 'The application models environmental monitoring as facility log '
      + 'ENTRIES against a facility_zone_schedule, which carries the limits '
      + 'and the sampling method. The source carries limits on each reading. '
      + 'Adapting means creating a zone and a schedule per monitored point '
      + 'first, then re-expressing each reading against it — and the outcome '
      + 'is derived by a trigger, never supplied. A reshape, not a rename.',
  },
  {
    source: 'cleaning_records', target: 'facility_log_entries', klass: 'adaptable',
    note: 'Cleaning is a facility log type in the application '
      + '(cleaning_routine / cleaning_deep / cleaning_changeover), with the '
      + 'method, chemicals and contact time on the entry. The source\'s '
      + 'line-scoped cleaning record maps onto that, but needs the same zone '
      + 'and schedule scaffolding as environmental monitoring.',
  },
  {
    source: 'qc_results', target: 'batch_qc_results', klass: 'adaptable',
    note: 'The application splits QC into batch_qc_results and '
      + 'batch_inprocess_qc, keyed to a batch and a specification parameter '
      + 'rather than to a free-standing specification_test. Needs '
      + 'specification_tests adapted first.',
  },
  {
    source: 'specification_tests', target: 'material_specification_parameters',
    klass: 'adaptable',
    note: 'The application holds specification parameters per material '
      + 'specification, and separately per product specification. Which of '
      + 'the two a source test belongs to has to be decided per row.',
  },
  {
    source: 'licences', target: 'regulatory_licences', klass: 'adaptable',
    note: 'regulatory_licences is the application\'s licence register, with '
      + 'a renewal workflow the source has no concept of. Importable as '
      + 'static records; the renewal state would be invented.',
  },
  {
    source: 'calibration_records', target: 'instrument_calibrations',
    klass: 'adaptable',
    note: 'The application calibrates INSTRUMENTS, which it models in its '
      + 'own right with due dates and alerts. The source\'s equipment has no '
      + 'counterpart, so the instrument must exist before its calibration '
      + 'can — and `equipment` is unsupported.',
  },

  // ── unsupported ────────────────────────────────────────────────────────
  {
    source: 'equipment', target: null, klass: 'unsupported',
    note: 'The application has `instruments` — a calibration-bearing '
      + 'measuring device — not general production equipment with a capacity '
      + 'and a line. Importing equipment as instruments would misrepresent a '
      + 'blender as a balance.',
  },
  {
    source: 'personnel_certificates', target: null, klass: 'unsupported',
    note: 'No personnel certification entity. Training is modelled as '
      + 'responses to scenarios, which is a different thing from holding a '
      + 'certificate that blocks production access.',
  },
  {
    source: 'training_assignments', target: null, klass: 'unsupported',
    note: 'training_responses records an answer to a training scenario. It '
      + 'is not an assignment with a due date and a completion state.',
  },
  {
    source: 'documents', target: null, klass: 'unsupported',
    note: 'The application has typed document tables (sop_documents, '
      + 'ctd_documents, product_documents, vendor_documents) rather than one '
      + 'general register. Which type each source document is cannot be '
      + 'inferred from the row.',
  },
  {
    source: 'numbering_sequences', target: null, klass: 'unsupported',
    note: 'company_numbering_formats describes a FORMAT; the source supplies '
      + 'a next_value counter. Seeding a counter would let the demo issue '
      + 'numbers that collide with records it did not create.',
  },
  {
    source: 'coa_templates', target: null, klass: 'unsupported',
    note: 'No certificate template entity. The application composes a CoA '
      + 'from the specification and the batch results.',
  },
  {
    source: 'certificates_of_analysis', target: null, klass: 'unsupported',
    note: 'The application issues a CoA for a MATERIAL lot '
      + '(material_certificates_of_analysis). A product CoA against a batch '
      + 'record is a different document it does not store.',
  },
  {
    source: 'product_registrations', target: null, klass: 'unsupported',
    note: 'Product registration is carried by regulatory_licences and '
      + 'regulatory_submissions, which model a submission lifecycle the '
      + 'source has no data for.',
  },
  {
    source: 'release_configurations', target: null, klass: 'unsupported',
    note: 'The application derives release readiness from specifications, QC '
      + 'results and the lifecycle engine. There is no stored rule set to '
      + 'seed.',
  },
  {
    source: 'release_decisions', target: null, klass: 'unsupported',
    note: 'material_lot_release_records cover MATERIAL release. A batch '
      + 'release decision is expressed on the batch record itself, through '
      + 'the lifecycle engine and a signature — neither of which can be '
      + 'seeded.',
  },
  {
    source: 'dispensing_records', target: 'dispensing_records', klass: 'unsupported',
    note: 'The table exists but requires batch_id, internal_lot_number and '
      + 'both required and actual quantities, none of which the source '
      + 'supplies in the application\'s terms. Adaptable only once batches '
      + 'and lots are loaded and the dispensing workflow is decided.',
  },
  {
    source: 'line_clearance_records', target: 'line_clearance_records',
    klass: 'unsupported',
    note: 'The table exists with a different workflow — the application ties '
      + 'clearance to a changeover verification with its own signature '
      + 'requirement.',
  },
  {
    source: 'material_certificates_of_analysis', target: 'material_certificates_of_analysis',
    klass: 'unsupported',
    note: 'The table exists, but the application requires a verification '
      + 'outcome and a discrepancy record that the source has no field for. '
      + 'Seeding it unverified would misrepresent incoming-goods control.',
  },
  {
    source: 'batch_stage_parameter_readings', target: 'batch_stage_parameter_readings',
    klass: 'unsupported',
    note: 'Exists, and requires company_id plus a parameter definition the '
      + 'source expresses as a free-standing reading. Depends on '
      + 'master_formula_stage_parameters.',
  },
  {
    source: 'root_cause_analyses', target: 'root_cause_analyses', klass: 'unsupported',
    note: 'Exists, with a company_rca_settings-driven method the source does '
      + 'not record.',
  },
  {
    source: 'deviation_links', target: 'deviation_links', klass: 'unsupported',
    note: 'Exists but requires company_id, which the source omits; the link '
      + 'targets also have to exist first.',
  },
  {
    source: 'company_members', target: 'company_members', klass: 'blocked',
    note: 'company_members.user_id has a foreign key to auth.users, and the '
      + 'source resolves its eleven users by email through a helper that '
      + 'raises when they are absent. Loading it means creating eleven Auth '
      + 'accounts for .example addresses. Those are demo actors and must not '
      + 'become real accounts on the live project — see '
      + 'docs/seed/DEMO_IDENTITIES.md.',
  },

  // ── blocked ────────────────────────────────────────────────────────────
  {
    source: 'electronic_signatures', target: null, klass: 'blocked',
    note: 'THE HASHES CANNOT BE CARRIED OVER. The application computes a '
      + 'record hash server-side over its own canonical serialisation and '
      + 'records which convention in hash_convention; the source computed '
      + 'its over the generator\'s. Both are 64-hex SHA-256, so the CHECK '
      + 'would ACCEPT the source values and verification would fail — 139 '
      + 'signatures that look signed and are not. The only legitimate path '
      + 'is sign_electronic_record(), which takes the signer from auth.uid() '
      + 'and re-verifies their password, so it needs a real Auth session.',
  },
  {
    source: 'entity_state_history', target: 'entity_state_history', klass: 'blocked',
    note: 'Lifecycle state is owned by the lifecycle engine, which decides '
      + 'transitions and consumes signatures. Seeding history directly would '
      + 'assert transitions that never happened and that no signature '
      + 'attests. The states must be reached by driving the engine.',
  },
  {
    source: 'entity_current_state', target: 'entity_current_state', klass: 'blocked',
    note: 'Same as entity_state_history — it is the engine\'s projection of '
      + 'the history, not an independent fact.',
  },
];

export const MAPPABLE = MAPPINGS
  .filter((m) => m.klass === 'mappable')
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

export function classOf(source: string): MappingClass | null {
  return MAPPINGS.find((m) => m.source === source)?.klass ?? null;
}

/** Every source table must be classified — silence is not a classification. */
export function unclassified(sourceTables: string[]): string[] {
  return sourceTables.filter((t) => !MAPPINGS.some((m) => m.source === t));
}
