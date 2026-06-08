-- Add control_id backlink to capa_records so auto-generated CAPAs
-- can reference the framework control that triggered them.

ALTER TABLE capa_records
  ADD COLUMN IF NOT EXISTS control_id  uuid REFERENCES framework_controls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS control_code text;

CREATE INDEX IF NOT EXISTS idx_capa_records_control_id
  ON capa_records(control_id)
  WHERE control_id IS NOT NULL;
