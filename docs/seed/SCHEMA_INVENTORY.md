# Application schema inventory

Generated from a database with **all 285 public tables** created by this repository's migrations, applied in order. This is the authoritative shape any seed file must match.

Regenerate with `npx tsx scripts/seed/schema-inventory.ts` after adding a migration.

## How to read it

`column type [NOT NULL] [= default]`. A column marked NOT NULL with no default is one a seed row **must** supply.

## Tables (285)

### `access_act_owners`

**Required (NOT NULL, no default):** `section_key`, `work_role`, `reason`, `instead_ask`

```
section_key text NOT NULL
work_role text NOT NULL
reason text NOT NULL
instead_ask text NOT NULL
```

### `access_approvers`

**Required (NOT NULL, no default):** `user_id`

```
user_id uuid NOT NULL
created_at timestamp with time zone NOT NULL = now()
```

### `access_duty_conflicts`

**Required (NOT NULL, no default):** `work_role`, `section_key`, `reason`, `instead_ask`

```
id uuid NOT NULL = gen_random_uuid()
work_role text NOT NULL
section_key text NOT NULL
reason text NOT NULL
instead_ask text NOT NULL
company_id uuid
```

### `access_grants`

**Required (NOT NULL, no default):** `company_id`, `user_id`, `section_key`, `level`, `scope`, `granted_by`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
user_id uuid NOT NULL
section_key text NOT NULL
level text NOT NULL
scope text NOT NULL
valid_until date
request_id uuid
granted_by uuid NOT NULL
granted_at timestamp with time zone NOT NULL = now()
revoked_by uuid
revoked_at timestamp with time zone
revoke_reason text
```

### `access_permission_requests`

**Required (NOT NULL, no default):** `company_id`, `reference`, `requested_by`, `work_role`, `section_key`, `level`, `scope`, `reason`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
reference text NOT NULL
requested_by uuid NOT NULL
work_role text NOT NULL
section_key text NOT NULL
level text NOT NULL
scope text NOT NULL
requested_until date
reason text NOT NULL
status text NOT NULL = 'waiting'::text
decided_by uuid
decided_at timestamp with time zone
decision_note text
granted_level text
granted_scope text
granted_until date
created_at timestamp with time zone NOT NULL = now()
```

### `access_request_counters`

**Required (NOT NULL, no default):** `company_id`

```
company_id uuid NOT NULL
last_number bigint NOT NULL = 0
```

### `access_requests`

**Required (NOT NULL, no default):** `email`

```
email text NOT NULL
full_name text
company text
role text
industry text
notes text
requested_at timestamp with time zone NOT NULL = now()
approved_at timestamp with time zone
approved_by uuid
```

### `access_restrictions`

**Required (NOT NULL, no default):** `company_id`, `user_id`, `section_key`, `to_level`, `reason`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
user_id uuid NOT NULL
section_key text NOT NULL
to_level text NOT NULL
reason text NOT NULL
until date
set_by uuid
set_at timestamp with time zone NOT NULL = now()
lifted_at timestamp with time zone
lifted_by uuid
lift_reason text
```

### `access_sections`

**Required (NOT NULL, no default):** `key`, `label`

```
key text NOT NULL
label text NOT NULL
unrequestable_reason text
sort_order integer NOT NULL = 100
```

### `access_settings`

**Required (NOT NULL, no default):** `company_id`

```
company_id uuid NOT NULL
max_grant_days integer NOT NULL = 90
```

### `account_rollovers`

**Required (NOT NULL, no default):** `old_user_id`, `original_email`, `tombstone_email`

```
old_user_id uuid NOT NULL
original_email text NOT NULL
tombstone_email text NOT NULL
reason text
revoked_memberships jsonb NOT NULL = '[]'::jsonb
was_approver boolean NOT NULL = false
rolled_at timestamp with time zone NOT NULL = now()
rolled_by uuid
```

### `ad_placements`

**Required (NOT NULL, no default):** `company_id`, `campaign_name`, `product`, `platform`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
campaign_name text NOT NULL
product text NOT NULL
platform text NOT NULL
placement_url text
context text
audience_segment text
status text NOT NULL = 'monitoring'::text
violation text
impressions integer = 0
detected_at timestamp with time zone NOT NULL = now()
```

### `adverse_events`

**Required (NOT NULL, no default):** `company_id`, `source_text`, `detected_phrase`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
channel_id uuid
source_text text NOT NULL
detected_phrase text NOT NULL
severity text NOT NULL = 'medium'::text
status text NOT NULL = 'detected'::text
reporter_notes text
detected_at timestamp with time zone NOT NULL = now()
resolved_at timestamp with time zone
resolved_by uuid
```

### `ai_asset_controls`

**Required (NOT NULL, no default):** `company_id`, `asset_id`, `control_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
asset_id uuid NOT NULL
control_id uuid NOT NULL
status text NOT NULL = 'mapped'::text
created_at timestamp with time zone NOT NULL = now()
```

### `ai_assets`

**Required (NOT NULL, no default):** `company_id`, `name`, `asset_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
asset_type text NOT NULL
provider_vendor_id uuid
status text NOT NULL = 'active'::text
owner_id uuid
description text
metadata jsonb NOT NULL = '{}'::jsonb
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `ai_incidents`

**Required (NOT NULL, no default):** `company_id`, `incident_type`, `severity`, `title`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
ai_asset_id uuid
usage_log_id uuid
incident_type text NOT NULL
severity text NOT NULL
status text NOT NULL = 'open'::text
linked_risk_id uuid
linked_policy_id uuid
title text NOT NULL
description text
reported_by uuid
assigned_to uuid
source text NOT NULL = 'manual'::text
metadata jsonb NOT NULL = '{}'::jsonb
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
resolved_at timestamp with time zone
```

### `ai_jobs`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid
submission_id uuid
job_type text NOT NULL = 'ai_risk_assessment'::text
status text NOT NULL = 'queued'::text
attempts integer NOT NULL = 0
max_attempts integer NOT NULL = 5
run_at timestamp with time zone NOT NULL = now()
locked_at timestamp with time zone
locked_by text
last_error text
payload jsonb NOT NULL = '{}'::jsonb
result jsonb
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `ai_output_reviews`

**Required (NOT NULL, no default):** `company_id`, `usage_log_id`, `review_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
usage_log_id uuid NOT NULL
ai_asset_id uuid
review_type text NOT NULL
status text NOT NULL = 'pending'::text
reviewer_id uuid
decision_notes text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
reviewed_at timestamp with time zone
```

### `ai_prompt_templates`

**Required (NOT NULL, no default):** `company_id`, `name`, `prompt_text`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
ai_asset_id uuid
name text NOT NULL
description text
prompt_text text NOT NULL
status text NOT NULL = 'draft'::text
version integer NOT NULL = 1
owner_id uuid
approved_by uuid
approved_at timestamp with time zone
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `ai_risk_assessments`

**Required (NOT NULL, no default):** `submission_id`

```
id uuid NOT NULL = gen_random_uuid()
submission_id uuid NOT NULL
company_id uuid
ai_risk_score integer NOT NULL = 0
overall_sentiment text NOT NULL = 'neutral'::text
intent_violations jsonb NOT NULL = '[]'::jsonb
subtle_claims jsonb NOT NULL = '[]'::jsonb
recommendations jsonb NOT NULL = '[]'::jsonb
summary text NOT NULL = ''::text
model_version text NOT NULL = 'gemini-2.0-flash'::text
content_hash text
expires_at timestamp with time zone
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `ai_usage_logs`

**Required (NOT NULL, no default):** `company_id`, `provider_name`, `model_name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
ai_asset_id uuid
user_id uuid
provider_name text NOT NULL
model_name text NOT NULL
input_summary text
output_summary text
risk_flags jsonb NOT NULL = '[]'::jsonb
performance jsonb NOT NULL = '{}'::jsonb
review_status text NOT NULL = 'not_reviewed'::text
source text NOT NULL = 'llm_gateway'::text
created_at timestamp with time zone NOT NULL = now()
```

### `allowed_signins`

**Required (NOT NULL, no default):** `email`

```
email text NOT NULL
note text
added_by uuid
created_at timestamp with time zone NOT NULL = now()
is_enabled boolean NOT NULL = true
disabled_at timestamp with time zone
disabled_by uuid
```

### `anchored_annotations`

**Required (NOT NULL, no default):** `company_id`, `author_id`, `body`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
submission_id uuid
author_id uuid NOT NULL
anchor_paragraph integer NOT NULL = 0
anchor_start integer NOT NULL = 0
anchor_end integer NOT NULL = 0
anchor_text text = ''::text
body text NOT NULL
parent_id uuid
is_resolved boolean NOT NULL = false
resolved_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
entity_type text NOT NULL = 'content_submission'::text
entity_id uuid
```

### `api_keys`

**Required (NOT NULL, no default):** `company_id`, `name`, `key_hash`, `key_prefix`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
key_hash text NOT NULL
key_prefix text NOT NULL
scopes text[] NOT NULL = '{}'::text[]
created_by uuid
expires_at timestamp with time zone
last_used_at timestamp with time zone
revoked_at timestamp with time zone
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
service_account_id uuid
last_used_ip text
```

### `api_request_logs`

**Required (NOT NULL, no default):** `company_id`, `method`, `path`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
api_key_id uuid
service_account_id uuid
method text NOT NULL
path text NOT NULL
status_code integer
request_id text
source_ip text
user_agent text
latency_ms integer
scopes_used text[] NOT NULL = '{}'::text[]
error_message text
created_at timestamp with time zone NOT NULL = now()
```

### `approval_expiry_config`

**Required (NOT NULL, no default):** `company_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
expiry_days integer NOT NULL = 90
auto_expire boolean NOT NULL = true
updated_by uuid
updated_at timestamp with time zone NOT NULL = now()
```

### `audit_export_jobs`

**Required (NOT NULL, no default):** `company_id`, `audit_session_id`, `export_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
audit_session_id uuid NOT NULL
requested_by uuid
export_type text NOT NULL
status text NOT NULL = 'pending'::text
file_url text
metadata jsonb = '{}'::jsonb
created_at timestamp with time zone = now()
completed_at timestamp with time zone
```

### `audit_findings`

**Required (NOT NULL, no default):** `simulation_id`, `company_id`, `category`, `severity`, `title`, `description`

```
id uuid NOT NULL = gen_random_uuid()
simulation_id uuid NOT NULL
company_id uuid NOT NULL
category text NOT NULL
severity text NOT NULL
title text NOT NULL
description text NOT NULL
remediation_advice text
is_resolved boolean = false
detected_at timestamp with time zone NOT NULL = now()
```

### `audit_hash_conventions`

**Required (NOT NULL, no default):** `algo`, `description`, `verifiable`

```
algo text NOT NULL
description text NOT NULL
verifiable boolean NOT NULL
reason text
created_at timestamp with time zone NOT NULL = now()
```

### `audit_logs`

**Required (NOT NULL, no default):** `action`, `entity_type`

```
id uuid NOT NULL = gen_random_uuid()
user_id uuid
action text NOT NULL
entity_type text NOT NULL
entity_id uuid
metadata jsonb = '{}'::jsonb
created_at timestamp with time zone = now()
integrity_hash text
previous_hash text = 'GENESIS'::text
evidence_snapshot jsonb = '{}'::jsonb
company_id uuid
ip_address text
sequence_number bigint
hash_algo text
```

### `audit_prep_items`

**Required (NOT NULL, no default):** `session_id`, `company_id`, `item_type`, `source_table`, `title`

```
id uuid NOT NULL = gen_random_uuid()
session_id uuid NOT NULL
company_id uuid NOT NULL
item_type text NOT NULL
source_table text NOT NULL
source_id uuid
title text NOT NULL
description text
status text
item_date date
relevance_tag text
metadata jsonb NOT NULL = '{}'::jsonb
created_at timestamp with time zone NOT NULL = now()
```

### `audit_prep_sessions`

**Required (NOT NULL, no default):** `company_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
audit_type text NOT NULL = 'internal'::text
scheduled_date date
inspector_name text
inspector_org text
scope_notes text
status text NOT NULL = 'draft'::text
assembled_at timestamp with time zone
ai_summary text
evidence_counts jsonb NOT NULL = '{}'::jsonb
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
inspection_type text NOT NULL = 'scheduled'::text
```

### `audit_request_evidence`

**Required (NOT NULL, no default):** `company_id`, `audit_request_id`, `submission_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
audit_request_id uuid NOT NULL
submission_id uuid NOT NULL
linked_by uuid
created_at timestamp with time zone NOT NULL = now()
```

### `audit_request_items`

**Required (NOT NULL, no default):** `company_id`, `audit_request_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
audit_request_id uuid NOT NULL
control_id uuid
policy_version_id uuid
vendor_id uuid
created_at timestamp with time zone NOT NULL = now()
```

### `audit_requests`

**Required (NOT NULL, no default):** `company_id`, `audit_session_id`, `title`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
audit_session_id uuid NOT NULL
requested_by uuid
assigned_to uuid
title text NOT NULL
description text
status text NOT NULL = 'open'::text
due_at timestamp with time zone
created_at timestamp with time zone NOT NULL = now()
fulfilled_at timestamp with time zone
```

### `audit_retention_policies`

**Required (NOT NULL, no default):** `company_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
jurisdiction text NOT NULL = 'default'::text
retention_years integer NOT NULL = 7
description text
is_active boolean = true
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
```

### `audit_session_participants`

**Required (NOT NULL, no default):** `company_id`, `audit_session_id`, `user_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
audit_session_id uuid NOT NULL
user_id uuid NOT NULL
role text NOT NULL = 'member'::text
invited_email text
created_at timestamp with time zone NOT NULL = now()
```

### `audit_sessions`

**Required (NOT NULL, no default):** `company_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
audit_type text NOT NULL = 'internal'::text
status text NOT NULL = 'draft'::text
start_date date
end_date date
created_by uuid
created_at timestamp with time zone NOT NULL = now()
```

### `audit_simulations`

**Required (NOT NULL, no default):** `company_id`, `audit_type`, `score`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
audit_type text NOT NULL
score integer NOT NULL
status text NOT NULL = 'completed'::text
summary text
metadata jsonb = '{}'::jsonb
created_at timestamp with time zone NOT NULL = now()
completed_at timestamp with time zone
```

### `authorised_signatories`

**Required (NOT NULL, no default):** `company_id`, `email`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
user_id uuid
email text NOT NULL
full_name text
job_title text
added_by uuid
added_at timestamp with time zone NOT NULL = now()
removed_by uuid
removed_at timestamp with time zone
```

### `batch_dispatches`

**Required (NOT NULL, no default):** `company_id`, `batch_id`, `destination`, `quantity`, `unit`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
batch_id uuid NOT NULL
destination text NOT NULL
reference text
quantity numeric NOT NULL
unit text NOT NULL
dispatched_at timestamp with time zone NOT NULL = now()
dispatched_by uuid
notes text
created_at timestamp with time zone NOT NULL = now()
```

### `batch_inprocess_qc`

**Required (NOT NULL, no default):** `company_id`, `batch_id`, `stage_name`, `parameter`, `result`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
batch_id uuid NOT NULL
stage_name text NOT NULL
parameter text NOT NULL
specification text
result text NOT NULL
pass boolean NOT NULL = true
tested_by uuid
tested_at timestamp with time zone = now()
created_at timestamp with time zone = now()
```

### `batch_material_genealogy`

**Required (NOT NULL, no default):** `company_id`, `batch_id`, `material_lot_id`, `material_id`, `unit`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
batch_id uuid NOT NULL
material_lot_id uuid NOT NULL
material_id uuid NOT NULL
total_quantity numeric(16,6) NOT NULL = 0
unit text NOT NULL
dispensing_count integer NOT NULL = 0
first_dispensed_at timestamp with time zone NOT NULL = now()
last_dispensed_at timestamp with time zone NOT NULL = now()
created_at timestamp with time zone NOT NULL = now()
```

### `batch_qc_results`

**Required (NOT NULL, no default):** `batch_id`, `test_name`, `result`, `pass`

```
id uuid NOT NULL = gen_random_uuid()
batch_id uuid NOT NULL
test_name text NOT NULL
test_method text
specification text
result text NOT NULL
pass boolean NOT NULL
tested_by uuid
tested_at timestamp with time zone = now()
corrected_from_id uuid
correction_reason text
signature_id uuid
```

### `batch_records`

**Required (NOT NULL, no default):** `company_id`, `batch_number`, `product_name`, `manufacturing_date`, `expiry_date`, `batch_size`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
batch_number text NOT NULL
product_name text NOT NULL
product_code text
manufacturing_date date NOT NULL
expiry_date date NOT NULL
batch_size numeric NOT NULL
unit text NOT NULL = 'kg'::text
status text NOT NULL = 'in_progress'::text
hold_reason text
release_notes text
qc_started_at timestamp with time zone
qc_completed_at timestamp with time zone
released_at timestamp with time zone
released_by uuid
created_by uuid
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
product_id uuid
customer_name text
formula_id uuid
execution_closed_at timestamp with time zone
execution_closed_by uuid
line_id uuid
governing_specification_id uuid
governing_specification_stamped_at timestamp with time zone
```

### `batch_specification_reviews`

**Required (NOT NULL, no default):** `company_id`, `batch_id`, `to_specification_id`, `reason`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
batch_id uuid NOT NULL
from_specification_id uuid
to_specification_id uuid NOT NULL
reason text NOT NULL
reviewed_by uuid
reviewed_at timestamp with time zone NOT NULL = now()
signature_id uuid
created_at timestamp with time zone NOT NULL = now()
```

### `batch_stage_corrections`

**Required (NOT NULL, no default):** `company_id`, `batch_stage_id`, `field_name`, `reason`, `corrected_by`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
batch_stage_id uuid NOT NULL
field_name text NOT NULL
original_value text
new_value text
reason text NOT NULL
corrected_by uuid NOT NULL
corrected_at timestamp with time zone NOT NULL = now()
```

### `batch_stage_parameter_readings`

**Required (NOT NULL, no default):** `company_id`, `batch_stage_id`, `parameter_name`, `parameter_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
batch_stage_id uuid NOT NULL
formula_parameter_id uuid
parameter_name text NOT NULL
parameter_type text NOT NULL
unit text
target_value numeric
min_value numeric
max_value numeric
reading_value numeric
reading_text text
in_specification boolean
recorded_by uuid
recorded_at timestamp with time zone NOT NULL = now()
created_at timestamp with time zone NOT NULL = now()
corrected_from_id uuid
sequence_no integer
weight_zone text
zone_action text
zone_lal numeric(18,6)
zone_lwl numeric(18,6)
zone_uwl numeric(18,6)
zone_ual numeric(18,6)
oos_acknowledged_by uuid
oos_acknowledged_at timestamp with time zone
```

### `batch_stages`

**Required (NOT NULL, no default):** `company_id`, `batch_id`, `sequence_no`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
batch_id uuid NOT NULL
formula_stage_id uuid
sequence_no integer NOT NULL
name text NOT NULL
requires_verifier boolean NOT NULL = false
status text NOT NULL = 'pending'::text
started_at timestamp with time zone
started_by uuid
completed_at timestamp with time zone
operator_id uuid
operator_signature_id uuid
verifier_id uuid
verifier_signature_id uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `batch_yield_reconciliations`

**Required (NOT NULL, no default):** `company_id`, `batch_id`, `theoretical_basis`, `basis_quantity`, `output_per_input`, `threshold_pct`, `theoretical_quantity`, `actual_quantity`, `unit`, `recorded_by`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
batch_id uuid NOT NULL
batch_stage_id uuid
config_id uuid
theoretical_basis text NOT NULL
basis_quantity numeric(18,6) NOT NULL
output_per_input numeric(18,8) NOT NULL
threshold_pct numeric(8,4) NOT NULL
theoretical_quantity numeric(18,6) NOT NULL
actual_quantity numeric(18,6) NOT NULL
unit text NOT NULL
yield_pct numeric(10,4)
variance_pct numeric(10,4)
within_threshold boolean
investigation_required boolean NOT NULL = false
investigation_note text
authorised_by uuid
authorised_at timestamp with time zone
authorisation_reason text
authorisation_signature_id uuid
deviation_id uuid
notes text
recorded_by uuid NOT NULL
recorded_at timestamp with time zone NOT NULL = now()
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
samples_quantity numeric(18,6)
rejects_quantity numeric(18,6)
```

### `block_usage`

**Required (NOT NULL, no default):** `company_id`, `block_id`, `content_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
block_id uuid NOT NULL
content_id uuid NOT NULL
used_at timestamp with time zone NOT NULL = now()
```

### `brands`

**Required (NOT NULL, no default):** `business_unit_id`, `organization_id`, `name`, `slug`

```
id uuid NOT NULL = gen_random_uuid()
business_unit_id uuid NOT NULL
organization_id uuid NOT NULL
name text NOT NULL
slug text NOT NULL
logo_url text
jurisdictions text[] NOT NULL = '{}'::text[]
is_active boolean NOT NULL = true
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `business_unit_seats`

**Required (NOT NULL, no default):** `business_unit_id`

```
id uuid NOT NULL = gen_random_uuid()
business_unit_id uuid NOT NULL
allocated_seats integer NOT NULL = 0
used_seats integer NOT NULL = 0
updated_at timestamp with time zone NOT NULL = now()
```

### `business_units`

**Required (NOT NULL, no default):** `organization_id`, `name`, `slug`

```
id uuid NOT NULL = gen_random_uuid()
organization_id uuid NOT NULL
company_id uuid
name text NOT NULL
slug text NOT NULL
description text = ''::text
region text
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `calendar_events`

**Required (NOT NULL, no default):** `company_id`, `submission_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
submission_id uuid NOT NULL
event_type text NOT NULL = 'marketing_publish'::text
title text NOT NULL = ''::text
scheduled_at timestamp with time zone NOT NULL = now()
is_auto_dated boolean NOT NULL = false
needs_schedule_confirmation boolean NOT NULL = false
legal_planned_at timestamp with time zone
legal_acknowledged boolean NOT NULL = false
status text NOT NULL = 'pending'::text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `calendar_reminders`

**Required (NOT NULL, no default):** `event_id`, `reminder_type`, `recipient_id`

```
id uuid NOT NULL = gen_random_uuid()
event_id uuid NOT NULL
reminder_type text NOT NULL
sent_at timestamp with time zone NOT NULL = now()
recipient_id uuid NOT NULL
message text
created_at timestamp with time zone NOT NULL = now()
```

### `capa_actions`

**Required (NOT NULL, no default):** `capa_id`, `action_type`, `description`

```
id uuid NOT NULL = gen_random_uuid()
capa_id uuid NOT NULL
action_type text NOT NULL
description text NOT NULL
assigned_to text
status text NOT NULL = 'pending'::text
due_date timestamp with time zone
completed_at timestamp with time zone
created_at timestamp with time zone NOT NULL = now()
```

### `capa_records`

**Required (NOT NULL, no default):** `company_id`, `capa_number`, `title`, `description`, `source`, `capa_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
capa_number text NOT NULL
title text NOT NULL
description text NOT NULL
source text NOT NULL
capa_type text NOT NULL
priority text NOT NULL = 'medium'::text
status text NOT NULL = 'open'::text
root_cause text
due_date timestamp with time zone
owner_name text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
closed_at timestamp with time zone
control_id uuid
control_code text
source_risk_id uuid
batch_id uuid
is_systemic boolean NOT NULL = false
source_deviation_id uuid
```

### `certificate_of_analysis`

**Required (NOT NULL, no default):** `company_id`, `batch_id`, `coa_number`, `product_name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
batch_id uuid NOT NULL
coa_number text NOT NULL
product_name text NOT NULL
batch_number text
conformance_statement text
results jsonb NOT NULL = '[]'::jsonb
status text NOT NULL = 'draft'::text
qa_approved_by uuid
qa_approved_by_name text
qa_approved_at timestamp with time zone
pdf_url text
created_by uuid
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
```

### `change_controls`

**Required (NOT NULL, no default):** `company_id`, `change_number`, `title`, `change_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
change_number text NOT NULL
title text NOT NULL
description text
change_type text NOT NULL
change_category text NOT NULL = 'minor'::text
impact_assessment text
regulatory_impact boolean = false
validation_required boolean = false
status text NOT NULL = 'draft'::text
effective_date date
approved_by uuid
approved_at timestamp with time zone
rejected_reason text
created_by uuid
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
```

### `chat_channel_members`

**Required (NOT NULL, no default):** `channel_id`, `user_id`

```
id uuid NOT NULL = gen_random_uuid()
channel_id uuid NOT NULL
user_id uuid NOT NULL
last_read_at timestamp with time zone = now()
joined_at timestamp with time zone = now()
```

### `chat_channels`

**Required (NOT NULL, no default):** `company_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
description text = ''::text
channel_type text NOT NULL = 'custom'::text
created_by uuid
is_archived boolean = false
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
```

### `chat_mentions`

**Required (NOT NULL, no default):** `message_id`, `user_id`

```
id uuid NOT NULL = gen_random_uuid()
message_id uuid NOT NULL
user_id uuid NOT NULL
created_at timestamp with time zone = now()
```

### `chat_messages`

**Required (NOT NULL, no default):** `channel_id`, `sender_id`

```
id uuid NOT NULL = gen_random_uuid()
channel_id uuid NOT NULL
sender_id uuid NOT NULL
parent_id uuid
content text NOT NULL = ''::text
content_type text NOT NULL = 'text'::text
gif_url text
is_pinned boolean = false
is_edited boolean = false
is_deleted boolean = false
relay_sent boolean = false
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
file_url text
file_name text
file_size bigint
file_type text
```

### `chat_reactions`

**Required (NOT NULL, no default):** `message_id`, `user_id`, `emoji`

```
id uuid NOT NULL = gen_random_uuid()
message_id uuid NOT NULL
user_id uuid NOT NULL
emoji text NOT NULL
created_at timestamp with time zone = now()
```

### `claim_evidence_links`

**Required (NOT NULL, no default):** `claim_id`, `evidence_type`, `reference_title`

```
id uuid NOT NULL = gen_random_uuid()
claim_id uuid NOT NULL
evidence_type text NOT NULL
reference_title text NOT NULL
reference_url text
strength text = 'moderate'::text
linked_at timestamp with time zone NOT NULL = now()
```

### `cn_declarations`

**Required (NOT NULL, no default):** `company_id`, `shipment_ref`, `declaration_type`, `sender_name`, `recipient_name`, `contents_description`, `reason_for_export`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
shipment_id uuid
shipment_ref text NOT NULL
declaration_type text NOT NULL
sender_name text NOT NULL
sender_address text
recipient_name text NOT NULL
recipient_address text
contents_description text NOT NULL
reason_for_export text NOT NULL
items jsonb NOT NULL = '[]'::jsonb
total_value_gbp numeric(10,2) NOT NULL = 0
total_weight_kg numeric(10,3) NOT NULL = 0
is_flagged boolean NOT NULL = false
flag_reason text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
flag_resolved_by uuid
flag_resolved_at timestamp with time zone
flag_resolution_note text
```

### `companies`

**Required (NOT NULL, no default):** `name`

```
id uuid NOT NULL = extensions.gen_random_uuid()
name text NOT NULL
created_at timestamp with time zone = now()
trading_name text
cac_registration_number text
head_office_address text
country text
phone text
logo_url text
product_categories text[] NOT NULL = '{}'::text[]
```

### `company_invites`

**Required (NOT NULL, no default):** `company_id`, `email`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
email text NOT NULL
role text NOT NULL = 'member'::text
department_id uuid
expires_at timestamp with time zone NOT NULL = (now() + '72:00:00'::interval)
accepted_at timestamp with time zone
revoked_at timestamp with time zone
created_by uuid
created_at timestamp with time zone NOT NULL = now()
module_access text[] NOT NULL = '{}'::text[]
token text
site_ids uuid[] NOT NULL = '{}'::uuid[]
job_title text
signs_applications boolean NOT NULL = false
```

### `company_members`

**Required (NOT NULL, no default):** `company_id`, `user_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
user_id uuid NOT NULL
role text NOT NULL = 'member'::text
status text NOT NULL = 'active'::text
joined_at timestamp with time zone NOT NULL = now()
module_access text[] NOT NULL = '{}'::text[]
department_id uuid
onboarding_areas text[] NOT NULL = '{}'::text[]
site_ids uuid[] NOT NULL = '{}'::uuid[]
job_title text
```

### `company_numbering_formats`

**Required (NOT NULL, no default):** `company_id`, `scope`, `pattern`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
scope text NOT NULL
pattern text NOT NULL
prefix text
seq_width integer NOT NULL = 4
seq_reset text NOT NULL = 'yearly'::text
next_seq integer NOT NULL = 1
seq_period text
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `company_rca_settings`

**Required (NOT NULL, no default):** `company_id`

```
company_id uuid NOT NULL
default_framework text NOT NULL = 'five_whys'::text
undetermined_blocks_release boolean NOT NULL = true
updated_by uuid
updated_at timestamp with time zone NOT NULL = now()
```

### `company_risk_posture`

**Required (NOT NULL, no default):** `company_id`

```
company_id uuid NOT NULL
posture_score numeric NOT NULL = 0
policy_signal_score numeric NOT NULL = 0
control_signal_score numeric NOT NULL = 0
automation_signal_score numeric NOT NULL = 0
vendor_signal_score numeric NOT NULL = 0
audit_signal_score numeric NOT NULL = 0
highest_risk_level text NOT NULL = 'low'::text
open_risks_count integer NOT NULL = 0
updated_at timestamp with time zone NOT NULL = now()
critical_risks_count integer NOT NULL = 0
high_risks_count integer NOT NULL = 0
medium_risks_count integer NOT NULL = 0
low_risks_count integer NOT NULL = 0
```

### `company_settings`

**Required (NOT NULL, no default):** `company_id`

```
company_id uuid NOT NULL
name text
logo_url text
brand_color text = '#1e3a8a'::text
tagline text
website_url text
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
project_name text
regulatory_body_access text
```

### `compliance_alert_log`

**Required (NOT NULL, no default):** `company_id`, `entity_type`, `alert_type`, `message`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
rule_id uuid
entity_type text NOT NULL
entity_id uuid
alert_type text NOT NULL
message text NOT NULL
fired_at timestamp with time zone NOT NULL = now()
fired_date date NOT NULL = CURRENT_DATE
resolved_at timestamp with time zone
metadata jsonb = '{}'::jsonb
```

### `compliance_alert_rules`

**Required (NOT NULL, no default):** `company_id`, `trigger_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
trigger_type text NOT NULL
threshold_days integer NOT NULL = 7
escalation_days integer NOT NULL = 3
notify_owner boolean NOT NULL = true
notify_admins boolean NOT NULL = true
notify_email boolean NOT NULL = true
notify_in_app boolean NOT NULL = true
is_active boolean NOT NULL = true
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `compliance_benchmarks`

**Required (NOT NULL, no default):** `company_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
total_submissions integer NOT NULL = 0
compliant_count integer NOT NULL = 0
avg_risk_score numeric(5,2) NOT NULL = 0
category_scores jsonb NOT NULL = '{}'::jsonb
industry_type text
percentile_rank numeric(5,2)
last_calculated timestamp with time zone NOT NULL = now()
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `compliance_reports`

**Required (NOT NULL, no default):** `content_id`, `regulation_version`, `overall_risk`, `strictness_level`

```
id uuid NOT NULL = gen_random_uuid()
content_id uuid NOT NULL
regulation_version text NOT NULL
overall_risk text NOT NULL
flagged_phrases jsonb = '[]'::jsonb
violated_regulations jsonb = '[]'::jsonb
suggested_rewrites jsonb = '[]'::jsonb
strictness_level text NOT NULL
analysis_timestamp timestamp with time zone = now()
created_at timestamp with time zone = now()
issues jsonb = '[]'::jsonb
jurisdiction text NOT NULL = 'nigeria'::text
```

### `consent_content_links`

**Required (NOT NULL, no default):** `company_id`, `consent_id`, `content_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
consent_id uuid NOT NULL
content_id uuid NOT NULL
linked_at timestamp with time zone NOT NULL = now()
linked_by uuid
```

### `content_blocks`

**Required (NOT NULL, no default):** `company_id`, `block_name`, `block_type`, `content_text`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
block_name text NOT NULL
block_type text NOT NULL
content_text text NOT NULL
jurisdiction text = 'all'::text
version integer NOT NULL = 1
is_locked boolean NOT NULL = false
approved_at timestamp with time zone
approved_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
created_by uuid
```

### `content_folders`

**Required (NOT NULL, no default):** `user_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
user_id uuid NOT NULL
name text NOT NULL
description text
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
parent_folder_id uuid
```

### `content_submissions`

**Required (NOT NULL, no default):** `user_id`, `title`, `content_text`, `file_name`, `file_type`, `platform`, `content_topic`, `target_audience`

```
id uuid NOT NULL = gen_random_uuid()
user_id uuid NOT NULL
title text NOT NULL
content_text text NOT NULL
file_name text NOT NULL
file_type text NOT NULL
platform text NOT NULL
content_topic text NOT NULL
target_audience text NOT NULL
status text = 'pending'::text
priority text = 'low'::text
scheduled_date timestamp with time zone
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
folder_id uuid
jurisdiction text NOT NULL = 'nigeria'::text
signoff_status text = 'draft'::text
is_locked boolean = false
locked_at timestamp with time zone
locked_by uuid
company_id uuid
submitted_for_legal_at timestamp with time zone
legal_decided_at timestamp with time zone
legal_decided_by uuid
published_at timestamp with time zone
published_by uuid
department text
current_version_number integer = 1
approval_expires_at timestamp with time zone
sla_deadline_at timestamp with time zone
brand_id uuid
ai_risk_score integer
ai_risk_summary text
is_deleted boolean = false
deleted_at timestamp with time zone
deleted_by uuid
```

### `content_versions`

**Required (NOT NULL, no default):** `submission_id`, `snapshot_by`

```
id uuid NOT NULL = gen_random_uuid()
submission_id uuid NOT NULL
version_number integer NOT NULL = 1
content_text text NOT NULL = ''::text
corrected_text text = ''::text
snapshot_by uuid NOT NULL
created_at timestamp with time zone NOT NULL = now()
```

### `contraband_rejection_log`

**Required (NOT NULL, no default):** `company_id`, `shipment_ref`, `rejection_reason`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
shipment_ref text NOT NULL
rejection_date timestamp with time zone NOT NULL = now()
items_found text[] NOT NULL = '{}'::text[]
rejection_reason text NOT NULL
description text
reporter_id uuid
customer_name text
customer_email text
customer_phone text
customer_flagged boolean NOT NULL = false
status text NOT NULL = 'rejected'::text
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `control_cross_mappings`

**Required (NOT NULL, no default):** `source_control_id`, `target_control_id`, `mapping_type`

```
id uuid NOT NULL = gen_random_uuid()
source_control_id uuid NOT NULL
target_control_id uuid NOT NULL
mapping_type text NOT NULL
notes text
created_at timestamp with time zone NOT NULL = now()
```

### `correlation_events`

**Required (NOT NULL, no default):** `company_id`, `severity`, `description`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
rule_id uuid
triggered_at timestamp with time zone NOT NULL = now()
severity text NOT NULL
description text NOT NULL
status text NOT NULL = 'open'::text
linked_risk_id uuid
metadata jsonb = '{}'::jsonb
created_at timestamp with time zone NOT NULL = now()
```

### `correlation_rules`

**Required (NOT NULL, no default):** `company_id`, `rule_name`, `signal_conditions`, `risk_impact`, `severity`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
rule_name text NOT NULL
description text
signal_conditions jsonb NOT NULL
risk_impact text NOT NULL
severity text NOT NULL
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `crisis_affected_materials`

**Required (NOT NULL, no default):** `crisis_id`, `title`, `channel`

```
id uuid NOT NULL = gen_random_uuid()
crisis_id uuid NOT NULL
title text NOT NULL
channel text NOT NULL
status text NOT NULL = 'live'::text
withdrawn_at timestamp with time zone
```

### `crisis_events`

**Required (NOT NULL, no default):** `company_id`, `title`, `product`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
title text NOT NULL
description text
level text NOT NULL = 'alert'::text
status text NOT NULL = 'active'::text
product text NOT NULL
affected_channels text[] = '{}'::text[]
affected_content_count integer = 0
withdrawn_count integer = 0
triggered_by uuid
triggered_at timestamp with time zone NOT NULL = now()
resolved_at timestamp with time zone
```

### `crisis_timeline_entries`

**Required (NOT NULL, no default):** `crisis_id`, `action`, `performer`

```
id uuid NOT NULL = gen_random_uuid()
crisis_id uuid NOT NULL
action text NOT NULL
performer text NOT NULL
details text
automated boolean = false
created_at timestamp with time zone NOT NULL = now()
```

### `ctd_documents`

**Required (NOT NULL, no default):** `dossier_id`, `company_id`, `module_number`, `document_name`

```
id uuid NOT NULL = gen_random_uuid()
dossier_id uuid NOT NULL
company_id uuid NOT NULL
module_number integer NOT NULL
document_name text NOT NULL
is_required boolean NOT NULL = true
status text NOT NULL = 'missing'::text
file_url text
notes text
updated_at timestamp with time zone = now()
```

### `ctd_dossiers`

**Required (NOT NULL, no default):** `company_id`, `product_name`, `dosage_form`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
product_name text NOT NULL
active_ingredient text
dosage_form text NOT NULL
strength text
nafdac_number text
application_type text NOT NULL = 'new_registration'::text
status text NOT NULL = 'preparation'::text
target_submission_date date
submission_date date
screening_date date
screening_clearance_date date
expected_approval_date date
dossier_reference text
notes text
created_by uuid
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
product_id uuid
```

### `ctd_module_progress`

**Required (NOT NULL, no default):** `dossier_id`, `company_id`, `module_number`

```
id uuid NOT NULL = gen_random_uuid()
dossier_id uuid NOT NULL
company_id uuid NOT NULL
module_number integer NOT NULL
status text NOT NULL = 'not_started'::text
completion_pct integer NOT NULL = 0
notes text
updated_at timestamp with time zone = now()
```

### `custom_roles`

**Required (NOT NULL, no default):** `company_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
description text = ''::text
is_system boolean NOT NULL = false
permissions jsonb NOT NULL = '{}'::jsonb
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `customer_flags`

**Required (NOT NULL, no default):** `company_id`, `customer_name`, `identifier_type`, `identifier_value`, `flag_reason`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
customer_name text NOT NULL
identifier_type text NOT NULL
identifier_value text NOT NULL
flag_type text NOT NULL = 'contraband'::text
flag_reason text NOT NULL
flagged_by uuid
related_rejection_id uuid
status text NOT NULL = 'active'::text
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `deletion_requests`

**Required (NOT NULL, no default):** `user_id`

```
id uuid NOT NULL = gen_random_uuid()
user_id uuid NOT NULL
company_id uuid
reason text
status text NOT NULL = 'pending'::text
created_at timestamp with time zone NOT NULL = now()
```

### `departments`

**Required (NOT NULL, no default):** `company_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
created_at timestamp with time zone NOT NULL = now()
code text
```

### `deviation_counters`

**Required (NOT NULL, no default):** `company_id`

```
company_id uuid NOT NULL
last_number bigint NOT NULL = 0
```

### `deviation_links`

**Required (NOT NULL, no default):** `company_id`, `deviation_id`, `linked_type`, `linked_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
deviation_id uuid NOT NULL
linked_type text NOT NULL
linked_id uuid NOT NULL
note text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
```

### `deviations`

**Required (NOT NULL, no default):** `company_id`, `deviation_number`, `title`, `severity`, `product_quality_impact`, `source_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
deviation_number text NOT NULL
title text NOT NULL
description text
severity text NOT NULL
product_quality_impact text NOT NULL
source_type text NOT NULL
source_id uuid
entry_point text NOT NULL = 'manual'::text
immediate_action text
containment text
investigation_owner uuid
investigation_due_date date
raised_by uuid
raised_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
closed_at timestamp with time zone
```

### `dispensing_records`

**Required (NOT NULL, no default):** `company_id`, `batch_id`, `material_id`, `material_lot_id`, `internal_lot_number`, `required_quantity`, `actual_quantity`, `unit`, `balance_identifier`, `dispensed_by`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
batch_id uuid NOT NULL
batch_stage_id uuid
formula_material_id uuid
material_id uuid NOT NULL
material_lot_id uuid NOT NULL
internal_lot_number text NOT NULL
required_quantity numeric(16,6) NOT NULL
actual_quantity numeric(16,6) NOT NULL
unit text NOT NULL
balance_identifier text NOT NULL
instrument_id uuid
dispensed_by uuid NOT NULL
dispensed_at timestamp with time zone NOT NULL = now()
dispense_signature_id uuid
verified_by uuid
verified_at timestamp with time zone
verify_signature_id uuid
tolerance_exception boolean NOT NULL = false
authorised_by uuid
authorisation_reason text
authorisation_signature_id uuid
notes text
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `document_tags`

**Required (NOT NULL, no default):** `content_id`, `user_id`, `tag_name`

```
id uuid NOT NULL = gen_random_uuid()
content_id uuid NOT NULL
user_id uuid NOT NULL
tag_name text NOT NULL
tag_type text NOT NULL = 'campaign'::text
created_at timestamp with time zone = now()
```

### `drift_alerts`

**Required (NOT NULL, no default):** `company_id`, `channel_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
channel_id uuid NOT NULL
drift_type text NOT NULL = 'content_change'::text
approved_hash text
current_hash text
diff_summary text
severity text NOT NULL = 'medium'::text
resolved boolean NOT NULL = false
resolved_at timestamp with time zone
resolved_by uuid
detected_at timestamp with time zone NOT NULL = now()
```

### `duty_conflicts`

**Required (NOT NULL, no default):** `duty_a`, `duty_b`, `section_a`, `section_b`, `reason`

```
duty_a text NOT NULL
duty_b text NOT NULL
section_a text NOT NULL
section_b text NOT NULL
error_code text NOT NULL = 'BATCH_DUTY_CONFLICT'::text
reason text NOT NULL
scope text NOT NULL = 'batch'::text
enforced boolean NOT NULL = true
decision_status text NOT NULL = 'mandatory'::text
note text
authority text NOT NULL = 'derived_from_pm03'::text
approved_reference text
```

### `duty_definitions`

**Required (NOT NULL, no default):** `scope`, `duty`, `reads`

```
scope text NOT NULL
duty text NOT NULL
reads text NOT NULL
decision_status text NOT NULL = 'mandatory'::text
note text
```

### `electronic_signature_attempts`

**Required (NOT NULL, no default):** `outcome`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid
user_id uuid
entity_type text
entity_id uuid
action text
outcome text NOT NULL
detail text
created_at timestamp with time zone NOT NULL = now()
```

### `electronic_signature_consumptions`

**Required (NOT NULL, no default):** `signature_id`, `history_id`

```
signature_id uuid NOT NULL
history_id uuid NOT NULL
consumed_at timestamp with time zone NOT NULL = now()
```

### `electronic_signatures`

**Required (NOT NULL, no default):** `company_id`, `signer_id`, `signer_name`, `signer_email`, `entity_type`, `entity_id`, `action`, `meaning`, `record_hash`, `signed_state`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
signer_id uuid NOT NULL
signer_name text NOT NULL
signer_email text NOT NULL
entity_type text NOT NULL
entity_id uuid NOT NULL
action text NOT NULL
meaning text NOT NULL
reason text
record_hash text NOT NULL
hash_convention text NOT NULL = 'sha256-esig-record-v1'::text
signed_state text NOT NULL
definition_id uuid
signed_at timestamp with time zone NOT NULL = now()
metadata jsonb NOT NULL = '{}'::jsonb
created_at timestamp with time zone NOT NULL = now()
```

### `entity_current_state`

**Required (NOT NULL, no default):** `company_id`, `definition_id`, `entity_type`, `entity_id`, `state_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
definition_id uuid NOT NULL
entity_type text NOT NULL
entity_id uuid NOT NULL
state_id uuid NOT NULL
entered_at timestamp with time zone NOT NULL = now()
entered_by uuid
updated_at timestamp with time zone NOT NULL = now()
```

### `entity_state_history`

**Required (NOT NULL, no default):** `company_id`, `definition_id`, `entity_type`, `entity_id`, `to_state_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
definition_id uuid NOT NULL
entity_type text NOT NULL
entity_id uuid NOT NULL
from_state_id uuid
to_state_id uuid NOT NULL
transition_id uuid
actor_id uuid
comment text
metadata jsonb NOT NULL = '{}'::jsonb
created_at timestamp with time zone NOT NULL = now()
```

### `external_evidence_ingestions`

**Required (NOT NULL, no default):** `company_id`, `source_name`, `source_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
source_name text NOT NULL
source_type text NOT NULL
status text NOT NULL = 'received'::text
submission_id uuid
related_control_id uuid
related_audit_request_id uuid
requested_by uuid
metadata jsonb NOT NULL = '{}'::jsonb
error_message text
created_at timestamp with time zone NOT NULL = now()
processed_at timestamp with time zone
```

### `extracted_claims`

**Required (NOT NULL, no default):** `company_id`, `source_document`, `claim_text`, `claim_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
source_document text NOT NULL
claim_text text NOT NULL
claim_type text NOT NULL
confidence double precision = 0
has_evidence boolean = false
status text NOT NULL = 'unreviewed'::text
extracted_by uuid
extracted_at timestamp with time zone NOT NULL = now()
```

### `facility_action_register`

**Required (NOT NULL, no default):** `company_id`, `source_kind`, `source_id`, `title`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
source_kind text NOT NULL
source_id uuid NOT NULL
title text NOT NULL
description text
owner_id uuid
due_on date
status text NOT NULL = 'open'::text
closure_evidence text
closure_ref text
completed_at timestamp with time zone
completed_by uuid
linked_capa_id uuid
cancelled_reason text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `facility_escalation_criteria`

**Required (NOT NULL, no default):** `company_id`, `code`, `description`, `basis`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
code text NOT NULL
description text NOT NULL
basis text NOT NULL
match_values text[]
window_days integer
min_count integer
requires_capa boolean NOT NULL = false
is_active boolean NOT NULL = true
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `facility_log_entries`

**Required (NOT NULL, no default):** `company_id`, `zone_id`, `log_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
zone_id uuid NOT NULL
schedule_id uuid
log_type text NOT NULL
due_at timestamp with time zone
recorded_at timestamp with time zone NOT NULL = now()
recorded_by uuid
result_value numeric(12,3)
result_unit text
result_position text
performed boolean NOT NULL = true
outcome text NOT NULL = 'within_limits'::text
notes text
reference text
linked_deviation_id uuid
created_at timestamp with time zone NOT NULL = now()
sample_method text
exposure_minutes integer
volume_litres numeric(10,2)
cleaning_method text
cleaning_agents text[]
contact_minutes integer
line_ref text
started_at timestamp with time zone
finished_at timestamp with time zone
verified_by uuid
verified_at timestamp with time zone
```

### `facility_pest_findings`

**Required (NOT NULL, no default):** `company_id`, `visit_id`, `station_code`, `finding`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
visit_id uuid NOT NULL
station_code text NOT NULL
location_ref text
zone_id uuid
finding text NOT NULL
method_used text
needs_action boolean NOT NULL = false
disposition_note text
corrective_task_id uuid
resolved_at timestamp with time zone
resolved_by uuid
resolution_note text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
severity text
affects_product boolean NOT NULL = false
```

### `facility_pest_providers`

**Required (NOT NULL, no default):** `company_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
site_id uuid
name text NOT NULL
visit_frequency text
contract_until date
methods text[] NOT NULL = '{}'::text[]
next_visit_on date
is_active boolean NOT NULL = true
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `facility_pest_visits`

**Required (NOT NULL, no default):** `company_id`, `provider_id`, `reference`, `visited_on`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
provider_id uuid NOT NULL
reference text NOT NULL
visited_on date NOT NULL
technician_name text
report_file_ref text
checked_by uuid
checked_at timestamp with time zone
notes text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `facility_water_results`

**Required (NOT NULL, no default):** `company_id`, `test_id`, `sampled_on`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
test_id uuid NOT NULL
sampled_on date NOT NULL
due_on date
result_value numeric(14,4)
result_text text
received boolean NOT NULL = true
report_ref text
laboratory_name text
analyst_name text
outcome text NOT NULL = 'not_assessed'::text
notes text
recorded_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `facility_water_sources`

**Required (NOT NULL, no default):** `company_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
site_id uuid
name text NOT NULL
source_ref text
source_detail text
purpose text
zone_id uuid
is_active boolean NOT NULL = true
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `facility_water_stages`

**Required (NOT NULL, no default):** `company_id`, `source_id`, `position`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
source_id uuid NOT NULL
position integer NOT NULL
name text NOT NULL
equipment_ref text
created_at timestamp with time zone NOT NULL = now()
```

### `facility_water_tests`

**Required (NOT NULL, no default):** `company_id`, `source_id`, `name`, `frequency`, `limit_kind`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
source_id uuid NOT NULL
name text NOT NULL
sample_point text
frequency text NOT NULL
limit_kind text NOT NULL
limit_min numeric(14,4)
limit_max numeric(14,4)
expected_text text
result_unit text
laboratory_kind text NOT NULL = 'in_house'::text
laboratory_name text
is_active boolean NOT NULL = true
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `facility_zone_schedules`

**Required (NOT NULL, no default):** `company_id`, `zone_id`, `log_type`, `description`, `frequency`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
zone_id uuid NOT NULL
log_type text NOT NULL
description text NOT NULL
frequency text NOT NULL
due_time time without time zone
alert_limit numeric(12,3)
action_limit numeric(12,3)
result_unit text
owner_id uuid
is_active boolean NOT NULL = true
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
sample_method text
protocol_positions integer
protocol_exposure_minutes integer
protocol_volume_litres numeric(10,2)
```

### `facility_zones`

**Required (NOT NULL, no default):** `company_id`, `site_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
site_id uuid NOT NULL
name text NOT NULL
code text
grade text
line_ref text
equipment_refs text[] NOT NULL = '{}'::text[]
cleaning_sop_ref text
owner_id uuid
alert_owner_after_days integer NOT NULL = 0
escalate_to_qa_after_days integer NOT NULL = 1
is_active boolean NOT NULL = true
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `framework_control_config`

**Required (NOT NULL, no default):** `company_id`, `control_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
control_id uuid NOT NULL
is_applicable boolean NOT NULL = true
test_interval_days integer NOT NULL = 365
owner_id uuid
notes text
updated_at timestamp with time zone NOT NULL = now()
```

### `framework_controls`

**Required (NOT NULL, no default):** `framework_id`, `control_code`, `title`, `description`, `control_type`, `regulation_cited`, `suggestion_template`

```
id uuid NOT NULL = gen_random_uuid()
framework_id uuid NOT NULL
section_id uuid
control_code text NOT NULL
title text NOT NULL
description text NOT NULL
control_type text NOT NULL
severity text NOT NULL = 'Yellow'::text
regulation_cited text NOT NULL
category text
jurisdiction text
pattern_source text
pattern_flags text NOT NULL = 'gi'::text
suggestion_template text NOT NULL
trigger_patterns jsonb
required_phrases jsonb
platforms jsonb
audiences jsonb
is_active boolean NOT NULL = true
created_at timestamp with time zone NOT NULL = now()
```

### `framework_evidence`

**Required (NOT NULL, no default):** `company_id`, `control_id`, `title`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
control_id uuid NOT NULL
title text NOT NULL
description text
evidence_type text NOT NULL = 'document'::text
file_name text
file_url text
expires_at date
uploaded_by uuid
created_at timestamp with time zone NOT NULL = now()
```

### `framework_sections`

**Required (NOT NULL, no default):** `framework_id`, `title`

```
id uuid NOT NULL = gen_random_uuid()
framework_id uuid NOT NULL
section_number text
title text NOT NULL
description text
sort_order integer NOT NULL = 0
```

### `framework_test_log`

**Required (NOT NULL, no default):** `company_id`, `control_id`, `status`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
control_id uuid NOT NULL
status text NOT NULL
notes text
tested_by uuid
next_test_due date
tested_at timestamp with time zone NOT NULL = now()
created_at timestamp with time zone NOT NULL = now()
```

### `gmp_critical_roles`

**Required (NOT NULL, no default):** `role`, `basis`

```
role text NOT NULL
basis text NOT NULL
created_at timestamp with time zone NOT NULL = now()
```

### `gmp_readiness_log`

**Required (NOT NULL, no default):** `company_id`, `item_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
item_id text NOT NULL
status text NOT NULL = 'gap'::text
notes text
evidence_name text
evidence_url text
updated_by uuid
updated_at timestamp with time zone NOT NULL = now()
```

### `governance_job_runs`

**Required (NOT NULL, no default):** `job_type`, `job_name`, `source`, `status`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid
job_type text NOT NULL
job_name text NOT NULL
source text NOT NULL
status text NOT NULL
started_at timestamp with time zone = now()
completed_at timestamp with time zone
duration_ms integer
triggered_by uuid
related_entity_type text
related_entity_id uuid
metadata jsonb = '{}'::jsonb
error_message text
```

### `grc_control_evidence`

**Required (NOT NULL, no default):** `company_id`, `control_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
control_id uuid NOT NULL
status text = 'valid'::text
linked_by uuid
valid_until timestamp with time zone
created_at timestamp with time zone = now()
entity_type text
entity_id uuid
```

### `grc_control_snapshots`

**Required (NOT NULL, no default):** `company_id`, `control_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
control_id uuid NOT NULL
status text = 'unknown'::text
snapshot_date timestamp with time zone = now()
notes text
created_by uuid
created_at timestamp with time zone = now()
```

### `grc_controls`

**Required (NOT NULL, no default):** `company_id`, `framework_id`, `title`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
framework_id uuid NOT NULL
reference_code text
title text NOT NULL
description text
domain_category text
status text = 'active'::text
owner_user_id uuid
created_by uuid
created_at timestamp with time zone = now()
```

### `grc_frameworks`

**Required (NOT NULL, no default):** `company_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
description text
version text
status text = 'draft'::text
created_by uuid
created_at timestamp with time zone = now()
```

### `identity_providers`

**Required (NOT NULL, no default):** `company_id`, `provider_type`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
provider_type text NOT NULL
name text NOT NULL
domain text
metadata jsonb = '{}'::jsonb
enabled boolean = true
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
```

### `identity_role_mappings`

**Required (NOT NULL, no default):** `provider_id`, `external_group`

```
id uuid NOT NULL = gen_random_uuid()
provider_id uuid NOT NULL
external_group text NOT NULL
role text
custom_role_id uuid
created_at timestamp with time zone = now()
```

### `identity_sessions`

```
id uuid NOT NULL = gen_random_uuid()
user_id uuid
company_id uuid
provider_id uuid
login_method text
ip_address text
user_agent text
created_at timestamp with time zone = now()
```

### `inprocess_oos_escalations`

**Required (NOT NULL, no default):** `company_id`, `reading_id`, `raised_by`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
reading_id uuid NOT NULL
raised_by uuid NOT NULL
raised_at timestamp with time zone NOT NULL = now()
raised_note text
decision text
decision_reason text
decided_by uuid
decided_at timestamp with time zone
signature_id uuid
deviation_id uuid
created_at timestamp with time zone NOT NULL = now()
```

### `instrument_alert_policies`

**Required (NOT NULL, no default):** `company_id`

```
company_id uuid NOT NULL
calibration_lead_days integer NOT NULL = 30
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `instrument_calibration_alerts`

**Required (NOT NULL, no default):** `company_id`, `instrument_id`, `alert_type`, `due_date`, `lead_days`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
instrument_id uuid NOT NULL
alert_type text NOT NULL
due_date date NOT NULL
lead_days integer NOT NULL
owner_user_id uuid
raised_at timestamp with time zone NOT NULL = now()
acknowledged_at timestamp with time zone
acknowledged_by uuid
```

### `instrument_calibrations`

**Required (NOT NULL, no default):** `company_id`, `instrument_id`, `calibrated_on`, `due_on`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
instrument_id uuid NOT NULL
certificate_number text
calibrated_on date NOT NULL
due_on date NOT NULL
performed_by_org text
performed_in_house boolean NOT NULL = false
result text NOT NULL = 'pass'::text
document_path text
document_mime_type text
document_size_bytes bigint
uploaded_by uuid
created_at timestamp with time zone NOT NULL = now()
```

### `instrument_usages`

**Required (NOT NULL, no default):** `company_id`, `instrument_id`, `entity_type`, `entity_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
instrument_id uuid NOT NULL
entity_type text NOT NULL
entity_id uuid NOT NULL
used_at timestamp with time zone NOT NULL = now()
used_by uuid
due_on_at_use date
instrument_code_at_use text
created_at timestamp with time zone NOT NULL = now()
```

### `instruments`

**Required (NOT NULL, no default):** `company_id`, `code`, `name`, `instrument_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
code text NOT NULL
name text NOT NULL
instrument_type text NOT NULL
manufacturer text
model text
serial_number text
location text
owner_user_id uuid
status text NOT NULL = 'in_service'::text
calibration_due_date date
last_calibrated_on date
notes text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `integration_connections`

**Required (NOT NULL, no default):** `company_id`, `provider_id`, `display_name`, `created_by`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
provider_id text NOT NULL
display_name text NOT NULL
status text NOT NULL = 'pending'::text
credentials_encrypted text
config jsonb NOT NULL = '{}'::jsonb
last_synced_at timestamp with time zone
last_health_check_at timestamp with time zone
last_error text
created_by uuid NOT NULL
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `integration_logs`

**Required (NOT NULL, no default):** `company_id`, `action`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
connection_id uuid
action text NOT NULL
level text NOT NULL = 'info'::text
message text NOT NULL = ''::text
metadata jsonb
created_at timestamp with time zone NOT NULL = now()
```

### `legal_hold_items`

**Required (NOT NULL, no default):** `company_id`, `legal_hold_id`, `entity_type`, `entity_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
legal_hold_id uuid NOT NULL
entity_type text NOT NULL
entity_id uuid NOT NULL
created_at timestamp with time zone = now()
```

### `legal_holds`

**Required (NOT NULL, no default):** `company_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
reason text
status text NOT NULL = 'active'::text
created_by uuid
created_at timestamp with time zone = now()
released_at timestamp with time zone
updated_at timestamp with time zone = now()
```

### `legal_partner_profiles`

**Required (NOT NULL, no default):** `id`, `partner_type`

```
id uuid NOT NULL
partner_type text NOT NULL
firm_name text
jurisdictions text[] NOT NULL = '{}'::text[]
specialties text[] NOT NULL = '{}'::text[]
verification_status text NOT NULL = 'pending'::text
hourly_rate numeric NOT NULL = 0
bio text
contact_email text
onboarded_at timestamp with time zone NOT NULL = now()
```

### `legal_reviews`

**Required (NOT NULL, no default):** `content_id`

```
id uuid NOT NULL = gen_random_uuid()
content_id uuid NOT NULL
reviewer_id uuid
status text NOT NULL = 'pending'::text
comments text
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
```

### `licence_renewal_alerts`

**Required (NOT NULL, no default):** `company_id`, `licence_id`, `renewal_cycle_expiry`, `milestone_months`, `due_date`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
licence_id uuid NOT NULL
renewal_cycle_expiry date NOT NULL
milestone_months integer NOT NULL
due_date date NOT NULL
raised_at timestamp with time zone NOT NULL = now()
acknowledged_at timestamp with time zone
acknowledged_by uuid
```

### `licence_renewal_policies`

**Required (NOT NULL, no default):** `company_id`

```
company_id uuid NOT NULL
alert_months integer[] NOT NULL = ARRAY[12, 6, 3]
monthly_from_month integer NOT NULL = 3
suppress_when_discontinued boolean NOT NULL = true
renewal_exception_allows_initiation boolean NOT NULL = false
renewal_exception_allows_release boolean NOT NULL = false
production_notify_roles text[] NOT NULL = ARRAY['production'::text, 'production_manager'::text, 'manufacturing'::text, 'qa'::text, 'quality_assurance'::text]
renewal_template_key text NOT NULL = 'nafdac_2026'::text
updated_at timestamp with time zone NOT NULL = now()
```

### `licence_renewal_steps`

**Required (NOT NULL, no default):** `company_id`, `licence_id`, `renewal_cycle_expiry`, `step_no`, `title`, `deadline`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
licence_id uuid NOT NULL
renewal_cycle_expiry date NOT NULL
step_no integer NOT NULL
title text NOT NULL
description text NOT NULL = ''::text
deadline date NOT NULL
is_completed boolean NOT NULL = false
completed_at timestamp with time zone
completed_by uuid
created_at timestamp with time zone NOT NULL = now()
```

### `licence_renewal_task_templates`

**Required (NOT NULL, no default):** `step_no`, `title`, `months_before`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid
template_key text NOT NULL = 'nafdac_2026'::text
step_no integer NOT NULL
title text NOT NULL
description text NOT NULL = ''::text
months_before numeric NOT NULL
created_at timestamp with time zone NOT NULL = now()
```

### `licence_variations`

**Required (NOT NULL, no default):** `company_id`, `licence_id`, `variation_class`, `variation_type`, `title`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
licence_id uuid NOT NULL
product_id uuid
reference text
variation_class text NOT NULL
variation_type text NOT NULL
title text NOT NULL
description text NOT NULL = ''::text
justification text
impact_assessment text
status text NOT NULL = 'draft'::text
submitted_date date
decision_date date
napams_reference text
resulting_expiry_date date
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `license_renewal_tasks`

**Required (NOT NULL, no default):** `license_id`, `title`, `deadline`

```
id uuid NOT NULL = gen_random_uuid()
license_id uuid NOT NULL
title text NOT NULL
description text NOT NULL = ''::text
deadline date NOT NULL
is_completed boolean NOT NULL = false
completed_at timestamp with time zone
completed_by uuid
sort_order integer NOT NULL = 0
created_at timestamp with time zone NOT NULL = now()
```

### `licenses`

**Required (NOT NULL, no default):** `company_id`, `uploaded_by`, `product_name`, `expiry_date`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
uploaded_by uuid NOT NULL
product_name text NOT NULL
nafdac_reg_number text NOT NULL = ''::text
category text NOT NULL = 'Drug'::text
expiry_date date NOT NULL
issue_date date
issuing_authority text NOT NULL = 'NAFDAC'::text
certificate_url text
status text NOT NULL = 'active'::text
renewal_status text NOT NULL = 'none'::text
notes text
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `lifecycle_definitions`

**Required (NOT NULL, no default):** `entity_type`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid
entity_type text NOT NULL
name text NOT NULL
description text
version integer NOT NULL = 1
is_active boolean NOT NULL = true
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `lifecycle_entity_sections`

**Required (NOT NULL, no default):** `entity_type`, `section`

```
entity_type text NOT NULL
section text NOT NULL
note text
```

### `lifecycle_states`

**Required (NOT NULL, no default):** `definition_id`, `state_key`, `label`

```
id uuid NOT NULL = gen_random_uuid()
definition_id uuid NOT NULL
state_key text NOT NULL
label text NOT NULL
description text
sort_order integer NOT NULL = 0
is_initial boolean NOT NULL = false
is_terminal boolean NOT NULL = false
is_locked boolean NOT NULL = false
created_at timestamp with time zone NOT NULL = now()
```

### `lifecycle_transitions`

**Required (NOT NULL, no default):** `definition_id`, `from_state_id`, `to_state_id`, `action_key`, `label`

```
id uuid NOT NULL = gen_random_uuid()
definition_id uuid NOT NULL
from_state_id uuid NOT NULL
to_state_id uuid NOT NULL
action_key text NOT NULL
label text NOT NULL
sort_order integer NOT NULL = 0
required_role text
required_permission text
requires_comment boolean NOT NULL = false
requires_signature boolean NOT NULL = false
created_at timestamp with time zone NOT NULL = now()
```

### `line_changeover_verifications`

**Required (NOT NULL, no default):** `company_id`, `clearance_id`, `method`, `result`, `performed_by`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
clearance_id uuid NOT NULL
method text NOT NULL
result text NOT NULL
detail text
measured_value numeric
limit_value numeric
unit text
performed_by uuid NOT NULL
performed_at timestamp with time zone NOT NULL = now()
created_at timestamp with time zone NOT NULL = now()
deviation_id uuid
```

### `line_clearance_check_results`

**Required (NOT NULL, no default):** `company_id`, `clearance_id`, `item_code`, `label`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
clearance_id uuid NOT NULL
item_code text NOT NULL
label text NOT NULL
requires_record_reference boolean NOT NULL = false
is_required boolean NOT NULL = true
sort_order integer NOT NULL = 0
result text
record_reference text
note text
answered_by uuid
answered_at timestamp with time zone
created_at timestamp with time zone NOT NULL = now()
```

### `line_clearance_checklist_items`

**Required (NOT NULL, no default):** `company_id`, `line_id`, `item_code`, `label`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
line_id uuid NOT NULL
item_code text NOT NULL
label text NOT NULL
requires_record_reference boolean NOT NULL = false
is_required boolean NOT NULL = true
sort_order integer NOT NULL = 0
is_active boolean NOT NULL = true
note text
created_at timestamp with time zone NOT NULL = now()
```

### `line_clearance_overrides`

**Required (NOT NULL, no default):** `company_id`, `clearance_id`, `verification_id`, `authorised_by`, `reason`, `signature_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
clearance_id uuid NOT NULL
verification_id uuid NOT NULL
authorised_by uuid NOT NULL
reason text NOT NULL
signature_id uuid NOT NULL
decided_at timestamp with time zone NOT NULL = now()
```

### `line_clearance_records`

**Required (NOT NULL, no default):** `company_id`, `line_id`, `batch_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
line_id uuid NOT NULL
batch_id uuid NOT NULL
previous_batch_id uuid
previous_product_name text
status text NOT NULL = 'in_progress'::text
performed_by uuid
performed_at timestamp with time zone
performed_signature_id uuid
verified_by uuid
verified_at timestamp with time zone
verified_signature_id uuid
notes text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `marketplace_connections`

**Required (NOT NULL, no default):** `company_id`, `legal_partner_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
legal_partner_id uuid NOT NULL
auto_assign_frequency text NOT NULL = 'none'::text
is_active boolean NOT NULL = true
created_at timestamp with time zone NOT NULL = now()
```

### `marketplace_requests`

**Required (NOT NULL, no default):** `company_id`, `legal_partner_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
legal_partner_id uuid NOT NULL
status text NOT NULL = 'pending'::text
message text
partner_reply text
created_at timestamp with time zone NOT NULL = now()
```

### `master_formula_materials`

**Required (NOT NULL, no default):** `formula_id`, `material_id`, `role`, `quantity_per_batch`, `unit`

```
id uuid NOT NULL = gen_random_uuid()
formula_id uuid NOT NULL
material_id uuid NOT NULL
role text NOT NULL
quantity_per_batch numeric(16,6) NOT NULL
unit text NOT NULL
overage_pct numeric(6,3) NOT NULL = 0
is_critical boolean NOT NULL = false
consumed_at_stage uuid
sort_order integer NOT NULL = 0
notes text
tolerance_pct numeric(6,3)
```

### `master_formula_stage_parameters`

**Required (NOT NULL, no default):** `stage_id`, `parameter`, `parameter_type`

```
id uuid NOT NULL = gen_random_uuid()
stage_id uuid NOT NULL
parameter text NOT NULL
parameter_type text NOT NULL
unit text
target_value numeric(18,6)
target_text text
min_value numeric(18,6)
max_value numeric(18,6)
is_critical boolean NOT NULL = false
sort_order integer NOT NULL = 0
notes text
sampling_interval_minutes integer
is_weight_variation boolean NOT NULL = false
```

### `master_formula_stages`

**Required (NOT NULL, no default):** `formula_id`, `sequence_no`, `stage_code`, `name`

```
id uuid NOT NULL = gen_random_uuid()
formula_id uuid NOT NULL
sequence_no integer NOT NULL
stage_code text NOT NULL
name text NOT NULL
description text
equipment text
duration_minutes integer
requires_signoff boolean NOT NULL = false
```

### `master_formulas`

**Required (NOT NULL, no default):** `company_id`, `product_id`, `version`, `batch_size`, `batch_size_unit`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
product_id uuid NOT NULL
version text NOT NULL
status text NOT NULL = 'draft'::text
batch_size numeric(14,4) NOT NULL
batch_size_unit text NOT NULL
expected_yield_pct numeric(6,3)
yield_min_pct numeric(6,3)
yield_max_pct numeric(6,3)
effective_date date
approved_by uuid
approved_at timestamp with time zone
signature_id uuid
supersedes_id uuid
superseded_at timestamp with time zone
notes text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
change_control_id uuid
```

### `material_alert_policies`

**Required (NOT NULL, no default):** `company_id`

```
company_id uuid NOT NULL
retest_lead_days integer NOT NULL = 30
expiry_lead_days integer NOT NULL = 60
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `material_certificates_of_analysis`

**Required (NOT NULL, no default):** `company_id`, `material_lot_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
material_lot_id uuid NOT NULL
certificate_number text
issued_date date
received_date date NOT NULL = CURRENT_DATE
supplier_results jsonb NOT NULL = '[]'::jsonb
document_path text
document_mime_type text
document_size_bytes bigint
verification_status text NOT NULL = 'unverified'::text
verified_at timestamp with time zone
verified_by uuid
discrepancy_count integer NOT NULL = 0
uploaded_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `material_coa_discrepancies`

**Required (NOT NULL, no default):** `company_id`, `certificate_id`, `material_lot_id`, `parameter`, `discrepancy_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
certificate_id uuid NOT NULL
material_lot_id uuid NOT NULL
parameter text NOT NULL
discrepancy_type text NOT NULL
specification_limit text
stated_value text
is_critical boolean NOT NULL = false
detected_at timestamp with time zone NOT NULL = now()
resolved_at timestamp with time zone
resolved_by uuid
resolution_note text
deviation_id uuid
```

### `material_lot_alerts`

**Required (NOT NULL, no default):** `company_id`, `material_lot_id`, `alert_type`, `due_date`, `lead_days`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
material_lot_id uuid NOT NULL
alert_type text NOT NULL
due_date date NOT NULL
lead_days integer NOT NULL
raised_at timestamp with time zone NOT NULL = now()
acknowledged_at timestamp with time zone
acknowledged_by uuid
```

### `material_lot_rejections`

**Required (NOT NULL, no default):** `company_id`, `material_lot_id`, `disposition`, `reason`, `decided_by`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
material_lot_id uuid NOT NULL
disposition text NOT NULL
reason text NOT NULL
disposition_note text
decided_by uuid NOT NULL
signature_id uuid
decided_at timestamp with time zone NOT NULL = now()
completed_at timestamp with time zone
```

### `material_lot_release_records`

**Required (NOT NULL, no default):** `company_id`, `material_lot_id`, `release_type`, `released_by`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
material_lot_id uuid NOT NULL
release_type text NOT NULL
justification text
authorised_by uuid
released_by uuid NOT NULL
signature_id uuid
released_at timestamp with time zone NOT NULL = now()
```

### `material_lot_sampling`

**Required (NOT NULL, no default):** `company_id`, `material_lot_id`, `reference`, `containers_sampled`, `containers_total`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
material_lot_id uuid NOT NULL
reference text NOT NULL
sampled_on date NOT NULL = CURRENT_DATE
sampled_by uuid
containers_sampled integer NOT NULL
containers_total integer NOT NULL
sampling_plan text
note text
created_at timestamp with time zone NOT NULL = now()
```

### `material_lots`

**Required (NOT NULL, no default):** `company_id`, `material_id`, `lot_number`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
material_id uuid NOT NULL
lot_number text NOT NULL
supplier_id uuid
supplier_batch_number text
quantity_received numeric(14,4)
quantity_available numeric(14,4)
unit_of_measure text
received_date date NOT NULL = CURRENT_DATE
manufacture_date date
supplier_expiry_date date
retest_due_date date
storage_location text
status text NOT NULL = 'quarantine'::text
received_by uuid
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `material_notification_recipients`

**Required (NOT NULL, no default):** `company_id`, `purpose`, `user_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
purpose text NOT NULL
user_id uuid NOT NULL
created_at timestamp with time zone NOT NULL = now()
```

### `material_qa_authorities`

**Required (NOT NULL, no default):** `company_id`, `user_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
user_id uuid NOT NULL
designated_by uuid
designated_at timestamp with time zone NOT NULL = now()
revoked_at timestamp with time zone
revoked_by uuid
```

### `material_specification_parameters`

**Required (NOT NULL, no default):** `specification_id`, `parameter`, `limit_type`

```
id uuid NOT NULL = gen_random_uuid()
specification_id uuid NOT NULL
parameter text NOT NULL
unit text
limit_type text NOT NULL
min_value numeric(18,6)
max_value numeric(18,6)
expected_text text
is_critical boolean NOT NULL = false
sort_order integer NOT NULL = 0
created_at timestamp with time zone NOT NULL = now()
```

### `material_specifications`

**Required (NOT NULL, no default):** `company_id`, `material_id`, `version`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
material_id uuid NOT NULL
version text NOT NULL
reference text
status text NOT NULL = 'draft'::text
effective_date date
superseded_at timestamp with time zone
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `material_test_definitions`

**Required (NOT NULL, no default):** `company_id`, `specification_parameter_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
specification_parameter_id uuid NOT NULL
code text
name text NOT NULL
method text
instrument text
is_required boolean NOT NULL = true
sort_order integer NOT NULL = 0
is_active boolean NOT NULL = true
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `material_test_results`

**Required (NOT NULL, no default):** `company_id`, `material_lot_id`, `test_definition_id`, `parameter`, `specification_limit`, `result`, `analyst_name`, `limit_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
material_lot_id uuid NOT NULL
test_definition_id uuid NOT NULL
parameter text NOT NULL
specification_limit text NOT NULL
actual_value numeric(18,6)
actual_text text
result text NOT NULL
analyst_id uuid
analyst_name text NOT NULL
test_date date NOT NULL = CURRENT_DATE
method text
instrument text
limit_type text NOT NULL
limit_min numeric(18,6)
limit_max numeric(18,6)
limit_expected_text text
superseded_at timestamp with time zone
superseded_by uuid
created_at timestamp with time zone NOT NULL = now()
signature_id uuid
```

### `materials`

**Required (NOT NULL, no default):** `company_id`, `code`, `name`, `material_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
code text NOT NULL
name text NOT NULL
material_type text NOT NULL
criticality text NOT NULL = 'standard'::text
requires_further_processing boolean NOT NULL = false
further_processing_note text
specification_reference text
specification_version text
retest_period_days integer
storage_conditions text
storage_temperature_min_c numeric(5,2)
storage_temperature_max_c numeric(5,2)
unit_of_measure text NOT NULL = 'kg'::text
is_active boolean NOT NULL = true
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
allergen_contains text[] NOT NULL = '{}'::text[]
allergen_may_contain text[] NOT NULL = '{}'::text[]
allergen_processing_aid text[] NOT NULL = '{}'::text[]
allergen_hidden boolean NOT NULL = false
```

### `migration_reconciliations`

**Required (NOT NULL, no default):** `version`, `original_version`, `filename`, `verdict`, `evidence`

```
version text NOT NULL
original_version text NOT NULL
filename text NOT NULL
verdict text NOT NULL
evidence text NOT NULL
not_reconciled text
recorded_at timestamp with time zone NOT NULL = now()
```

### `monitored_channels`

**Required (NOT NULL, no default):** `company_id`, `channel_name`, `channel_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
channel_name text NOT NULL
channel_type text NOT NULL
url text
approved_content_hash text
approved_content_snapshot text
last_checked_at timestamp with time zone
status text NOT NULL = 'active'::text
created_at timestamp with time zone NOT NULL = now()
created_by uuid
```

### `monitored_pages`

**Required (NOT NULL, no default):** `company_id`, `page_url`, `page_title`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
page_url text NOT NULL
page_title text NOT NULL
approved_content_hash text
last_crawled_at timestamp with time zone
crawl_frequency text = 'daily'::text
status text NOT NULL = 'active'::text
created_at timestamp with time zone NOT NULL = now()
```

### `notifications`

**Required (NOT NULL, no default):** `recipient_id`

```
id uuid NOT NULL = gen_random_uuid()
recipient_id uuid NOT NULL
user_id uuid
type text
content_id uuid
message text
read_at timestamp with time zone
created_at timestamp with time zone = now()
```

### `obligation_links`

**Required (NOT NULL, no default):** `company_id`, `obligation_id`, `link_type`, `linked_entity_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
obligation_id uuid NOT NULL
link_type text NOT NULL
linked_entity_id uuid NOT NULL
created_at timestamp with time zone NOT NULL = now()
```

### `operational_role_assignments`

**Required (NOT NULL, no default):** `company_id`, `user_id`, `role`, `reason`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
user_id uuid NOT NULL
role text NOT NULL
reason text NOT NULL
assigned_by uuid
assigned_at timestamp with time zone NOT NULL = now()
revoked_by uuid
revoked_at timestamp with time zone
revoke_reason text
grant_signature_id uuid
revoke_signature_id uuid
provenance text NOT NULL = 'rpc'::text
declaration text
```

### `org_regulation_libraries`

**Required (NOT NULL, no default):** `organization_id`, `regulation_id`

```
id uuid NOT NULL = gen_random_uuid()
organization_id uuid NOT NULL
regulation_id uuid NOT NULL
added_by uuid
notes text = ''::text
created_at timestamp with time zone NOT NULL = now()
```

### `organizations`

**Required (NOT NULL, no default):** `name`, `slug`

```
id uuid NOT NULL = gen_random_uuid()
name text NOT NULL
slug text NOT NULL
logo_url text
domain text
settings jsonb NOT NULL = '{}'::jsonb
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `page_compliance_alerts`

**Required (NOT NULL, no default):** `page_id`, `alert_type`, `description`

```
id uuid NOT NULL = gen_random_uuid()
page_id uuid NOT NULL
alert_type text NOT NULL
description text NOT NULL
severity text NOT NULL = 'medium'::text
resolved boolean = false
resolved_at timestamp with time zone
detected_at timestamp with time zone NOT NULL = now()
```

### `patient_consents`

**Required (NOT NULL, no default):** `company_id`, `patient_name`, `consent_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
patient_name text NOT NULL
patient_identifier_hash text
consent_type text NOT NULL
consent_status text NOT NULL = 'active'::text
signed_at timestamp with time zone
expires_at timestamp with time zone
consent_document_url text
digital_signature_hash text
notes text
created_at timestamp with time zone NOT NULL = now()
created_by uuid
```

### `pharma_ae_reports`

**Required (NOT NULL, no default):** `company_id`, `source_channel`, `product_name`, `event_description`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
connection_id uuid
source_channel text NOT NULL
product_name text NOT NULL
event_description text NOT NULL
reporter_type text = 'consumer'::text
seriousness text = 'non_serious'::text
patient_initials text
meddra_pt text
date_of_onset date
forwarded_to_pv boolean = false
pv_case_id text
forwarded_at timestamp with time zone
status text NOT NULL = 'pending'::text
created_at timestamp with time zone NOT NULL = now()
created_by uuid
```

### `pharma_label_changes`

**Required (NOT NULL, no default):** `company_id`, `product_name`, `change_type`, `change_summary`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
connection_id uuid
product_name text NOT NULL
label_version text
change_type text NOT NULL
change_summary text NOT NULL
source_system text = 'veeva_rim'::text
affected_content_count integer = 0
re_review_triggered boolean = false
status text NOT NULL = 'pending'::text
received_at timestamp with time zone NOT NULL = now()
completed_at timestamp with time zone
```

### `pharma_sync_events`

**Required (NOT NULL, no default):** `company_id`, `connection_id`, `provider_id`, `direction`, `event_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
connection_id uuid NOT NULL
provider_id text NOT NULL
direction text NOT NULL
event_type text NOT NULL
entity_type text
entity_id text
payload jsonb = '{}'::jsonb
status text NOT NULL = 'pending'::text
error_message text
created_at timestamp with time zone NOT NULL = now()
completed_at timestamp with time zone
```

### `phi_scan_results`

**Required (NOT NULL, no default):** `company_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
content_id uuid
scan_type text NOT NULL = 'text'::text
findings jsonb NOT NULL = '[]'::jsonb
risk_level text NOT NULL = 'none'::text
scanned_at timestamp with time zone NOT NULL = now()
scanned_by uuid
```

### `policies`

**Required (NOT NULL, no default):** `company_id`, `category`, `title`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
category text NOT NULL
title text NOT NULL
description text
owner_id uuid
is_active boolean = true
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
review_cycle_months integer NOT NULL = 12
next_review_due date
last_reviewed_at timestamp with time zone
```

### `policy_acknowledgements`

**Required (NOT NULL, no default):** `policy_id`, `version_id`, `user_id`

```
id uuid NOT NULL = gen_random_uuid()
policy_id uuid NOT NULL
version_id uuid NOT NULL
user_id uuid NOT NULL
acknowledged_at timestamp with time zone = now()
metadata jsonb = '{}'::jsonb
```

### `policy_decisions`

**Required (NOT NULL, no default):** `key`, `area`, `title`, `state`, `enforced`, `interim`, `needs`, `reference`

```
key text NOT NULL
area text NOT NULL
title text NOT NULL
state text NOT NULL
enforced boolean NOT NULL
temporary boolean NOT NULL = false
interim text NOT NULL
needs text NOT NULL
reference text NOT NULL
enforced_in text
```

### `policy_drafts`

**Required (NOT NULL, no default):** `company_id`, `user_id`, `title`, `content`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
user_id uuid NOT NULL
title text NOT NULL
content text NOT NULL
source_circular_id uuid
status text = 'draft'::text
version integer = 1
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `policy_templates`

**Required (NOT NULL, no default):** `title`, `category`, `base_content`

```
id uuid NOT NULL = gen_random_uuid()
title text NOT NULL
category text NOT NULL
base_content text NOT NULL
metadata jsonb = '{}'::jsonb
created_at timestamp with time zone NOT NULL = now()
```

### `policy_versions`

**Required (NOT NULL, no default):** `policy_id`, `version_label`

```
id uuid NOT NULL = gen_random_uuid()
policy_id uuid NOT NULL
submission_id uuid
version_label text NOT NULL
status text NOT NULL = 'draft'::text
published_at timestamp with time zone
created_by uuid
created_at timestamp with time zone = now()
content_text text
file_name text
file_url text
reviewer_id uuid
approver_id uuid
submitted_for_review_at timestamp with time zone
reviewed_at timestamp with time zone
approved_at timestamp with time zone
rejected_at timestamp with time zone
review_notes text
expiry_date date
```

### `product_documents`

**Required (NOT NULL, no default):** `company_id`, `scope`, `document_type`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
scope text NOT NULL
product_id uuid
document_type text NOT NULL
name text NOT NULL
description text
file_name text
file_url text
issue_date date
expiry_date date
is_ctd_administrative boolean NOT NULL = false
ctd_module text
metadata jsonb NOT NULL = '{}'::jsonb
uploaded_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `product_specification_tests`

**Required (NOT NULL, no default):** `specification_id`, `test_name`, `limit_type`

```
id uuid NOT NULL = gen_random_uuid()
specification_id uuid NOT NULL
test_name text NOT NULL
test_method text
unit text
limit_type text NOT NULL
min_value numeric
max_value numeric
expected_text text
is_required boolean NOT NULL = true
is_critical boolean NOT NULL = false
sort_order integer NOT NULL = 0
created_at timestamp with time zone NOT NULL = now()
```

### `product_specifications`

**Required (NOT NULL, no default):** `company_id`, `product_id`, `version`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
product_id uuid NOT NULL
version text NOT NULL
reference text
status text NOT NULL = 'draft'::text
effective_date date
superseded_at timestamp with time zone
approved_by uuid
approved_at timestamp with time zone
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
approval_signature_id uuid
approved_by_role text
```

### `product_weight_limits`

**Required (NOT NULL, no default):** `company_id`, `product_id`, `target_value`, `lal`, `lwl`, `uwl`, `ual`, `unit`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
product_id uuid NOT NULL
target_value numeric(18,6) NOT NULL
lal numeric(18,6) NOT NULL
lwl numeric(18,6) NOT NULL
uwl numeric(18,6) NOT NULL
ual numeric(18,6) NOT NULL
unit text NOT NULL
zone_1_action text NOT NULL = 'accept'::text
zone_2u_action text NOT NULL = 'adjust'::text
zone_2l_action text NOT NULL = 'adjust'::text
zone_3u_action text NOT NULL = 'reject'::text
zone_3l_action text NOT NULL = 'reject'::text
notes text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `production_lines`

**Required (NOT NULL, no default):** `company_id`, `code`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
code text NOT NULL
name text NOT NULL
description text
area text
is_active boolean NOT NULL = true
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `products`

**Required (NOT NULL, no default):** `company_id`, `product_code`, `trade_name`, `category`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
product_code text NOT NULL
trade_name text NOT NULL
generic_name text
description text
category text NOT NULL
status text NOT NULL = 'development'::text
manufacturing_type text NOT NULL = 'in_house'::text
manufacturer_vendor_id uuid
manufacturer_name text
manufacturing_site text
is_controlled_substance boolean NOT NULL = false
controlled_substance_schedule text
nafdac_number text
registration_expiry_date date
dosage_form text
strength text
pack_size text
shelf_life_months integer
metadata jsonb NOT NULL = '{}'::jsonb
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `profile_settings`

**Required (NOT NULL, no default):** `user_id`

```
user_id uuid NOT NULL
email_enabled boolean NOT NULL = true
inapp_enabled boolean NOT NULL = true
digest_frequency text NOT NULL = 'immediate'::text
toggles jsonb NOT NULL = '{}'::jsonb
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `profiles`

**Required (NOT NULL, no default):** `id`, `email`

```
id uuid NOT NULL
email text NOT NULL
full_name text
organization text
role text = 'content_creator'::text
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
industry_type text
primary_markets text[] = '{}'::text[]
product_categories text[] = '{}'::text[]
department text
onboarding_completed boolean NOT NULL = false
company_id uuid
custom_role_id uuid
organization_id uuid
business_unit_id uuid
brand_id uuid
vault_pin_hash text
job_title text
regulators text[]
phone text
avatar_url text
timezone text
language text = 'en'::text
default_jurisdiction text
deleted_at timestamp with time zone
```

### `raw_material_receipts`

**Required (NOT NULL, no default):** `company_id`, `material_name`, `lot_number`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
material_name text NOT NULL
material_code text
lot_number text NOT NULL
supplier_name text
quantity numeric
unit text = 'kg'::text
received_date date NOT NULL = CURRENT_DATE
test_status text NOT NULL = 'pending'::text
test_result text
received_by uuid
created_by uuid
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
```

### `regulation_impact_reports`

**Required (NOT NULL, no default):** `company_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
regulation_id uuid
regulation_title text NOT NULL = ''::text
affected_count integer NOT NULL = 0
affected_items jsonb NOT NULL = '[]'::jsonb
summary_narrative text NOT NULL = ''::text
risk_distribution jsonb NOT NULL = '{}'::jsonb
status text NOT NULL = 'generated'::text
generated_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `regulation_updates`

**Required (NOT NULL, no default):** `regulation_id`, `change_summary`, `previous_version`, `new_version`

```
id uuid NOT NULL = gen_random_uuid()
regulation_id uuid NOT NULL
change_summary text NOT NULL
previous_version text NOT NULL
new_version text NOT NULL
detected_at timestamp with time zone = now()
acknowledged_by uuid
acknowledged_at timestamp with time zone
created_at timestamp with time zone = now()
```

### `regulations`

**Required (NOT NULL, no default):** `title`, `source`, `category`, `content`, `version`

```
id uuid NOT NULL = gen_random_uuid()
title text NOT NULL
source text NOT NULL
category text NOT NULL
content text NOT NULL
source_url text
version text NOT NULL
effective_date date
last_crawled timestamp with time zone = now()
is_active boolean = true
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
jurisdiction text = 'all'::text
```

### `regulatory_alert_subscriptions`

**Required (NOT NULL, no default):** `company_id`, `regulation_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
regulation_id uuid NOT NULL
is_active boolean NOT NULL = true
notify_email boolean NOT NULL = true
notify_in_app boolean NOT NULL = true
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `regulatory_circulars`

**Required (NOT NULL, no default):** `source`, `circular_number`, `title`, `summary`

```
id uuid NOT NULL = gen_random_uuid()
source text NOT NULL
circular_number text NOT NULL
title text NOT NULL
summary text NOT NULL
product_categories text[] NOT NULL = '{}'::text[]
severity text NOT NULL = 'medium'::text
published_date timestamp with time zone NOT NULL = now()
is_active boolean NOT NULL = true
created_at timestamp with time zone NOT NULL = now()
jurisdiction text = 'all'::text
document_type text = 'circular'::text
topics text[]
source_url text
effective_date date
```

### `regulatory_crawl_runs`

```
id uuid NOT NULL = gen_random_uuid()
source_id uuid
started_at timestamp with time zone NOT NULL = now()
finished_at timestamp with time zone
status text NOT NULL = 'running'::text
fetched_count integer NOT NULL = 0
inserted_count integer NOT NULL = 0
updated_count integer NOT NULL = 0
error_message text
created_at timestamp with time zone NOT NULL = now()
```

### `regulatory_frameworks`

**Required (NOT NULL, no default):** `code`, `name`, `short_name`, `jurisdiction`, `regulatory_body`

```
id uuid NOT NULL = gen_random_uuid()
code text NOT NULL
name text NOT NULL
short_name text NOT NULL
jurisdiction text NOT NULL
description text
regulatory_body text NOT NULL
version text
is_active boolean NOT NULL = true
sort_order integer NOT NULL = 0
created_at timestamp with time zone NOT NULL = now()
```

### `regulatory_impact_assessments`

**Required (NOT NULL, no default):** `company_id`, `update_id`, `content_id`, `impact_level`, `reason`, `suggested_change`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
update_id uuid NOT NULL
content_id uuid NOT NULL
impact_level text NOT NULL
reason text NOT NULL
suggested_change text NOT NULL
original_content text
status text NOT NULL = 'pending'::text
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `regulatory_licences`

**Required (NOT NULL, no default):** `company_id`, `licence_type`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
licence_type text NOT NULL
name text NOT NULL
product_name text
registration_number text
regulatory_body text NOT NULL = 'nafdac'::text
issue_date date
expiry_date date
renewal_lead_days integer NOT NULL = 90
file_name text
file_url text
submission_id uuid
notes text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
product_id uuid
status text NOT NULL = 'draft'::text
updated_at timestamp with time zone NOT NULL = now()
discontinued_at timestamp with time zone
superseded_by_licence_id uuid
```

### `regulatory_obligations`

**Required (NOT NULL, no default):** `company_id`, `title`, `description`, `category`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
regulation_id uuid
title text NOT NULL
description text NOT NULL
jurisdiction text NOT NULL = 'nigeria'::text
category text NOT NULL
status text NOT NULL = 'identified'::text
owner_id uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
due_date date
is_recurring boolean NOT NULL = false
frequency text
```

### `regulatory_sources`

**Required (NOT NULL, no default):** `name`, `url`

```
id uuid NOT NULL = gen_random_uuid()
name text NOT NULL
jurisdiction text NOT NULL = 'all'::text
source_type text NOT NULL = 'rss'::text
url text NOT NULL
is_active boolean NOT NULL = true
priority integer NOT NULL = 50
crawl_interval_minutes integer NOT NULL = 720
last_crawled_at timestamp with time zone
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `regulatory_submissions`

**Required (NOT NULL, no default):** `company_id`, `product_name`, `product_category`, `submission_type`, `regulatory_body`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
product_name text NOT NULL
product_category text NOT NULL
submission_type text NOT NULL
regulatory_body text NOT NULL
napams_reference text
current_status text NOT NULL = 'draft'::text
document_checklist jsonb NOT NULL = '{}'::jsonb
submitted_date date
approved_date date
registration_number text
expiry_date date
notes text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
dossier_id uuid
product_id uuid
checklist_phases jsonb NOT NULL = '{}'::jsonb
```

### `regulatory_update_control_flags`

**Required (NOT NULL, no default):** `company_id`, `alert_id`, `control_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
alert_id text NOT NULL
control_id uuid NOT NULL
control_code text
control_title text
framework_id uuid
framework_name text
severity text NOT NULL = 'warning'::text
reason text
status text NOT NULL = 'flagged'::text
created_at timestamp with time zone NOT NULL = now()
```

### `regulatory_updates`

**Required (NOT NULL, no default):** `url`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid
jurisdiction text NOT NULL = 'nigeria'::text
title text NOT NULL = ''::text
url text NOT NULL
source text NOT NULL = ''::text
published_at timestamp with time zone
retrieved_at timestamp with time zone NOT NULL = now()
snippet text NOT NULL = ''::text
raw jsonb = '{}'::jsonb
```

### `retention_policies`

**Required (NOT NULL, no default):** `company_id`, `data_class`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
data_class text NOT NULL
retention_days integer NOT NULL = 365
archive_after_days integer
auto_delete boolean NOT NULL = false
enabled boolean NOT NULL = true
created_by uuid
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
```

### `review_assignments`

**Required (NOT NULL, no default):** `company_id`, `created_by`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
submission_id uuid
reviewer_ids uuid[] NOT NULL = '{}'::uuid[]
quorum integer NOT NULL = 1
sla_hours integer NOT NULL = 48
deadline_at timestamp with time zone
status text NOT NULL = 'open'::text
resolved_at timestamp with time zone
resolved_outcome text
created_by uuid NOT NULL
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
entity_type text NOT NULL = 'content_submission'::text
entity_id uuid
```

### `review_votes`

**Required (NOT NULL, no default):** `assignment_id`, `reviewer_id`, `vote`

```
id uuid NOT NULL = gen_random_uuid()
assignment_id uuid NOT NULL
reviewer_id uuid NOT NULL
vote text NOT NULL
comments text = ''::text
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `risk_links`

**Required (NOT NULL, no default):** `company_id`, `risk_id`, `link_type`, `linked_entity_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
risk_id uuid NOT NULL
link_type text NOT NULL
linked_entity_id uuid NOT NULL
created_at timestamp with time zone = now()
```

### `risk_predictions`

**Required (NOT NULL, no default):** `company_id`, `platform`, `therapeutic_area`, `target_market`, `predicted_risk`, `confidence`, `risk_grade`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
title text
platform text NOT NULL
therapeutic_area text NOT NULL
target_market text NOT NULL
claim_types text[] = '{}'::text[]
audience_type text = 'general'::text
predicted_risk integer NOT NULL
confidence integer NOT NULL
risk_grade text NOT NULL
recommendation text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
```

### `risks`

**Required (NOT NULL, no default):** `company_id`, `title`, `risk_category`, `risk_level`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
title text NOT NULL
description text
risk_category text NOT NULL
risk_level text NOT NULL
status text NOT NULL = 'identified'::text
owner_id uuid
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `root_cause_analyses`

**Required (NOT NULL, no default):** `company_id`, `subject_type`, `subject_id`, `framework`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
subject_type text NOT NULL
subject_id uuid NOT NULL
w5h1_what text
w5h1_why text
w5h1_where text
w5h1_when text
w5h1_who text
w5h1_how text
determined_root_cause text
root_cause_category text
performed_by uuid
completed_at timestamp with time zone
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
framework text NOT NULL
```

### `root_cause_categories`

**Required (NOT NULL, no default):** `company_id`, `category_key`, `label`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
category_key text NOT NULL
label text NOT NULL
sort_order integer NOT NULL = 0
is_active boolean NOT NULL = true
created_at timestamp with time zone NOT NULL = now()
```

### `root_cause_whys`

**Required (NOT NULL, no default):** `analysis_id`, `seq`, `question`

```
id uuid NOT NULL = gen_random_uuid()
analysis_id uuid NOT NULL
seq integer NOT NULL
question text NOT NULL
answer text
created_at timestamp with time zone NOT NULL = now()
```

### `scenario_attempts`

**Required (NOT NULL, no default):** `scenario_id`, `user_id`, `user_response`

```
id uuid NOT NULL = gen_random_uuid()
scenario_id uuid NOT NULL
user_id uuid NOT NULL
user_response text NOT NULL
score integer NOT NULL = 0
passed boolean = false
feedback text
attempted_at timestamp with time zone NOT NULL = now()
```

### `section_permissions`

**Required (NOT NULL, no default):** `section`, `role`, `access`

```
section text NOT NULL
role text NOT NULL
access text NOT NULL
created_at timestamp with time zone NOT NULL = now()
```

### `service_accounts`

**Required (NOT NULL, no default):** `company_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
description text
status text NOT NULL = 'active'::text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `shipment_events`

**Required (NOT NULL, no default):** `company_id`, `shipment_id`, `event_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
shipment_id uuid NOT NULL
event_type text NOT NULL
location text
notes text
occurred_at timestamp with time zone NOT NULL = now()
created_by uuid
created_at timestamp with time zone NOT NULL = now()
```

### `shipments`

**Required (NOT NULL, no default):** `company_id`, `reference`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
reference text NOT NULL
description text
origin_country text NOT NULL = 'GB'::text
destination_country text NOT NULL = 'NG'::text
sender_name text
recipient_name text
service_type text NOT NULL = 'Air Freight'::text
status text NOT NULL = 'created'::text
weight_kg numeric(10,3)
declared_value_gbp numeric(10,2)
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `signed_quality_actions`

**Required (NOT NULL, no default):** `action_key`, `entity`, `performed_by`, `basis`

```
action_key text NOT NULL
entity text NOT NULL
performed_by text NOT NULL
required boolean NOT NULL = false
decision_status text NOT NULL = 'awaiting_procedure'::text
basis text NOT NULL
```

### `sites`

**Required (NOT NULL, no default):** `company_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
site_type text NOT NULL = 'manufacturing'::text
address text
product_categories text[] NOT NULL = '{}'::text[]
notes text
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `social_mentions`

**Required (NOT NULL, no default):** `company_id`, `platform`, `author`, `author_type`, `content`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
platform text NOT NULL
author text NOT NULL
author_type text NOT NULL
content text NOT NULL
url text
flag_type text
severity text = 'low'::text
status text NOT NULL = 'new'::text
detected_at timestamp with time zone NOT NULL = now()
resolved_at timestamp with time zone
sentiment text
ai_analysis text
ai_recommendation text
```

### `social_monitoring_rules`

**Required (NOT NULL, no default):** `company_id`, `platform`, `rule_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
platform text NOT NULL
keywords text[] NOT NULL = '{}'::text[]
product text
rule_type text NOT NULL
active boolean = true
created_at timestamp with time zone NOT NULL = now()
```

### `son_audits`

**Required (NOT NULL, no default):** `company_id`, `scheduled_date`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
audit_type text NOT NULL = 'quarterly'::text
scheduled_date date NOT NULL
status text NOT NULL = 'scheduled'::text
auditor_name text
findings text
corrective_actions text
created_by uuid
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
```

### `son_certificates`

**Required (NOT NULL, no default):** `company_id`, `certificate_number`, `product_name`, `nis_standard`, `issue_date`, `expiry_date`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
certificate_type text NOT NULL = 'man_cap'::text
certificate_number text NOT NULL
product_name text NOT NULL
nis_standard text NOT NULL
issue_date date NOT NULL
expiry_date date NOT NULL
certificate_url text
notes text
created_by uuid
created_at timestamp with time zone = now()
```

### `son_mancap_applications`

**Required (NOT NULL, no default):** `company_id`, `product_name`, `nis_standard`, `application_date`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
product_name text NOT NULL
nis_standard text NOT NULL
application_date date NOT NULL
status text NOT NULL = 'draft'::text
reference_number text
certificate_number text
certificate_expiry date
notes text
created_by uuid
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
```

### `sop_acknowledgements`

**Required (NOT NULL, no default):** `sop_version_id`, `user_id`

```
id uuid NOT NULL = gen_random_uuid()
sop_version_id uuid NOT NULL
user_id uuid NOT NULL
acknowledged_at timestamp with time zone = now()
```

### `sop_documents`

**Required (NOT NULL, no default):** `company_id`, `sop_number`, `title`, `department`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
sop_number text NOT NULL
title text NOT NULL
department text NOT NULL
category text NOT NULL = 'other'::text
current_version text NOT NULL = '1.0'::text
status text NOT NULL = 'draft'::text
effective_date date
review_due_date date
owner_id uuid
created_at timestamp with time zone = now()
updated_at timestamp with time zone = now()
```

### `sop_versions`

**Required (NOT NULL, no default):** `sop_id`, `version_number`

```
id uuid NOT NULL = gen_random_uuid()
sop_id uuid NOT NULL
version_number text NOT NULL
content_text text
file_name text
file_url text
change_summary text
status text NOT NULL = 'draft'::text
approved_by uuid
approved_at timestamp with time zone
effective_date date
created_by uuid
created_at timestamp with time zone = now()
```

### `step_permissions`

**Required (NOT NULL, no default):** `step`, `label`, `roles`

```
step text NOT NULL
label text NOT NULL
roles text[] NOT NULL
needs text NOT NULL = 'none'::text
created_at timestamp with time zone NOT NULL = now()
section text
```

### `stranded_work_reassignments`

**Required (NOT NULL, no default):** `company_id`, `entity_type`, `entity_id`, `to_user`, `reason`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
entity_type text NOT NULL
entity_id uuid NOT NULL
from_user uuid
to_user uuid NOT NULL
reason text NOT NULL
reassigned_by uuid
reassigned_at timestamp with time zone NOT NULL = now()
```

### `submission_directives`

**Required (NOT NULL, no default):** `company_id`, `submission_id`, `originating_state_key`, `content`, `date_received`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
submission_id uuid NOT NULL
originating_state_key text NOT NULL
content text NOT NULL
date_received date NOT NULL
response_deadline date
responded_at timestamp with time zone
response_notes text
resolved_to_state_key text
raised_by uuid
created_at timestamp with time zone NOT NULL = now()
```

### `submission_status_log`

**Required (NOT NULL, no default):** `submission_id`, `to_status`

```
id uuid NOT NULL = gen_random_uuid()
submission_id uuid NOT NULL
from_status text
to_status text NOT NULL
notes text
updated_by uuid
created_at timestamp with time zone NOT NULL = now()
```

### `suppliers`

**Required (NOT NULL, no default):** `company_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
code text
qualification_status text NOT NULL = 'pending'::text
qualified_until date
address text
country text
contact_email text
notes text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `support_tickets`

**Required (NOT NULL, no default):** `user_id`, `subject`, `message`

```
id uuid NOT NULL = gen_random_uuid()
user_id uuid NOT NULL
company_id uuid
subject text NOT NULL
message text NOT NULL
severity text NOT NULL = 'normal'::text
status text NOT NULL = 'open'::text
created_at timestamp with time zone NOT NULL = now()
```

### `targeting_guardrails`

**Required (NOT NULL, no default):** `company_id`, `name`, `guardrail_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
description text
guardrail_type text NOT NULL
active boolean = true
violations integer = 0
created_at timestamp with time zone NOT NULL = now()
```

### `training_responses`

**Required (NOT NULL, no default):** `user_id`, `question_id`, `selected_answer`, `is_correct`

```
id uuid NOT NULL = gen_random_uuid()
user_id uuid NOT NULL
company_id uuid
question_id text NOT NULL
selected_answer integer NOT NULL
is_correct boolean NOT NULL
answered_at timestamp with time zone = now()
```

### `training_scenarios`

**Required (NOT NULL, no default):** `company_id`, `title`, `description`, `scenario_type`, `scenario_text`, `correct_response`, `explanation`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
title text NOT NULL
description text NOT NULL
scenario_type text NOT NULL
difficulty text NOT NULL = 'intermediate'::text
scenario_text text NOT NULL
correct_response text NOT NULL
explanation text NOT NULL
active boolean = true
created_at timestamp with time zone NOT NULL = now()
```

### `translation_compliance_flags`

**Required (NOT NULL, no default):** `job_id`, `original_claim`, `translated_claim`, `issue`

```
id uuid NOT NULL = gen_random_uuid()
job_id uuid NOT NULL
original_claim text NOT NULL
translated_claim text NOT NULL
issue text NOT NULL
severity text NOT NULL = 'warning'::text
rule text
market text
created_at timestamp with time zone NOT NULL = now()
```

### `translation_jobs`

**Required (NOT NULL, no default):** `company_id`, `content_title`, `target_language`, `target_market`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
content_title text NOT NULL
source_language text NOT NULL = 'en-US'::text
target_language text NOT NULL
target_market text NOT NULL
status text NOT NULL = 'pending'::text
translator text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
completed_at timestamp with time zone
```

### `vendor_audits`

**Required (NOT NULL, no default):** `vendor_id`, `audit_type`, `auditor`

```
id uuid NOT NULL = gen_random_uuid()
vendor_id uuid NOT NULL
audit_type text NOT NULL
findings text
score integer = 0
auditor text NOT NULL
audit_date timestamp with time zone NOT NULL = now()
next_audit_due timestamp with time zone
```

### `vendor_carrier_profiles`

**Required (NOT NULL, no default):** `vendor_id`

```
id uuid NOT NULL = gen_random_uuid()
vendor_id uuid NOT NULL
shipping_modes text[] = '{}'::text[]
route_coverage jsonb = '{}'::jsonb
last_mile_areas text[] = '{}'::text[]
on_time_delivery_rate numeric(5,2)
damage_rate numeric(5,2)
carrier_licence_type text
insurance_coverage_gbp numeric(14,2)
insurance_expiry date
anti_bribery_ack boolean NOT NULL = false
due_diligence_completed boolean NOT NULL = false
last_due_diligence_date date
notes text
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `vendor_contracts`

**Required (NOT NULL, no default):** `vendor_id`, `company_id`, `title`

```
id uuid NOT NULL = gen_random_uuid()
vendor_id uuid NOT NULL
company_id uuid NOT NULL
title text NOT NULL
contract_value numeric(18,2)
currency text NOT NULL = 'USD'::text
start_date date
expiry_date date
auto_renewal boolean NOT NULL = false
notice_period_days integer
sla_uptime_pct numeric(5,2)
breach_penalty_clause boolean NOT NULL = false
risk_score integer NOT NULL = 0
status text NOT NULL = 'active'::text
notes text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `vendor_documents`

**Required (NOT NULL, no default):** `vendor_id`, `uploaded_by`

```
id uuid NOT NULL = gen_random_uuid()
vendor_id uuid NOT NULL
submission_id uuid
document_type text NOT NULL = 'other'::text
uploaded_by uuid NOT NULL
created_at timestamp with time zone NOT NULL = now()
file_name text
file_url text
file_size integer
```

### `vendor_profiles`

**Required (NOT NULL, no default):** `company_id`, `vendor_name`, `vendor_type`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
vendor_name text NOT NULL
vendor_type text NOT NULL
contact_email text
compliance_certified boolean = false
certification_expiry timestamp with time zone
risk_tier text = 'medium'::text
overall_score integer = 0
status text NOT NULL = 'active'::text
created_at timestamp with time zone NOT NULL = now()
```

### `vendor_questionnaires`

**Required (NOT NULL, no default):** `vendor_id`

```
id uuid NOT NULL = gen_random_uuid()
vendor_id uuid NOT NULL
questionnaire_type text NOT NULL = 'general'::text
status text NOT NULL = 'draft'::text
sent_at timestamp with time zone
completed_at timestamp with time zone
created_at timestamp with time zone NOT NULL = now()
```

### `vendor_risk_profiles`

**Required (NOT NULL, no default):** `vendor_id`

```
id uuid NOT NULL = gen_random_uuid()
vendor_id uuid NOT NULL
risk_score integer NOT NULL = 0
risk_tier text NOT NULL = 'medium'::text
data_access_level text NOT NULL = 'none'::text
security_review_status text NOT NULL = 'pending'::text
last_review_date timestamp with time zone
next_review_date timestamp with time zone
```

### `vendors`

**Required (NOT NULL, no default):** `company_id`, `name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
category text NOT NULL = 'cloud'::text
risk_level text NOT NULL = 'medium'::text
status text NOT NULL = 'active'::text
website text
primary_contact text
created_at timestamp with time zone NOT NULL = now()
```

### `violation_trends`

**Required (NOT NULL, no default):** `company_id`, `period_start`, `period_end`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
period_start date NOT NULL
period_end date NOT NULL
category text NOT NULL = 'general'::text
violation_count integer NOT NULL = 0
severity_breakdown jsonb NOT NULL = '{}'::jsonb
top_phrases jsonb NOT NULL = '[]'::jsonb
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `waitlist_signups`

**Required (NOT NULL, no default):** `source`, `email`

```
id uuid NOT NULL = gen_random_uuid()
created_at timestamp with time zone NOT NULL = now()
source text NOT NULL
intent text
email text NOT NULL
full_name text
company text
role text
industry text
notes text
```

### `watchdog_alerts`

**Required (NOT NULL, no default):** `content_id`, `trigger_type`

```
id uuid NOT NULL = gen_random_uuid()
content_id uuid NOT NULL
regulation_id uuid
trigger_type text NOT NULL
matched_phrases jsonb = '[]'::jsonb
status text = 'pending'::text
resolved_by uuid
resolved_at timestamp with time zone
created_at timestamp with time zone = now()
circular_id uuid
```

### `webhook_deliveries`

**Required (NOT NULL, no default):** `company_id`, `endpoint_id`, `event_name`, `status`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
endpoint_id uuid NOT NULL
event_name text NOT NULL
payload jsonb NOT NULL = '{}'::jsonb
status text NOT NULL
attempt_count integer NOT NULL = 0
last_attempt_at timestamp with time zone
next_attempt_at timestamp with time zone
response_status integer
response_body_preview text
error_message text
related_entity_type text
related_entity_id uuid
created_at timestamp with time zone NOT NULL = now()
```

### `webhook_endpoints`

**Required (NOT NULL, no default):** `company_id`, `name`, `target_url`, `signing_secret_encrypted`, `secret_prefix`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
name text NOT NULL
target_url text NOT NULL
signing_secret_encrypted text NOT NULL
secret_prefix text NOT NULL
enabled boolean NOT NULL = true
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```

### `webhook_subscriptions`

**Required (NOT NULL, no default):** `company_id`, `endpoint_id`, `event_name`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
endpoint_id uuid NOT NULL
event_name text NOT NULL
enabled boolean NOT NULL = true
created_at timestamp with time zone NOT NULL = now()
```

### `whistleblower_case_updates`

**Required (NOT NULL, no default):** `report_id`, `action`, `performed_by`

```
id uuid NOT NULL = gen_random_uuid()
report_id uuid NOT NULL
action text NOT NULL
note text
performed_by text NOT NULL
created_at timestamp with time zone NOT NULL = now()
```

### `whistleblower_reports`

**Required (NOT NULL, no default):** `company_id`, `case_number`, `category`, `subject`, `description`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
case_number text NOT NULL
category text NOT NULL
subject text NOT NULL
description text NOT NULL
status text NOT NULL = 'submitted'::text
priority text NOT NULL = 'medium'::text
anonymous boolean = true
submitted_by uuid
submitted_at timestamp with time zone NOT NULL = now()
last_updated_at timestamp with time zone NOT NULL = now()
```

### `work_role_resolution`

```
id boolean NOT NULL = true
legacy_membership_bridge boolean NOT NULL = true
note text
updated_at timestamp with time zone NOT NULL = now()
```

### `workspace_frameworks`

**Required (NOT NULL, no default):** `company_id`, `framework_id`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
framework_id uuid NOT NULL
enabled_at timestamp with time zone NOT NULL = now()
enabled_by uuid
```

### `yield_reconciliation_configs`

**Required (NOT NULL, no default):** `company_id`, `product_id`, `theoretical_basis`, `input_unit`, `output_unit`, `variance_threshold_pct`

```
id uuid NOT NULL = gen_random_uuid()
company_id uuid NOT NULL
product_id uuid NOT NULL
formula_stage_id uuid
theoretical_basis text NOT NULL
input_unit text NOT NULL
output_unit text NOT NULL
output_per_input numeric(18,8) NOT NULL = 1
variance_threshold_pct numeric(8,4) NOT NULL
notes text
created_by uuid
created_at timestamp with time zone NOT NULL = now()
updated_at timestamp with time zone NOT NULL = now()
```
