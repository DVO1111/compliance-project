
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            //  ── Carried over from the previous hand-maintained file ──
            //  These four tables are created by migrations that CANNOT
            //  apply to a plain Postgres — they are in
            //  scripts/ci/expected-migration-failures.txt — so they do
            //  not exist in the local database these types were
            //  generated from, and a straight regeneration would delete
            //  them. Thirteen source files use them.
            //
            //  Regenerate with:
            //    npx supabase gen types typescript --db-url <local url>
            //  then splice these four back in, or fix the migrations so
            //  they apply and drop this block.
            chat_relay_destinations: {
              Row: {
                id: string
                company_id: string
                connection_id: string
                provider: string
                external_id: string
                external_name: string
                is_private: boolean | null
                synced_at: string | null
              }
              Insert: {
                id?: string
                company_id: string
                connection_id: string
                provider?: string
                external_id: string
                external_name: string
                is_private?: boolean | null
                synced_at?: string | null
              }
              Update: {
                id?: string
                company_id?: string
                connection_id?: string
                provider?: string
                external_id?: string
                external_name?: string
                is_private?: boolean | null
                synced_at?: string | null
              }
              Relationships: []
            }
            grc_control_tests: {
              Row: {
                id: string
                company_id: string
                control_id: string
                test_name: string
                provider_id: string
                connection_id: string
                configuration: Record<string, unknown>
                frequency: string
                enabled: boolean
                last_run_at: string | null
                next_run_at: string | null
                created_by: string | null
                created_at: string
                updated_at: string
              }
              Insert: {
                id?: string
                company_id: string
                control_id: string
                test_name: string
                provider_id: string
                connection_id: string
                configuration?: Record<string, unknown>
                frequency?: string
                enabled?: boolean
                last_run_at?: string | null
                next_run_at?: string | null
                created_by?: string | null
                created_at?: string
                updated_at?: string
              }
              Update: {
                id?: string
                company_id?: string
                control_id?: string
                test_name?: string
                provider_id?: string
                connection_id?: string
                configuration?: Record<string, unknown>
                frequency?: string
                enabled?: boolean
                last_run_at?: string | null
                next_run_at?: string | null
                created_by?: string | null
                created_at?: string
                updated_at?: string
              }
              Relationships: []
            }
            grc_test_run_evidence: {
              Row: {
                id: string
                company_id: string
                test_run_id: string
                control_evidence_id: string
                created_at: string
              }
              Insert: {
                id?: string
                company_id: string
                test_run_id: string
                control_evidence_id: string
                created_at?: string
              }
              Update: {
                id?: string
                company_id?: string
                test_run_id?: string
                control_evidence_id?: string
                created_at?: string
              }
              Relationships: []
            }
            grc_test_runs: {
              Row: {
                id: string
                company_id: string
                test_id: string
                status: string
                result: string | null
                evidence_payload: Record<string, unknown>
                executed_at: string
                duration_ms: number | null
                error_message: string | null
              }
              Insert: {
                id?: string
                company_id: string
                test_id: string
                status: string
                result?: string | null
                evidence_payload?: Record<string, unknown>
                executed_at?: string
                duration_ms?: number | null
                error_message?: string | null
              }
              Update: {
                id?: string
                company_id?: string
                test_id?: string
                status?: string
                result?: string | null
                evidence_payload?: Record<string, unknown>
                executed_at?: string
                duration_ms?: number | null
                error_message?: string | null
              }
              Relationships: []
            }

            "access_act_owners": {
                  Row: {
                    "instead_ask": string,"reason": string,"section_key": string,"work_role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "instead_ask": string,"reason": string,"section_key": string,"work_role": string
                  }
                  Update: {
                    "instead_ask"?: string,"reason"?: string,"section_key"?: string,"work_role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_act_owners_section_key_fkey"
      columns: ["section_key"]
isOneToOne: false
      referencedRelation: "access_sections"
      referencedColumns: ["key"]
    }
                  ]
                },"access_approvers": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"access_duty_conflicts": {
                  Row: {
                    "company_id": string | null,"id": string,"instead_ask": string,"reason": string,"section_key": string,"work_role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"id"?: string,"instead_ask": string,"reason": string,"section_key": string,"work_role": string
                  }
                  Update: {
                    "company_id"?: string | null,"id"?: string,"instead_ask"?: string,"reason"?: string,"section_key"?: string,"work_role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_duty_conflicts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_duty_conflicts_section_key_fkey"
      columns: ["section_key"]
isOneToOne: false
      referencedRelation: "access_sections"
      referencedColumns: ["key"]
    }
                  ]
                },"access_restrictions": {
                  Row: {
                    "company_id": string,"id": string,"lift_reason": string | null,"lifted_at": string | null,"lifted_by": string | null,"reason": string,"section_key": string,"set_at": string,"set_by": string | null,"to_level": string,"until": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"id"?: string,"lift_reason"?: string | null,"lifted_at"?: string | null,"lifted_by"?: string | null,"reason": string,"section_key": string,"set_at"?: string,"set_by"?: string | null,"to_level": string,"until"?: string | null,"user_id": string
                  }
                  Update: {
                    "company_id"?: string,"id"?: string,"lift_reason"?: string | null,"lifted_at"?: string | null,"lifted_by"?: string | null,"reason"?: string,"section_key"?: string,"set_at"?: string,"set_by"?: string | null,"to_level"?: string,"until"?: string | null,"user_id"?: string
                  }
                  Relationships: []
                },"batch_dispatches": {
                  Row: {
                    "batch_id": string,"company_id": string,"created_at": string,"destination": string,"dispatched_at": string,"dispatched_by": string | null,"id": string,"notes": string | null,"quantity": number,"reference": string | null,"unit": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"company_id": string,"created_at"?: string,"destination": string,"dispatched_at"?: string,"dispatched_by"?: string | null,"id"?: string,"notes"?: string | null,"quantity": number,"reference"?: string | null,"unit": string
                  }
                  Update: {
                    "batch_id"?: string,"company_id"?: string,"created_at"?: string,"destination"?: string,"dispatched_at"?: string,"dispatched_by"?: string | null,"id"?: string,"notes"?: string | null,"quantity"?: number,"reference"?: string | null,"unit"?: string
                  }
                  Relationships: []
                },"product_specifications": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"company_id": string,"created_at": string,"created_by": string | null,"effective_date": string | null,"id": string,"product_id": string,"reference": string | null,"status": string,"superseded_at": string | null,"updated_at": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"effective_date"?: string | null,"id"?: string,"product_id": string,"reference"?: string | null,"status"?: string,"superseded_at"?: string | null,"updated_at"?: string,"version": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"effective_date"?: string | null,"id"?: string,"product_id": string,"reference"?: string | null,"status"?: string,"superseded_at"?: string | null,"updated_at"?: string,"version": string
                  }
                  Relationships: []
                },"product_specification_tests": {
                  Row: {
                    "created_at": string,"expected_text": string | null,"id": string,"is_critical": boolean,"is_required": boolean,"limit_type": string,"max_value": number | null,"min_value": number | null,"sort_order": number,"specification_id": string,"test_method": string | null,"test_name": string,"unit": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expected_text"?: string | null,"id"?: string,"is_critical"?: boolean,"is_required"?: boolean,"limit_type": string,"max_value"?: number | null,"min_value"?: number | null,"sort_order"?: number,"specification_id": string,"test_method"?: string | null,"test_name": string,"unit"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"expected_text"?: string | null,"id"?: string,"is_critical"?: boolean,"is_required"?: boolean,"limit_type": string,"max_value"?: number | null,"min_value"?: number | null,"sort_order"?: number,"specification_id": string,"test_method"?: string | null,"test_name": string,"unit"?: string | null
                  }
                  Relationships: []
                },"access_grants": {
                  Row: {
                    "company_id": string,"granted_at": string,"granted_by": string,"id": string,"level": string,"request_id": string | null,"revoke_reason": string | null,"revoked_at": string | null,"revoked_by": string | null,"scope": string,"section_key": string,"user_id": string,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"granted_at"?: string,"granted_by": string,"id"?: string,"level": string,"request_id"?: string | null,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"scope": string,"section_key": string,"user_id": string,"valid_until"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"granted_at"?: string,"granted_by"?: string,"id"?: string,"level"?: string,"request_id"?: string | null,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"scope"?: string,"section_key"?: string,"user_id"?: string,"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_grants_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_grants_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "access_permission_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_grants_section_key_fkey"
      columns: ["section_key"]
isOneToOne: false
      referencedRelation: "access_sections"
      referencedColumns: ["key"]
    }
                  ]
                },"access_permission_requests": {
                  Row: {
                    "company_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"granted_level": string | null,"granted_scope": string | null,"granted_until": string | null,"id": string,"level": string,"reason": string,"reference": string,"requested_by": string,"requested_until": string | null,"scope": string,"section_key": string,"status": string,"work_role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"granted_level"?: string | null,"granted_scope"?: string | null,"granted_until"?: string | null,"id"?: string,"level": string,"reason": string,"reference": string,"requested_by": string,"requested_until"?: string | null,"scope": string,"section_key": string,"status"?: string,"work_role": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"granted_level"?: string | null,"granted_scope"?: string | null,"granted_until"?: string | null,"id"?: string,"level"?: string,"reason"?: string,"reference"?: string,"requested_by"?: string,"requested_until"?: string | null,"scope"?: string,"section_key"?: string,"status"?: string,"work_role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_permission_requests_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_permission_requests_section_key_fkey"
      columns: ["section_key"]
isOneToOne: false
      referencedRelation: "access_sections"
      referencedColumns: ["key"]
    }
                  ]
                },"access_request_counters": {
                  Row: {
                    "company_id": string,"last_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"last_number"?: number
                  }
                  Update: {
                    "company_id"?: string,"last_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_request_counters_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"access_requests": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"company": string | null,"email": string,"full_name": string | null,"industry": string | null,"notes": string | null,"requested_at": string,"role": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company"?: string | null,"email": string,"full_name"?: string | null,"industry"?: string | null,"notes"?: string | null,"requested_at"?: string,"role"?: string | null
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company"?: string | null,"email"?: string,"full_name"?: string | null,"industry"?: string | null,"notes"?: string | null,"requested_at"?: string,"role"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"access_sections": {
                  Row: {
                    "key": string,"label": string,"sort_order": number,"unrequestable_reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"label": string,"sort_order"?: number,"unrequestable_reason"?: string | null
                  }
                  Update: {
                    "key"?: string,"label"?: string,"sort_order"?: number,"unrequestable_reason"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"access_settings": {
                  Row: {
                    "company_id": string,"max_grant_days": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"max_grant_days"?: number
                  }
                  Update: {
                    "company_id"?: string,"max_grant_days"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_settings_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"ad_placements": {
                  Row: {
                    "audience_segment": string | null,"campaign_name": string,"company_id": string,"context": string | null,"detected_at": string,"id": string,"impressions": number | null,"placement_url": string | null,"platform": string,"product": string,"status": string,"violation": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "audience_segment"?: string | null,"campaign_name": string,"company_id": string,"context"?: string | null,"detected_at"?: string,"id"?: string,"impressions"?: number | null,"placement_url"?: string | null,"platform": string,"product": string,"status"?: string,"violation"?: string | null
                  }
                  Update: {
                    "audience_segment"?: string | null,"campaign_name"?: string,"company_id"?: string,"context"?: string | null,"detected_at"?: string,"id"?: string,"impressions"?: number | null,"placement_url"?: string | null,"platform"?: string,"product"?: string,"status"?: string,"violation"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ad_placements_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"adverse_events": {
                  Row: {
                    "channel_id": string | null,"company_id": string,"detected_at": string,"detected_phrase": string,"id": string,"reporter_notes": string | null,"resolved_at": string | null,"resolved_by": string | null,"severity": string,"source_text": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel_id"?: string | null,"company_id": string,"detected_at"?: string,"detected_phrase": string,"id"?: string,"reporter_notes"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"severity"?: string,"source_text": string,"status"?: string
                  }
                  Update: {
                    "channel_id"?: string | null,"company_id"?: string,"detected_at"?: string,"detected_phrase"?: string,"id"?: string,"reporter_notes"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"severity"?: string,"source_text"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "adverse_events_channel_id_fkey"
      columns: ["channel_id"]
isOneToOne: false
      referencedRelation: "monitored_channels"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_asset_controls": {
                  Row: {
                    "asset_id": string,"company_id": string,"control_id": string,"created_at": string,"id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id": string,"company_id": string,"control_id": string,"created_at"?: string,"id"?: string,"status"?: string
                  }
                  Update: {
                    "asset_id"?: string,"company_id"?: string,"control_id"?: string,"created_at"?: string,"id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_asset_controls_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "ai_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_asset_controls_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_asset_controls_control_id_fkey"
      columns: ["control_id"]
isOneToOne: false
      referencedRelation: "grc_controls"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_assets": {
                  Row: {
                    "asset_type": string,"company_id": string,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"metadata": NonNullable<Json>,"name": string,"owner_id": string | null,"provider_vendor_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_type": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"name": string,"owner_id"?: string | null,"provider_vendor_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "asset_type"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"name"?: string,"owner_id"?: string | null,"provider_vendor_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_assets_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_assets_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_assets_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_assets_provider_vendor_id_fkey"
      columns: ["provider_vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_incidents": {
                  Row: {
                    "ai_asset_id": string | null,"assigned_to": string | null,"company_id": string,"created_at": string,"description": string | null,"id": string,"incident_type": string,"linked_policy_id": string | null,"linked_risk_id": string | null,"metadata": NonNullable<Json>,"reported_by": string | null,"resolved_at": string | null,"severity": string,"source": string,"status": string,"title": string,"updated_at": string,"usage_log_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_asset_id"?: string | null,"assigned_to"?: string | null,"company_id": string,"created_at"?: string,"description"?: string | null,"id"?: string,"incident_type": string,"linked_policy_id"?: string | null,"linked_risk_id"?: string | null,"metadata"?: NonNullable<Json>,"reported_by"?: string | null,"resolved_at"?: string | null,"severity": string,"source"?: string,"status"?: string,"title": string,"updated_at"?: string,"usage_log_id"?: string | null
                  }
                  Update: {
                    "ai_asset_id"?: string | null,"assigned_to"?: string | null,"company_id"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"incident_type"?: string,"linked_policy_id"?: string | null,"linked_risk_id"?: string | null,"metadata"?: NonNullable<Json>,"reported_by"?: string | null,"resolved_at"?: string | null,"severity"?: string,"source"?: string,"status"?: string,"title"?: string,"updated_at"?: string,"usage_log_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_incidents_ai_asset_id_fkey"
      columns: ["ai_asset_id"]
isOneToOne: false
      referencedRelation: "ai_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_incidents_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_incidents_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_incidents_linked_risk_id_fkey"
      columns: ["linked_risk_id"]
isOneToOne: false
      referencedRelation: "risks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_incidents_reported_by_fkey"
      columns: ["reported_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_incidents_usage_log_id_fkey"
      columns: ["usage_log_id"]
isOneToOne: false
      referencedRelation: "ai_usage_logs"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_jobs": {
                  Row: {
                    "attempts": number,"company_id": string | null,"created_at": string,"id": string,"job_type": string,"last_error": string | null,"locked_at": string | null,"locked_by": string | null,"max_attempts": number,"payload": NonNullable<Json>,"result": Json | null,"run_at": string,"status": string,"submission_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"company_id"?: string | null,"created_at"?: string,"id"?: string,"job_type"?: string,"last_error"?: string | null,"locked_at"?: string | null,"locked_by"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"result"?: Json | null,"run_at"?: string,"status"?: string,"submission_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"company_id"?: string | null,"created_at"?: string,"id"?: string,"job_type"?: string,"last_error"?: string | null,"locked_at"?: string | null,"locked_by"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"result"?: Json | null,"run_at"?: string,"status"?: string,"submission_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_output_reviews": {
                  Row: {
                    "ai_asset_id": string | null,"company_id": string,"created_at": string,"created_by": string | null,"decision_notes": string | null,"id": string,"review_type": string,"reviewed_at": string | null,"reviewer_id": string | null,"status": string,"usage_log_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_asset_id"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"decision_notes"?: string | null,"id"?: string,"review_type": string,"reviewed_at"?: string | null,"reviewer_id"?: string | null,"status"?: string,"usage_log_id": string
                  }
                  Update: {
                    "ai_asset_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"decision_notes"?: string | null,"id"?: string,"review_type"?: string,"reviewed_at"?: string | null,"reviewer_id"?: string | null,"status"?: string,"usage_log_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_output_reviews_ai_asset_id_fkey"
      columns: ["ai_asset_id"]
isOneToOne: false
      referencedRelation: "ai_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_output_reviews_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_output_reviews_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_output_reviews_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_output_reviews_usage_log_id_fkey"
      columns: ["usage_log_id"]
isOneToOne: false
      referencedRelation: "ai_usage_logs"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_prompt_templates": {
                  Row: {
                    "ai_asset_id": string | null,"approved_at": string | null,"approved_by": string | null,"company_id": string,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"name": string,"owner_id": string | null,"prompt_text": string,"status": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_asset_id"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"name": string,"owner_id"?: string | null,"prompt_text": string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "ai_asset_id"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"name"?: string,"owner_id"?: string | null,"prompt_text"?: string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_prompt_templates_ai_asset_id_fkey"
      columns: ["ai_asset_id"]
isOneToOne: false
      referencedRelation: "ai_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_prompt_templates_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_prompt_templates_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_prompt_templates_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_prompt_templates_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_risk_assessments": {
                  Row: {
                    "ai_risk_score": number,"company_id": string | null,"content_hash": string | null,"created_at": string,"expires_at": string | null,"id": string,"intent_violations": NonNullable<Json>,"model_version": string,"overall_sentiment": string,"recommendations": NonNullable<Json>,"submission_id": string,"subtle_claims": NonNullable<Json>,"summary": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_risk_score"?: number,"company_id"?: string | null,"content_hash"?: string | null,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"intent_violations"?: NonNullable<Json>,"model_version"?: string,"overall_sentiment"?: string,"recommendations"?: NonNullable<Json>,"submission_id": string,"subtle_claims"?: NonNullable<Json>,"summary"?: string,"updated_at"?: string
                  }
                  Update: {
                    "ai_risk_score"?: number,"company_id"?: string | null,"content_hash"?: string | null,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"intent_violations"?: NonNullable<Json>,"model_version"?: string,"overall_sentiment"?: string,"recommendations"?: NonNullable<Json>,"submission_id"?: string,"subtle_claims"?: NonNullable<Json>,"summary"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_risk_assessments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_risk_assessments_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "content_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_usage_logs": {
                  Row: {
                    "ai_asset_id": string | null,"company_id": string,"created_at": string,"id": string,"input_summary": string | null,"model_name": string,"output_summary": string | null,"performance": NonNullable<Json>,"provider_name": string,"review_status": string,"risk_flags": NonNullable<Json>,"source": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_asset_id"?: string | null,"company_id": string,"created_at"?: string,"id"?: string,"input_summary"?: string | null,"model_name": string,"output_summary"?: string | null,"performance"?: NonNullable<Json>,"provider_name": string,"review_status"?: string,"risk_flags"?: NonNullable<Json>,"source"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "ai_asset_id"?: string | null,"company_id"?: string,"created_at"?: string,"id"?: string,"input_summary"?: string | null,"model_name"?: string,"output_summary"?: string | null,"performance"?: NonNullable<Json>,"provider_name"?: string,"review_status"?: string,"risk_flags"?: NonNullable<Json>,"source"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_logs_ai_asset_id_fkey"
      columns: ["ai_asset_id"]
isOneToOne: false
      referencedRelation: "ai_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_usage_logs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_usage_logs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"allowed_signins": {
                  Row: {
                    "added_by": string | null,"created_at": string,"email": string,"note": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"created_at"?: string,"email": string,"note"?: string | null
                  }
                  Update: {
                    "added_by"?: string | null,"created_at"?: string,"email"?: string,"note"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"anchored_annotations": {
                  Row: {
                    "anchor_end": number,"anchor_paragraph": number,"anchor_start": number,"anchor_text": string | null,"author_id": string,"body": string,"company_id": string,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"is_resolved": boolean,"parent_id": string | null,"resolved_by": string | null,"submission_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anchor_end"?: number,"anchor_paragraph"?: number,"anchor_start"?: number,"anchor_text"?: string | null,"author_id": string,"body": string,"company_id": string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"is_resolved"?: boolean,"parent_id"?: string | null,"resolved_by"?: string | null,"submission_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "anchor_end"?: number,"anchor_paragraph"?: number,"anchor_start"?: number,"anchor_text"?: string | null,"author_id"?: string,"body"?: string,"company_id"?: string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"is_resolved"?: boolean,"parent_id"?: string | null,"resolved_by"?: string | null,"submission_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "anchored_annotations_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "anchored_annotations"
      referencedColumns: ["id"]
    }
                  ]
                },"api_keys": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"expires_at": string | null,"id": string,"key_hash": string,"key_prefix": string,"last_used_at": string | null,"last_used_ip": string | null,"name": string,"revoked_at": string | null,"scopes": (string)[],"service_account_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"key_hash": string,"key_prefix": string,"last_used_at"?: string | null,"last_used_ip"?: string | null,"name": string,"revoked_at"?: string | null,"scopes"?: (string)[],"service_account_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"key_hash"?: string,"key_prefix"?: string,"last_used_at"?: string | null,"last_used_ip"?: string | null,"name"?: string,"revoked_at"?: string | null,"scopes"?: (string)[],"service_account_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_keys_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "api_keys_service_account_id_fkey"
      columns: ["service_account_id"]
isOneToOne: false
      referencedRelation: "service_accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"api_request_logs": {
                  Row: {
                    "api_key_id": string | null,"company_id": string,"created_at": string,"error_message": string | null,"id": string,"latency_ms": number | null,"method": string,"path": string,"request_id": string | null,"scopes_used": (string)[],"service_account_id": string | null,"source_ip": string | null,"status_code": number | null,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "api_key_id"?: string | null,"company_id": string,"created_at"?: string,"error_message"?: string | null,"id"?: string,"latency_ms"?: number | null,"method": string,"path": string,"request_id"?: string | null,"scopes_used"?: (string)[],"service_account_id"?: string | null,"source_ip"?: string | null,"status_code"?: number | null,"user_agent"?: string | null
                  }
                  Update: {
                    "api_key_id"?: string | null,"company_id"?: string,"created_at"?: string,"error_message"?: string | null,"id"?: string,"latency_ms"?: number | null,"method"?: string,"path"?: string,"request_id"?: string | null,"scopes_used"?: (string)[],"service_account_id"?: string | null,"source_ip"?: string | null,"status_code"?: number | null,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_request_logs_api_key_id_fkey"
      columns: ["api_key_id"]
isOneToOne: false
      referencedRelation: "api_keys"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "api_request_logs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "api_request_logs_service_account_id_fkey"
      columns: ["service_account_id"]
isOneToOne: false
      referencedRelation: "service_accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"approval_expiry_config": {
                  Row: {
                    "auto_expire": boolean,"company_id": string,"expiry_days": number,"id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_expire"?: boolean,"company_id": string,"expiry_days"?: number,"id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "auto_expire"?: boolean,"company_id"?: string,"expiry_days"?: number,"id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"audit_export_jobs": {
                  Row: {
                    "audit_session_id": string,"company_id": string,"completed_at": string | null,"created_at": string | null,"export_type": string,"file_url": string | null,"id": string,"metadata": Json | null,"requested_by": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audit_session_id": string,"company_id": string,"completed_at"?: string | null,"created_at"?: string | null,"export_type": string,"file_url"?: string | null,"id"?: string,"metadata"?: Json | null,"requested_by"?: string | null,"status"?: string
                  }
                  Update: {
                    "audit_session_id"?: string,"company_id"?: string,"completed_at"?: string | null,"created_at"?: string | null,"export_type"?: string,"file_url"?: string | null,"id"?: string,"metadata"?: Json | null,"requested_by"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_export_jobs_audit_session_id_fkey"
      columns: ["audit_session_id"]
isOneToOne: false
      referencedRelation: "audit_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_export_jobs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_export_jobs_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_findings": {
                  Row: {
                    "category": string,"company_id": string,"description": string,"detected_at": string,"id": string,"is_resolved": boolean | null,"remediation_advice": string | null,"severity": string,"simulation_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"company_id": string,"description": string,"detected_at"?: string,"id"?: string,"is_resolved"?: boolean | null,"remediation_advice"?: string | null,"severity": string,"simulation_id": string,"title": string
                  }
                  Update: {
                    "category"?: string,"company_id"?: string,"description"?: string,"detected_at"?: string,"id"?: string,"is_resolved"?: boolean | null,"remediation_advice"?: string | null,"severity"?: string,"simulation_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_findings_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_findings_simulation_id_fkey"
      columns: ["simulation_id"]
isOneToOne: false
      referencedRelation: "audit_simulations"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"company_id": string | null,"created_at": string | null,"entity_id": string | null,"entity_type": string,"evidence_snapshot": Json | null,"id": string,"integrity_hash": string | null,"ip_address": string | null,"metadata": Json | null,"previous_hash": string | null,"sequence_number": number | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"company_id"?: string | null,"created_at"?: string | null,"entity_id"?: string | null,"entity_type": string,"evidence_snapshot"?: Json | null,"id"?: string,"integrity_hash"?: string | null,"ip_address"?: string | null,"metadata"?: Json | null,"previous_hash"?: string | null,"sequence_number"?: number | null,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"company_id"?: string | null,"created_at"?: string | null,"entity_id"?: string | null,"entity_type"?: string,"evidence_snapshot"?: Json | null,"id"?: string,"integrity_hash"?: string | null,"ip_address"?: string | null,"metadata"?: Json | null,"previous_hash"?: string | null,"sequence_number"?: number | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_audit_logs_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_prep_items": {
                  Row: {
                    "company_id": string,"created_at": string,"description": string | null,"id": string,"item_date": string | null,"item_type": string,"metadata": NonNullable<Json>,"relevance_tag": string | null,"session_id": string,"source_id": string | null,"source_table": string,"status": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"description"?: string | null,"id"?: string,"item_date"?: string | null,"item_type": string,"metadata"?: NonNullable<Json>,"relevance_tag"?: string | null,"session_id": string,"source_id"?: string | null,"source_table": string,"status"?: string | null,"title": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"item_date"?: string | null,"item_type"?: string,"metadata"?: NonNullable<Json>,"relevance_tag"?: string | null,"session_id"?: string,"source_id"?: string | null,"source_table"?: string,"status"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_prep_items_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_prep_items_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "audit_prep_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_prep_sessions": {
                  Row: {
                    "ai_summary": string | null,"assembled_at": string | null,"audit_type": string,"company_id": string,"created_at": string,"created_by": string | null,"evidence_counts": NonNullable<Json>,"id": string,"inspection_type": string,"inspector_name": string | null,"inspector_org": string | null,"name": string,"scheduled_date": string | null,"scope_notes": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_summary"?: string | null,"assembled_at"?: string | null,"audit_type"?: string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"evidence_counts"?: NonNullable<Json>,"id"?: string,"inspection_type"?: string,"inspector_name"?: string | null,"inspector_org"?: string | null,"name": string,"scheduled_date"?: string | null,"scope_notes"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "ai_summary"?: string | null,"assembled_at"?: string | null,"audit_type"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"evidence_counts"?: NonNullable<Json>,"id"?: string,"inspection_type"?: string,"inspector_name"?: string | null,"inspector_org"?: string | null,"name"?: string,"scheduled_date"?: string | null,"scope_notes"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_prep_sessions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_request_evidence": {
                  Row: {
                    "audit_request_id": string,"company_id": string,"created_at": string,"id": string,"linked_by": string | null,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audit_request_id": string,"company_id": string,"created_at"?: string,"id"?: string,"linked_by"?: string | null,"submission_id": string
                  }
                  Update: {
                    "audit_request_id"?: string,"company_id"?: string,"created_at"?: string,"id"?: string,"linked_by"?: string | null,"submission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_request_evidence_audit_request_id_fkey"
      columns: ["audit_request_id"]
isOneToOne: false
      referencedRelation: "audit_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fk_audit_request_evidence_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_request_items": {
                  Row: {
                    "audit_request_id": string,"company_id": string,"control_id": string | null,"created_at": string,"id": string,"policy_version_id": string | null,"vendor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "audit_request_id": string,"company_id": string,"control_id"?: string | null,"created_at"?: string,"id"?: string,"policy_version_id"?: string | null,"vendor_id"?: string | null
                  }
                  Update: {
                    "audit_request_id"?: string,"company_id"?: string,"control_id"?: string | null,"created_at"?: string,"id"?: string,"policy_version_id"?: string | null,"vendor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_request_items_audit_request_id_fkey"
      columns: ["audit_request_id"]
isOneToOne: false
      referencedRelation: "audit_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fk_audit_request_items_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_requests": {
                  Row: {
                    "assigned_to": string | null,"audit_session_id": string,"company_id": string,"created_at": string,"description": string | null,"due_at": string | null,"fulfilled_at": string | null,"id": string,"requested_by": string | null,"status": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"audit_session_id": string,"company_id": string,"created_at"?: string,"description"?: string | null,"due_at"?: string | null,"fulfilled_at"?: string | null,"id"?: string,"requested_by"?: string | null,"status"?: string,"title": string
                  }
                  Update: {
                    "assigned_to"?: string | null,"audit_session_id"?: string,"company_id"?: string,"created_at"?: string,"description"?: string | null,"due_at"?: string | null,"fulfilled_at"?: string | null,"id"?: string,"requested_by"?: string | null,"status"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_requests_audit_session_id_fkey"
      columns: ["audit_session_id"]
isOneToOne: false
      referencedRelation: "audit_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fk_audit_requests_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_retention_policies": {
                  Row: {
                    "company_id": string,"created_at": string | null,"description": string | null,"id": string,"is_active": boolean | null,"jurisdiction": string,"retention_years": number,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean | null,"jurisdiction"?: string,"retention_years"?: number,"updated_at"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean | null,"jurisdiction"?: string,"retention_years"?: number,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"audit_session_participants": {
                  Row: {
                    "audit_session_id": string,"company_id": string,"created_at": string,"id": string,"invited_email": string | null,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audit_session_id": string,"company_id": string,"created_at"?: string,"id"?: string,"invited_email"?: string | null,"role"?: string,"user_id": string
                  }
                  Update: {
                    "audit_session_id"?: string,"company_id"?: string,"created_at"?: string,"id"?: string,"invited_email"?: string | null,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_session_participants_audit_session_id_fkey"
      columns: ["audit_session_id"]
isOneToOne: false
      referencedRelation: "audit_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fk_audit_session_participants_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_sessions": {
                  Row: {
                    "audit_type": string,"company_id": string,"created_at": string,"created_by": string | null,"end_date": string | null,"id": string,"name": string,"start_date": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audit_type"?: string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"end_date"?: string | null,"id"?: string,"name": string,"start_date"?: string | null,"status"?: string
                  }
                  Update: {
                    "audit_type"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"end_date"?: string | null,"id"?: string,"name"?: string,"start_date"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_audit_sessions_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_simulations": {
                  Row: {
                    "audit_type": string,"company_id": string,"completed_at": string | null,"created_at": string,"id": string,"metadata": Json | null,"score": number,"status": string,"summary": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "audit_type": string,"company_id": string,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"metadata"?: Json | null,"score": number,"status"?: string,"summary"?: string | null
                  }
                  Update: {
                    "audit_type"?: string,"company_id"?: string,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"metadata"?: Json | null,"score"?: number,"status"?: string,"summary"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_simulations_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"authorised_signatories": {
                  Row: {
                    "added_at": string,"added_by": string | null,"company_id": string,"email": string,"full_name": string | null,"id": string,"job_title": string | null,"removed_at": string | null,"removed_by": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"added_by"?: string | null,"company_id": string,"email": string,"full_name"?: string | null,"id"?: string,"job_title"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "added_at"?: string,"added_by"?: string | null,"company_id"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"job_title"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "authorised_signatories_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"batch_inprocess_qc": {
                  Row: {
                    "batch_id": string,"company_id": string,"created_at": string | null,"id": string,"parameter": string,"pass": boolean,"result": string,"specification": string | null,"stage_name": string,"tested_at": string | null,"tested_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"company_id": string,"created_at"?: string | null,"id"?: string,"parameter": string,"pass"?: boolean,"result": string,"specification"?: string | null,"stage_name": string,"tested_at"?: string | null,"tested_by"?: string | null
                  }
                  Update: {
                    "batch_id"?: string,"company_id"?: string,"created_at"?: string | null,"id"?: string,"parameter"?: string,"pass"?: boolean,"result"?: string,"specification"?: string | null,"stage_name"?: string,"tested_at"?: string | null,"tested_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "batch_inprocess_qc_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batch_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_inprocess_qc_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"batch_material_genealogy": {
                  Row: {
                    "batch_id": string,"company_id": string,"created_at": string,"dispensing_count": number,"first_dispensed_at": string,"id": string,"last_dispensed_at": string,"material_id": string,"material_lot_id": string,"total_quantity": number,"unit": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"company_id": string,"created_at"?: string,"dispensing_count"?: number,"first_dispensed_at"?: string,"id"?: string,"last_dispensed_at"?: string,"material_id": string,"material_lot_id": string,"total_quantity"?: number,"unit": string
                  }
                  Update: {
                    "batch_id"?: string,"company_id"?: string,"created_at"?: string,"dispensing_count"?: number,"first_dispensed_at"?: string,"id"?: string,"last_dispensed_at"?: string,"material_id"?: string,"material_lot_id"?: string,"total_quantity"?: number,"unit"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "batch_material_genealogy_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batch_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_material_genealogy_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_material_genealogy_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_material_genealogy_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_material_genealogy_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots_conditionally_released"
      referencedColumns: ["material_lot_id"]
    }
                  ]
                },"batch_qc_results": {
                  Row: {
                    "batch_id": string,"id": string,"pass": boolean,"result": string,"specification": string | null,"test_method": string | null,"test_name": string,"tested_at": string | null,"tested_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"id"?: string,"pass": boolean,"result": string,"specification"?: string | null,"test_method"?: string | null,"test_name": string,"tested_at"?: string | null,"tested_by"?: string | null
                  }
                  Update: {
                    "batch_id"?: string,"id"?: string,"pass"?: boolean,"result"?: string,"specification"?: string | null,"test_method"?: string | null,"test_name"?: string,"tested_at"?: string | null,"tested_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "batch_qc_results_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batch_records"
      referencedColumns: ["id"]
    }
                  ]
                },"batch_records": {
                  Row: {
                    "batch_number": string,"batch_size": number,"company_id": string,"created_at": string | null,"created_by": string | null,"customer_name": string | null,"execution_closed_at": string | null,"execution_closed_by": string | null,"expiry_date": string,"formula_id": string | null,"hold_reason": string | null,"id": string,"line_id": string | null,"manufacturing_date": string,"product_code": string | null,"product_id": string | null,"product_name": string,"qc_completed_at": string | null,"qc_started_at": string | null,"release_notes": string | null,"released_at": string | null,"released_by": string | null,"status": string,"unit": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_number": string,"batch_size": number,"company_id": string,"created_at"?: string | null,"created_by"?: string | null,"customer_name"?: string | null,"execution_closed_at"?: string | null,"execution_closed_by"?: string | null,"expiry_date": string,"formula_id"?: string | null,"hold_reason"?: string | null,"id"?: string,"line_id"?: string | null,"manufacturing_date": string,"product_code"?: string | null,"product_id"?: string | null,"product_name": string,"qc_completed_at"?: string | null,"qc_started_at"?: string | null,"release_notes"?: string | null,"released_at"?: string | null,"released_by"?: string | null,"status"?: string,"unit"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "batch_number"?: string,"batch_size"?: number,"company_id"?: string,"created_at"?: string | null,"created_by"?: string | null,"customer_name"?: string | null,"execution_closed_at"?: string | null,"execution_closed_by"?: string | null,"expiry_date"?: string,"formula_id"?: string | null,"hold_reason"?: string | null,"id"?: string,"line_id"?: string | null,"manufacturing_date"?: string,"product_code"?: string | null,"product_id"?: string | null,"product_name"?: string,"qc_completed_at"?: string | null,"qc_started_at"?: string | null,"release_notes"?: string | null,"released_at"?: string | null,"released_by"?: string | null,"status"?: string,"unit"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "batch_records_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_records_formula_id_fkey"
      columns: ["formula_id"]
isOneToOne: false
      referencedRelation: "master_formula_current"
      referencedColumns: ["formula_id"]
    },{
      foreignKeyName: "batch_records_formula_id_fkey"
      columns: ["formula_id"]
isOneToOne: false
      referencedRelation: "master_formulas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_records_line_id_fkey"
      columns: ["line_id"]
isOneToOne: false
      referencedRelation: "production_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_records_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"batch_stage_corrections": {
                  Row: {
                    "batch_stage_id": string,"company_id": string,"corrected_at": string,"corrected_by": string,"field_name": string,"id": string,"new_value": string | null,"original_value": string | null,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_stage_id": string,"company_id": string,"corrected_at"?: string,"corrected_by": string,"field_name": string,"id"?: string,"new_value"?: string | null,"original_value"?: string | null,"reason": string
                  }
                  Update: {
                    "batch_stage_id"?: string,"company_id"?: string,"corrected_at"?: string,"corrected_by"?: string,"field_name"?: string,"id"?: string,"new_value"?: string | null,"original_value"?: string | null,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "batch_stage_corrections_batch_stage_id_fkey"
      columns: ["batch_stage_id"]
isOneToOne: false
      referencedRelation: "batch_stages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_stage_corrections_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"batch_stage_parameter_readings": {
                  Row: {
                    "batch_stage_id": string,"company_id": string,"corrected_from_id": string | null,"created_at": string,"formula_parameter_id": string | null,"id": string,"in_specification": boolean | null,"max_value": number | null,"min_value": number | null,"oos_acknowledged_at": string | null,"oos_acknowledged_by": string | null,"parameter_name": string,"parameter_type": string,"reading_text": string | null,"reading_value": number | null,"recorded_at": string,"recorded_by": string | null,"sequence_no": number | null,"target_value": number | null,"unit": string | null,"weight_zone": string | null,"zone_action": string | null,"zone_lal": number | null,"zone_lwl": number | null,"zone_ual": number | null,"zone_uwl": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_stage_id": string,"company_id": string,"corrected_from_id"?: string | null,"created_at"?: string,"formula_parameter_id"?: string | null,"id"?: string,"in_specification"?: boolean | null,"max_value"?: number | null,"min_value"?: number | null,"oos_acknowledged_at"?: string | null,"oos_acknowledged_by"?: string | null,"parameter_name": string,"parameter_type": string,"reading_text"?: string | null,"reading_value"?: number | null,"recorded_at"?: string,"recorded_by"?: string | null,"sequence_no"?: number | null,"target_value"?: number | null,"unit"?: string | null,"weight_zone"?: string | null,"zone_action"?: string | null,"zone_lal"?: number | null,"zone_lwl"?: number | null,"zone_ual"?: number | null,"zone_uwl"?: number | null
                  }
                  Update: {
                    "batch_stage_id"?: string,"company_id"?: string,"corrected_from_id"?: string | null,"created_at"?: string,"formula_parameter_id"?: string | null,"id"?: string,"in_specification"?: boolean | null,"max_value"?: number | null,"min_value"?: number | null,"oos_acknowledged_at"?: string | null,"oos_acknowledged_by"?: string | null,"parameter_name"?: string,"parameter_type"?: string,"reading_text"?: string | null,"reading_value"?: number | null,"recorded_at"?: string,"recorded_by"?: string | null,"sequence_no"?: number | null,"target_value"?: number | null,"unit"?: string | null,"weight_zone"?: string | null,"zone_action"?: string | null,"zone_lal"?: number | null,"zone_lwl"?: number | null,"zone_ual"?: number | null,"zone_uwl"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "batch_stage_parameter_readings_batch_stage_id_fkey"
      columns: ["batch_stage_id"]
isOneToOne: false
      referencedRelation: "batch_stages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_stage_parameter_readings_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_stage_parameter_readings_corrected_from_id_fkey"
      columns: ["corrected_from_id"]
isOneToOne: false
      referencedRelation: "batch_stage_parameter_readings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_stage_parameter_readings_formula_parameter_id_fkey"
      columns: ["formula_parameter_id"]
isOneToOne: false
      referencedRelation: "master_formula_stage_parameters"
      referencedColumns: ["id"]
    }
                  ]
                },"batch_stages": {
                  Row: {
                    "batch_id": string,"company_id": string,"completed_at": string | null,"created_at": string,"formula_stage_id": string | null,"id": string,"name": string,"operator_id": string | null,"operator_signature_id": string | null,"requires_verifier": boolean,"sequence_no": number,"started_at": string | null,"started_by": string | null,"status": string,"updated_at": string,"verifier_id": string | null,"verifier_signature_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"company_id": string,"completed_at"?: string | null,"created_at"?: string,"formula_stage_id"?: string | null,"id"?: string,"name": string,"operator_id"?: string | null,"operator_signature_id"?: string | null,"requires_verifier"?: boolean,"sequence_no": number,"started_at"?: string | null,"started_by"?: string | null,"status"?: string,"updated_at"?: string,"verifier_id"?: string | null,"verifier_signature_id"?: string | null
                  }
                  Update: {
                    "batch_id"?: string,"company_id"?: string,"completed_at"?: string | null,"created_at"?: string,"formula_stage_id"?: string | null,"id"?: string,"name"?: string,"operator_id"?: string | null,"operator_signature_id"?: string | null,"requires_verifier"?: boolean,"sequence_no"?: number,"started_at"?: string | null,"started_by"?: string | null,"status"?: string,"updated_at"?: string,"verifier_id"?: string | null,"verifier_signature_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "batch_stages_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batch_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_stages_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_stages_formula_stage_id_fkey"
      columns: ["formula_stage_id"]
isOneToOne: false
      referencedRelation: "master_formula_stages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_stages_operator_signature_id_fkey"
      columns: ["operator_signature_id"]
isOneToOne: false
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_stages_verifier_signature_id_fkey"
      columns: ["verifier_signature_id"]
isOneToOne: false
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    }
                  ]
                },"batch_yield_reconciliations": {
                  Row: {
                    "actual_quantity": number,"authorisation_reason": string | null,"authorisation_signature_id": string | null,"authorised_at": string | null,"authorised_by": string | null,"basis_quantity": number,"batch_id": string,"batch_stage_id": string | null,"company_id": string,"config_id": string | null,"created_at": string,"deviation_id": string | null,"id": string,"investigation_note": string | null,"investigation_required": boolean,"notes": string | null,"output_per_input": number,"recorded_at": string,"recorded_by": string,"rejects_quantity": number | null,"samples_quantity": number | null,"theoretical_basis": string,"theoretical_quantity": number,"threshold_pct": number,"unit": string,"updated_at": string,"variance_pct": number | null,"within_threshold": boolean | null,"yield_pct": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_quantity": number,"authorisation_reason"?: string | null,"authorisation_signature_id"?: string | null,"authorised_at"?: string | null,"authorised_by"?: string | null,"basis_quantity": number,"batch_id": string,"batch_stage_id"?: string | null,"company_id": string,"config_id"?: string | null,"created_at"?: string,"deviation_id"?: string | null,"id"?: string,"investigation_note"?: string | null,"investigation_required"?: boolean,"notes"?: string | null,"output_per_input": number,"recorded_at"?: string,"recorded_by": string,"rejects_quantity"?: number | null,"samples_quantity"?: number | null,"theoretical_basis": string,"theoretical_quantity": number,"threshold_pct": number,"unit": string,"updated_at"?: string,"variance_pct"?: number | null,"within_threshold"?: boolean | null,"yield_pct"?: number | null
                  }
                  Update: {
                    "actual_quantity"?: number,"authorisation_reason"?: string | null,"authorisation_signature_id"?: string | null,"authorised_at"?: string | null,"authorised_by"?: string | null,"basis_quantity"?: number,"batch_id"?: string,"batch_stage_id"?: string | null,"company_id"?: string,"config_id"?: string | null,"created_at"?: string,"deviation_id"?: string | null,"id"?: string,"investigation_note"?: string | null,"investigation_required"?: boolean,"notes"?: string | null,"output_per_input"?: number,"recorded_at"?: string,"recorded_by"?: string,"rejects_quantity"?: number | null,"samples_quantity"?: number | null,"theoretical_basis"?: string,"theoretical_quantity"?: number,"threshold_pct"?: number,"unit"?: string,"updated_at"?: string,"variance_pct"?: number | null,"within_threshold"?: boolean | null,"yield_pct"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "batch_yield_reconciliations_authorisation_signature_id_fkey"
      columns: ["authorisation_signature_id"]
isOneToOne: false
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_yield_reconciliations_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batch_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_yield_reconciliations_batch_stage_id_fkey"
      columns: ["batch_stage_id"]
isOneToOne: false
      referencedRelation: "batch_stages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_yield_reconciliations_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_yield_reconciliations_config_id_fkey"
      columns: ["config_id"]
isOneToOne: false
      referencedRelation: "yield_reconciliation_configs"
      referencedColumns: ["id"]
    }
                  ]
                },"block_usage": {
                  Row: {
                    "block_id": string,"company_id": string,"content_id": string,"id": string,"used_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id": string,"company_id": string,"content_id": string,"id"?: string,"used_at"?: string
                  }
                  Update: {
                    "block_id"?: string,"company_id"?: string,"content_id"?: string,"id"?: string,"used_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "block_usage_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "content_blocks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "block_usage_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"brands": {
                  Row: {
                    "business_unit_id": string,"created_at": string,"id": string,"is_active": boolean,"jurisdictions": (string)[],"logo_url": string | null,"name": string,"organization_id": string,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_unit_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"jurisdictions"?: (string)[],"logo_url"?: string | null,"name": string,"organization_id": string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "business_unit_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"jurisdictions"?: (string)[],"logo_url"?: string | null,"name"?: string,"organization_id"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "brands_business_unit_id_fkey"
      columns: ["business_unit_id"]
isOneToOne: false
      referencedRelation: "business_units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brands_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"business_unit_seats": {
                  Row: {
                    "allocated_seats": number,"business_unit_id": string,"id": string,"updated_at": string,"used_seats": number
                  }
                  ComputedFields: never
                  Insert: {
                    "allocated_seats"?: number,"business_unit_id": string,"id"?: string,"updated_at"?: string,"used_seats"?: number
                  }
                  Update: {
                    "allocated_seats"?: number,"business_unit_id"?: string,"id"?: string,"updated_at"?: string,"used_seats"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_unit_seats_business_unit_id_fkey"
      columns: ["business_unit_id"]
isOneToOne: true
      referencedRelation: "business_units"
      referencedColumns: ["id"]
    }
                  ]
                },"business_units": {
                  Row: {
                    "company_id": string | null,"created_at": string,"description": string | null,"id": string,"name": string,"organization_id": string,"region": string | null,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"organization_id": string,"region"?: string | null,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"organization_id"?: string,"region"?: string | null,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_units_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"calendar_events": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"event_type": string,"id": string,"is_auto_dated": boolean,"legal_acknowledged": boolean,"legal_planned_at": string | null,"needs_schedule_confirmation": boolean,"scheduled_at": string,"status": string,"submission_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"event_type"?: string,"id"?: string,"is_auto_dated"?: boolean,"legal_acknowledged"?: boolean,"legal_planned_at"?: string | null,"needs_schedule_confirmation"?: boolean,"scheduled_at"?: string,"status"?: string,"submission_id": string,"title"?: string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"event_type"?: string,"id"?: string,"is_auto_dated"?: boolean,"legal_acknowledged"?: boolean,"legal_planned_at"?: string | null,"needs_schedule_confirmation"?: boolean,"scheduled_at"?: string,"status"?: string,"submission_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"calendar_reminders": {
                  Row: {
                    "created_at": string,"event_id": string,"id": string,"message": string | null,"recipient_id": string,"reminder_type": string,"sent_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: string,"message"?: string | null,"recipient_id": string,"reminder_type": string,"sent_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: string,"message"?: string | null,"recipient_id"?: string,"reminder_type"?: string,"sent_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_reminders_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "calendar_events"
      referencedColumns: ["id"]
    }
                  ]
                },"capa_actions": {
                  Row: {
                    "action_type": string,"assigned_to": string | null,"capa_id": string,"completed_at": string | null,"created_at": string,"description": string,"due_date": string | null,"id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_type": string,"assigned_to"?: string | null,"capa_id": string,"completed_at"?: string | null,"created_at"?: string,"description": string,"due_date"?: string | null,"id"?: string,"status"?: string
                  }
                  Update: {
                    "action_type"?: string,"assigned_to"?: string | null,"capa_id"?: string,"completed_at"?: string | null,"created_at"?: string,"description"?: string,"due_date"?: string | null,"id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "capa_actions_capa_id_fkey"
      columns: ["capa_id"]
isOneToOne: false
      referencedRelation: "capa_records"
      referencedColumns: ["id"]
    }
                  ]
                },"capa_records": {
                  Row: {
                    "batch_id": string | null,"capa_number": string,"capa_type": string,"closed_at": string | null,"company_id": string,"control_code": string | null,"control_id": string | null,"created_at": string,"created_by": string | null,"description": string,"due_date": string | null,"id": string,"is_systemic": boolean,"owner_name": string | null,"priority": string,"root_cause": string | null,"source": string,"source_deviation_id": string | null,"source_risk_id": string | null,"status": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"capa_number": string,"capa_type": string,"closed_at"?: string | null,"company_id": string,"control_code"?: string | null,"control_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description": string,"due_date"?: string | null,"id"?: string,"is_systemic"?: boolean,"owner_name"?: string | null,"priority"?: string,"root_cause"?: string | null,"source": string,"source_deviation_id"?: string | null,"source_risk_id"?: string | null,"status"?: string,"title": string
                  }
                  Update: {
                    "batch_id"?: string | null,"capa_number"?: string,"capa_type"?: string,"closed_at"?: string | null,"company_id"?: string,"control_code"?: string | null,"control_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"due_date"?: string | null,"id"?: string,"is_systemic"?: boolean,"owner_name"?: string | null,"priority"?: string,"root_cause"?: string | null,"source"?: string,"source_deviation_id"?: string | null,"source_risk_id"?: string | null,"status"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "capa_records_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batch_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "capa_records_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "capa_records_control_id_fkey"
      columns: ["control_id"]
isOneToOne: false
      referencedRelation: "framework_controls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "capa_records_source_deviation_id_fkey"
      columns: ["source_deviation_id"]
isOneToOne: false
      referencedRelation: "deviations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "capa_records_source_risk_id_fkey"
      columns: ["source_risk_id"]
isOneToOne: false
      referencedRelation: "risks"
      referencedColumns: ["id"]
    }
                  ]
                },"certificate_of_analysis": {
                  Row: {
                    "batch_id": string,"batch_number": string | null,"coa_number": string,"company_id": string,"conformance_statement": string | null,"created_at": string | null,"created_by": string | null,"id": string,"pdf_url": string | null,"product_name": string,"qa_approved_at": string | null,"qa_approved_by": string | null,"qa_approved_by_name": string | null,"results": NonNullable<Json>,"status": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"batch_number"?: string | null,"coa_number": string,"company_id": string,"conformance_statement"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"pdf_url"?: string | null,"product_name": string,"qa_approved_at"?: string | null,"qa_approved_by"?: string | null,"qa_approved_by_name"?: string | null,"results"?: NonNullable<Json>,"status"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "batch_id"?: string,"batch_number"?: string | null,"coa_number"?: string,"company_id"?: string,"conformance_statement"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"pdf_url"?: string | null,"product_name"?: string,"qa_approved_at"?: string | null,"qa_approved_by"?: string | null,"qa_approved_by_name"?: string | null,"results"?: NonNullable<Json>,"status"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "certificate_of_analysis_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batch_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "certificate_of_analysis_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"change_controls": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"change_category": string,"change_number": string,"change_type": string,"company_id": string,"created_at": string | null,"created_by": string | null,"description": string | null,"effective_date": string | null,"id": string,"impact_assessment": string | null,"regulatory_impact": boolean | null,"rejected_reason": string | null,"status": string,"title": string,"updated_at": string | null,"validation_required": boolean | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"change_category"?: string,"change_number": string,"change_type": string,"company_id": string,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"effective_date"?: string | null,"id"?: string,"impact_assessment"?: string | null,"regulatory_impact"?: boolean | null,"rejected_reason"?: string | null,"status"?: string,"title": string,"updated_at"?: string | null,"validation_required"?: boolean | null
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"change_category"?: string,"change_number"?: string,"change_type"?: string,"company_id"?: string,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"effective_date"?: string | null,"id"?: string,"impact_assessment"?: string | null,"regulatory_impact"?: boolean | null,"rejected_reason"?: string | null,"status"?: string,"title"?: string,"updated_at"?: string | null,"validation_required"?: boolean | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "change_controls_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_channel_members": {
                  Row: {
                    "channel_id": string,"id": string,"joined_at": string | null,"last_read_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel_id": string,"id"?: string,"joined_at"?: string | null,"last_read_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "channel_id"?: string,"id"?: string,"joined_at"?: string | null,"last_read_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_channel_members_channel_id_fkey"
      columns: ["channel_id"]
isOneToOne: false
      referencedRelation: "chat_channels"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_channels": {
                  Row: {
                    "channel_type": string,"company_id": string,"created_at": string | null,"created_by": string | null,"description": string | null,"id": string,"is_archived": boolean | null,"name": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "channel_type"?: string,"company_id": string,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_archived"?: boolean | null,"name": string,"updated_at"?: string | null
                  }
                  Update: {
                    "channel_type"?: string,"company_id"?: string,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_archived"?: boolean | null,"name"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_channels_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_mentions": {
                  Row: {
                    "created_at": string | null,"id": string,"message_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"message_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"message_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_mentions_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "chat_messages"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_messages": {
                  Row: {
                    "channel_id": string,"content": string,"content_type": string,"created_at": string | null,"file_name": string | null,"file_size": number | null,"file_type": string | null,"file_url": string | null,"gif_url": string | null,"id": string,"is_deleted": boolean | null,"is_edited": boolean | null,"is_pinned": boolean | null,"parent_id": string | null,"relay_sent": boolean | null,"sender_id": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "channel_id": string,"content"?: string,"content_type"?: string,"created_at"?: string | null,"file_name"?: string | null,"file_size"?: number | null,"file_type"?: string | null,"file_url"?: string | null,"gif_url"?: string | null,"id"?: string,"is_deleted"?: boolean | null,"is_edited"?: boolean | null,"is_pinned"?: boolean | null,"parent_id"?: string | null,"relay_sent"?: boolean | null,"sender_id": string,"updated_at"?: string | null
                  }
                  Update: {
                    "channel_id"?: string,"content"?: string,"content_type"?: string,"created_at"?: string | null,"file_name"?: string | null,"file_size"?: number | null,"file_type"?: string | null,"file_url"?: string | null,"gif_url"?: string | null,"id"?: string,"is_deleted"?: boolean | null,"is_edited"?: boolean | null,"is_pinned"?: boolean | null,"parent_id"?: string | null,"relay_sent"?: boolean | null,"sender_id"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_channel_id_fkey"
      columns: ["channel_id"]
isOneToOne: false
      referencedRelation: "chat_channels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_messages_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "chat_messages"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_reactions": {
                  Row: {
                    "created_at": string | null,"emoji": string,"id": string,"message_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"emoji": string,"id"?: string,"message_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"emoji"?: string,"id"?: string,"message_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_reactions_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "chat_messages"
      referencedColumns: ["id"]
    }
                  ]
                },"claim_evidence_links": {
                  Row: {
                    "claim_id": string,"evidence_type": string,"id": string,"linked_at": string,"reference_title": string,"reference_url": string | null,"strength": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "claim_id": string,"evidence_type": string,"id"?: string,"linked_at"?: string,"reference_title": string,"reference_url"?: string | null,"strength"?: string | null
                  }
                  Update: {
                    "claim_id"?: string,"evidence_type"?: string,"id"?: string,"linked_at"?: string,"reference_title"?: string,"reference_url"?: string | null,"strength"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "claim_evidence_links_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "extracted_claims"
      referencedColumns: ["id"]
    }
                  ]
                },"cn_declarations": {
                  Row: {
                    "company_id": string,"contents_description": string,"created_at": string,"created_by": string | null,"declaration_type": string,"flag_reason": string | null,"id": string,"is_flagged": boolean,"items": NonNullable<Json>,"reason_for_export": string,"recipient_address": string | null,"recipient_name": string,"sender_address": string | null,"sender_name": string,"shipment_id": string | null,"shipment_ref": string,"total_value_gbp": number,"total_weight_kg": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"contents_description": string,"created_at"?: string,"created_by"?: string | null,"declaration_type": string,"flag_reason"?: string | null,"id"?: string,"is_flagged"?: boolean,"items"?: NonNullable<Json>,"reason_for_export": string,"recipient_address"?: string | null,"recipient_name": string,"sender_address"?: string | null,"sender_name": string,"shipment_id"?: string | null,"shipment_ref": string,"total_value_gbp"?: number,"total_weight_kg"?: number
                  }
                  Update: {
                    "company_id"?: string,"contents_description"?: string,"created_at"?: string,"created_by"?: string | null,"declaration_type"?: string,"flag_reason"?: string | null,"id"?: string,"is_flagged"?: boolean,"items"?: NonNullable<Json>,"reason_for_export"?: string,"recipient_address"?: string | null,"recipient_name"?: string,"sender_address"?: string | null,"sender_name"?: string,"shipment_id"?: string | null,"shipment_ref"?: string,"total_value_gbp"?: number,"total_weight_kg"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "cn_declarations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cn_declarations_shipment_id_fkey"
      columns: ["shipment_id"]
isOneToOne: false
      referencedRelation: "shipments"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "cac_registration_number": string | null,"country": string | null,"created_at": string | null,"head_office_address": string | null,"id": string,"logo_url": string | null,"name": string,"phone": string | null,"product_categories": (string)[],"trading_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cac_registration_number"?: string | null,"country"?: string | null,"created_at"?: string | null,"head_office_address"?: string | null,"id"?: string,"logo_url"?: string | null,"name": string,"phone"?: string | null,"product_categories"?: (string)[],"trading_name"?: string | null
                  }
                  Update: {
                    "cac_registration_number"?: string | null,"country"?: string | null,"created_at"?: string | null,"head_office_address"?: string | null,"id"?: string,"logo_url"?: string | null,"name"?: string,"phone"?: string | null,"product_categories"?: (string)[],"trading_name"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"company_invites": {
                  Row: {
                    "accepted_at": string | null,"company_id": string,"created_at": string,"created_by": string | null,"department_id": string | null,"email": string,"expires_at": string,"id": string,"job_title": string | null,"module_access": (string)[],"revoked_at": string | null,"role": string,"signs_applications": boolean,"site_ids": (string)[],"token": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"department_id"?: string | null,"email": string,"expires_at"?: string,"id"?: string,"job_title"?: string | null,"module_access"?: (string)[],"revoked_at"?: string | null,"role"?: string,"signs_applications"?: boolean,"site_ids"?: (string)[],"token"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"department_id"?: string | null,"email"?: string,"expires_at"?: string,"id"?: string,"job_title"?: string | null,"module_access"?: (string)[],"revoked_at"?: string | null,"role"?: string,"signs_applications"?: boolean,"site_ids"?: (string)[],"token"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"company_members": {
                  Row: {
                    "company_id": string,"department_id": string | null,"id": string,"job_title": string | null,"joined_at": string,"module_access": (string)[],"onboarding_areas": (string)[],"role": string,"site_ids": (string)[],"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"department_id"?: string | null,"id"?: string,"job_title"?: string | null,"joined_at"?: string,"module_access"?: (string)[],"onboarding_areas"?: (string)[],"role"?: string,"site_ids"?: (string)[],"status"?: string,"user_id": string
                  }
                  Update: {
                    "company_id"?: string,"department_id"?: string | null,"id"?: string,"job_title"?: string | null,"joined_at"?: string,"module_access"?: (string)[],"onboarding_areas"?: (string)[],"role"?: string,"site_ids"?: (string)[],"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_members_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    }
                  ]
                },"company_numbering_formats": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"next_seq": number,"pattern": string,"prefix": string | null,"scope": string,"seq_period": string | null,"seq_reset": string,"seq_width": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"next_seq"?: number,"pattern": string,"prefix"?: string | null,"scope": string,"seq_period"?: string | null,"seq_reset"?: string,"seq_width"?: number,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"next_seq"?: number,"pattern"?: string,"prefix"?: string | null,"scope"?: string,"seq_period"?: string | null,"seq_reset"?: string,"seq_width"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_numbering_formats_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"company_rca_settings": {
                  Row: {
                    "company_id": string,"default_framework": string,"undetermined_blocks_release": boolean,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"default_framework"?: string,"undetermined_blocks_release"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"default_framework"?: string,"undetermined_blocks_release"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_rca_settings_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"company_risk_posture": {
                  Row: {
                    "audit_signal_score": number,"automation_signal_score": number,"company_id": string,"control_signal_score": number,"critical_risks_count": number,"high_risks_count": number,"highest_risk_level": string,"low_risks_count": number,"medium_risks_count": number,"open_risks_count": number,"policy_signal_score": number,"posture_score": number,"updated_at": string,"vendor_signal_score": number
                  }
                  ComputedFields: never
                  Insert: {
                    "audit_signal_score"?: number,"automation_signal_score"?: number,"company_id": string,"control_signal_score"?: number,"critical_risks_count"?: number,"high_risks_count"?: number,"highest_risk_level"?: string,"low_risks_count"?: number,"medium_risks_count"?: number,"open_risks_count"?: number,"policy_signal_score"?: number,"posture_score"?: number,"updated_at"?: string,"vendor_signal_score"?: number
                  }
                  Update: {
                    "audit_signal_score"?: number,"automation_signal_score"?: number,"company_id"?: string,"control_signal_score"?: number,"critical_risks_count"?: number,"high_risks_count"?: number,"highest_risk_level"?: string,"low_risks_count"?: number,"medium_risks_count"?: number,"open_risks_count"?: number,"policy_signal_score"?: number,"posture_score"?: number,"updated_at"?: string,"vendor_signal_score"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_company_risk_posture_company"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"company_settings": {
                  Row: {
                    "brand_color": string | null,"company_id": string,"created_at": string,"logo_url": string | null,"name": string | null,"project_name": string | null,"regulatory_body_access": string | null,"tagline": string | null,"updated_at": string,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_color"?: string | null,"company_id": string,"created_at"?: string,"logo_url"?: string | null,"name"?: string | null,"project_name"?: string | null,"regulatory_body_access"?: string | null,"tagline"?: string | null,"updated_at"?: string,"website_url"?: string | null
                  }
                  Update: {
                    "brand_color"?: string | null,"company_id"?: string,"created_at"?: string,"logo_url"?: string | null,"name"?: string | null,"project_name"?: string | null,"regulatory_body_access"?: string | null,"tagline"?: string | null,"updated_at"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"compliance_alert_log": {
                  Row: {
                    "alert_type": string,"company_id": string,"entity_id": string | null,"entity_type": string,"fired_at": string,"fired_date": string,"id": string,"message": string,"metadata": Json | null,"resolved_at": string | null,"rule_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alert_type": string,"company_id": string,"entity_id"?: string | null,"entity_type": string,"fired_at"?: string,"fired_date"?: string,"id"?: string,"message": string,"metadata"?: Json | null,"resolved_at"?: string | null,"rule_id"?: string | null
                  }
                  Update: {
                    "alert_type"?: string,"company_id"?: string,"entity_id"?: string | null,"entity_type"?: string,"fired_at"?: string,"fired_date"?: string,"id"?: string,"message"?: string,"metadata"?: Json | null,"resolved_at"?: string | null,"rule_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "compliance_alert_log_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compliance_alert_log_rule_id_fkey"
      columns: ["rule_id"]
isOneToOne: false
      referencedRelation: "compliance_alert_rules"
      referencedColumns: ["id"]
    }
                  ]
                },"compliance_alert_rules": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"escalation_days": number,"id": string,"is_active": boolean,"notify_admins": boolean,"notify_email": boolean,"notify_in_app": boolean,"notify_owner": boolean,"threshold_days": number,"trigger_type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"escalation_days"?: number,"id"?: string,"is_active"?: boolean,"notify_admins"?: boolean,"notify_email"?: boolean,"notify_in_app"?: boolean,"notify_owner"?: boolean,"threshold_days"?: number,"trigger_type": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"escalation_days"?: number,"id"?: string,"is_active"?: boolean,"notify_admins"?: boolean,"notify_email"?: boolean,"notify_in_app"?: boolean,"notify_owner"?: boolean,"threshold_days"?: number,"trigger_type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "compliance_alert_rules_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"compliance_benchmarks": {
                  Row: {
                    "avg_risk_score": number,"category_scores": NonNullable<Json>,"company_id": string,"compliant_count": number,"created_at": string,"id": string,"industry_type": string | null,"last_calculated": string,"percentile_rank": number | null,"total_submissions": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avg_risk_score"?: number,"category_scores"?: NonNullable<Json>,"company_id": string,"compliant_count"?: number,"created_at"?: string,"id"?: string,"industry_type"?: string | null,"last_calculated"?: string,"percentile_rank"?: number | null,"total_submissions"?: number,"updated_at"?: string
                  }
                  Update: {
                    "avg_risk_score"?: number,"category_scores"?: NonNullable<Json>,"company_id"?: string,"compliant_count"?: number,"created_at"?: string,"id"?: string,"industry_type"?: string | null,"last_calculated"?: string,"percentile_rank"?: number | null,"total_submissions"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "compliance_benchmarks_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"compliance_reports": {
                  Row: {
                    "analysis_timestamp": string | null,"content_id": string,"created_at": string | null,"flagged_phrases": Json | null,"id": string,"issues": Json | null,"jurisdiction": string,"overall_risk": string,"regulation_version": string,"strictness_level": string,"suggested_rewrites": Json | null,"violated_regulations": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_timestamp"?: string | null,"content_id": string,"created_at"?: string | null,"flagged_phrases"?: Json | null,"id"?: string,"issues"?: Json | null,"jurisdiction"?: string,"overall_risk": string,"regulation_version": string,"strictness_level": string,"suggested_rewrites"?: Json | null,"violated_regulations"?: Json | null
                  }
                  Update: {
                    "analysis_timestamp"?: string | null,"content_id"?: string,"created_at"?: string | null,"flagged_phrases"?: Json | null,"id"?: string,"issues"?: Json | null,"jurisdiction"?: string,"overall_risk"?: string,"regulation_version"?: string,"strictness_level"?: string,"suggested_rewrites"?: Json | null,"violated_regulations"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "compliance_reports_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"consent_content_links": {
                  Row: {
                    "company_id": string,"consent_id": string,"content_id": string,"id": string,"linked_at": string,"linked_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"consent_id": string,"content_id": string,"id"?: string,"linked_at"?: string,"linked_by"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"consent_id"?: string,"content_id"?: string,"id"?: string,"linked_at"?: string,"linked_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "consent_content_links_consent_id_fkey"
      columns: ["consent_id"]
isOneToOne: false
      referencedRelation: "patient_consents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consent_content_links_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"content_blocks": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"block_name": string,"block_type": string,"company_id": string,"content_text": string,"created_at": string,"created_by": string | null,"id": string,"is_locked": boolean,"jurisdiction": string | null,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"block_name": string,"block_type": string,"company_id": string,"content_text": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_locked"?: boolean,"jurisdiction"?: string | null,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"block_name"?: string,"block_type"?: string,"company_id"?: string,"content_text"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_locked"?: boolean,"jurisdiction"?: string | null,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"content_folders": {
                  Row: {
                    "created_at": string | null,"description": string | null,"id": string,"name": string,"parent_folder_id": string | null,"updated_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"description"?: string | null,"id"?: string,"name": string,"parent_folder_id"?: string | null,"updated_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"description"?: string | null,"id"?: string,"name"?: string,"parent_folder_id"?: string | null,"updated_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_folders_parent_folder_id_fkey"
      columns: ["parent_folder_id"]
isOneToOne: false
      referencedRelation: "content_folders"
      referencedColumns: ["id"]
    }
                  ]
                },"content_submissions": {
                  Row: {
                    "ai_risk_score": number | null,"ai_risk_summary": string | null,"approval_expires_at": string | null,"brand_id": string | null,"company_id": string | null,"content_text": string,"content_topic": string,"created_at": string | null,"current_version_number": number | null,"deleted_at": string | null,"deleted_by": string | null,"department": string | null,"file_name": string,"file_type": string,"folder_id": string | null,"id": string,"is_deleted": boolean | null,"is_locked": boolean | null,"jurisdiction": string,"legal_decided_at": string | null,"legal_decided_by": string | null,"locked_at": string | null,"locked_by": string | null,"platform": string,"priority": string | null,"published_at": string | null,"published_by": string | null,"scheduled_date": string | null,"signoff_status": string | null,"sla_deadline_at": string | null,"status": string | null,"submitted_for_legal_at": string | null,"target_audience": string,"title": string,"updated_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_risk_score"?: number | null,"ai_risk_summary"?: string | null,"approval_expires_at"?: string | null,"brand_id"?: string | null,"company_id"?: string | null,"content_text": string,"content_topic": string,"created_at"?: string | null,"current_version_number"?: number | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"department"?: string | null,"file_name": string,"file_type": string,"folder_id"?: string | null,"id"?: string,"is_deleted"?: boolean | null,"is_locked"?: boolean | null,"jurisdiction"?: string,"legal_decided_at"?: string | null,"legal_decided_by"?: string | null,"locked_at"?: string | null,"locked_by"?: string | null,"platform": string,"priority"?: string | null,"published_at"?: string | null,"published_by"?: string | null,"scheduled_date"?: string | null,"signoff_status"?: string | null,"sla_deadline_at"?: string | null,"status"?: string | null,"submitted_for_legal_at"?: string | null,"target_audience": string,"title": string,"updated_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "ai_risk_score"?: number | null,"ai_risk_summary"?: string | null,"approval_expires_at"?: string | null,"brand_id"?: string | null,"company_id"?: string | null,"content_text"?: string,"content_topic"?: string,"created_at"?: string | null,"current_version_number"?: number | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"department"?: string | null,"file_name"?: string,"file_type"?: string,"folder_id"?: string | null,"id"?: string,"is_deleted"?: boolean | null,"is_locked"?: boolean | null,"jurisdiction"?: string,"legal_decided_at"?: string | null,"legal_decided_by"?: string | null,"locked_at"?: string | null,"locked_by"?: string | null,"platform"?: string,"priority"?: string | null,"published_at"?: string | null,"published_by"?: string | null,"scheduled_date"?: string | null,"signoff_status"?: string | null,"sla_deadline_at"?: string | null,"status"?: string | null,"submitted_for_legal_at"?: string | null,"target_audience"?: string,"title"?: string,"updated_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_submissions_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_submissions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_submissions_folder_id_fkey"
      columns: ["folder_id"]
isOneToOne: false
      referencedRelation: "content_folders"
      referencedColumns: ["id"]
    }
                  ]
                },"content_versions": {
                  Row: {
                    "content_text": string,"corrected_text": string | null,"created_at": string,"id": string,"snapshot_by": string,"submission_id": string,"version_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "content_text"?: string,"corrected_text"?: string | null,"created_at"?: string,"id"?: string,"snapshot_by": string,"submission_id": string,"version_number"?: number
                  }
                  Update: {
                    "content_text"?: string,"corrected_text"?: string | null,"created_at"?: string,"id"?: string,"snapshot_by"?: string,"submission_id"?: string,"version_number"?: number
                  }
                  Relationships: [
                    
                  ]
                },"contraband_rejection_log": {
                  Row: {
                    "company_id": string,"created_at": string,"customer_email": string | null,"customer_flagged": boolean,"customer_name": string | null,"customer_phone": string | null,"description": string | null,"id": string,"items_found": (string)[],"rejection_date": string,"rejection_reason": string,"reporter_id": string | null,"shipment_ref": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"customer_email"?: string | null,"customer_flagged"?: boolean,"customer_name"?: string | null,"customer_phone"?: string | null,"description"?: string | null,"id"?: string,"items_found"?: (string)[],"rejection_date"?: string,"rejection_reason": string,"reporter_id"?: string | null,"shipment_ref": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"customer_email"?: string | null,"customer_flagged"?: boolean,"customer_name"?: string | null,"customer_phone"?: string | null,"description"?: string | null,"id"?: string,"items_found"?: (string)[],"rejection_date"?: string,"rejection_reason"?: string,"reporter_id"?: string | null,"shipment_ref"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contraband_rejection_log_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"control_cross_mappings": {
                  Row: {
                    "created_at": string,"id": string,"mapping_type": string,"notes": string | null,"source_control_id": string,"target_control_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"mapping_type": string,"notes"?: string | null,"source_control_id": string,"target_control_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"mapping_type"?: string,"notes"?: string | null,"source_control_id"?: string,"target_control_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "control_cross_mappings_source_control_id_fkey"
      columns: ["source_control_id"]
isOneToOne: false
      referencedRelation: "framework_controls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_cross_mappings_target_control_id_fkey"
      columns: ["target_control_id"]
isOneToOne: false
      referencedRelation: "framework_controls"
      referencedColumns: ["id"]
    }
                  ]
                },"correlation_events": {
                  Row: {
                    "company_id": string,"created_at": string,"description": string,"id": string,"linked_risk_id": string | null,"metadata": Json | null,"rule_id": string | null,"severity": string,"status": string,"triggered_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"description": string,"id"?: string,"linked_risk_id"?: string | null,"metadata"?: Json | null,"rule_id"?: string | null,"severity": string,"status"?: string,"triggered_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"description"?: string,"id"?: string,"linked_risk_id"?: string | null,"metadata"?: Json | null,"rule_id"?: string | null,"severity"?: string,"status"?: string,"triggered_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "correlation_events_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "correlation_events_linked_risk_id_fkey"
      columns: ["linked_risk_id"]
isOneToOne: false
      referencedRelation: "risks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "correlation_events_rule_id_fkey"
      columns: ["rule_id"]
isOneToOne: false
      referencedRelation: "correlation_rules"
      referencedColumns: ["id"]
    }
                  ]
                },"correlation_rules": {
                  Row: {
                    "company_id": string,"created_at": string,"description": string | null,"id": string,"risk_impact": string,"rule_name": string,"severity": string,"signal_conditions": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"description"?: string | null,"id"?: string,"risk_impact": string,"rule_name": string,"severity": string,"signal_conditions": NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"risk_impact"?: string,"rule_name"?: string,"severity"?: string,"signal_conditions"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "correlation_rules_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"crisis_affected_materials": {
                  Row: {
                    "channel": string,"crisis_id": string,"id": string,"status": string,"title": string,"withdrawn_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": string,"crisis_id": string,"id"?: string,"status"?: string,"title": string,"withdrawn_at"?: string | null
                  }
                  Update: {
                    "channel"?: string,"crisis_id"?: string,"id"?: string,"status"?: string,"title"?: string,"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "crisis_affected_materials_crisis_id_fkey"
      columns: ["crisis_id"]
isOneToOne: false
      referencedRelation: "crisis_events"
      referencedColumns: ["id"]
    }
                  ]
                },"crisis_events": {
                  Row: {
                    "affected_channels": (string)[] | null,"affected_content_count": number | null,"company_id": string,"description": string | null,"id": string,"level": string,"product": string,"resolved_at": string | null,"status": string,"title": string,"triggered_at": string,"triggered_by": string | null,"withdrawn_count": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "affected_channels"?: (string)[] | null,"affected_content_count"?: number | null,"company_id": string,"description"?: string | null,"id"?: string,"level"?: string,"product": string,"resolved_at"?: string | null,"status"?: string,"title": string,"triggered_at"?: string,"triggered_by"?: string | null,"withdrawn_count"?: number | null
                  }
                  Update: {
                    "affected_channels"?: (string)[] | null,"affected_content_count"?: number | null,"company_id"?: string,"description"?: string | null,"id"?: string,"level"?: string,"product"?: string,"resolved_at"?: string | null,"status"?: string,"title"?: string,"triggered_at"?: string,"triggered_by"?: string | null,"withdrawn_count"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "crisis_events_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"crisis_timeline_entries": {
                  Row: {
                    "action": string,"automated": boolean | null,"created_at": string,"crisis_id": string,"details": string | null,"id": string,"performer": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"automated"?: boolean | null,"created_at"?: string,"crisis_id": string,"details"?: string | null,"id"?: string,"performer": string
                  }
                  Update: {
                    "action"?: string,"automated"?: boolean | null,"created_at"?: string,"crisis_id"?: string,"details"?: string | null,"id"?: string,"performer"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "crisis_timeline_entries_crisis_id_fkey"
      columns: ["crisis_id"]
isOneToOne: false
      referencedRelation: "crisis_events"
      referencedColumns: ["id"]
    }
                  ]
                },"ctd_documents": {
                  Row: {
                    "company_id": string,"document_name": string,"dossier_id": string,"file_url": string | null,"id": string,"is_required": boolean,"module_number": number,"notes": string | null,"status": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"document_name": string,"dossier_id": string,"file_url"?: string | null,"id"?: string,"is_required"?: boolean,"module_number": number,"notes"?: string | null,"status"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"document_name"?: string,"dossier_id"?: string,"file_url"?: string | null,"id"?: string,"is_required"?: boolean,"module_number"?: number,"notes"?: string | null,"status"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ctd_documents_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "ctd_dossiers"
      referencedColumns: ["id"]
    }
                  ]
                },"ctd_dossiers": {
                  Row: {
                    "active_ingredient": string | null,"application_type": string,"company_id": string,"created_at": string | null,"created_by": string | null,"dosage_form": string,"dossier_reference": string | null,"expected_approval_date": string | null,"id": string,"nafdac_number": string | null,"notes": string | null,"product_id": string | null,"product_name": string,"screening_clearance_date": string | null,"screening_date": string | null,"status": string,"strength": string | null,"submission_date": string | null,"target_submission_date": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active_ingredient"?: string | null,"application_type"?: string,"company_id": string,"created_at"?: string | null,"created_by"?: string | null,"dosage_form": string,"dossier_reference"?: string | null,"expected_approval_date"?: string | null,"id"?: string,"nafdac_number"?: string | null,"notes"?: string | null,"product_id"?: string | null,"product_name": string,"screening_clearance_date"?: string | null,"screening_date"?: string | null,"status"?: string,"strength"?: string | null,"submission_date"?: string | null,"target_submission_date"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "active_ingredient"?: string | null,"application_type"?: string,"company_id"?: string,"created_at"?: string | null,"created_by"?: string | null,"dosage_form"?: string,"dossier_reference"?: string | null,"expected_approval_date"?: string | null,"id"?: string,"nafdac_number"?: string | null,"notes"?: string | null,"product_id"?: string | null,"product_name"?: string,"screening_clearance_date"?: string | null,"screening_date"?: string | null,"status"?: string,"strength"?: string | null,"submission_date"?: string | null,"target_submission_date"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ctd_dossiers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ctd_dossiers_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"ctd_module_progress": {
                  Row: {
                    "company_id": string,"completion_pct": number,"dossier_id": string,"id": string,"module_number": number,"notes": string | null,"status": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"completion_pct"?: number,"dossier_id": string,"id"?: string,"module_number": number,"notes"?: string | null,"status"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"completion_pct"?: number,"dossier_id"?: string,"id"?: string,"module_number"?: number,"notes"?: string | null,"status"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ctd_module_progress_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "ctd_dossiers"
      referencedColumns: ["id"]
    }
                  ]
                },"custom_roles": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"is_system": boolean,"name": string,"permissions": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_system"?: boolean,"name": string,"permissions"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_system"?: boolean,"name"?: string,"permissions"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"customer_flags": {
                  Row: {
                    "company_id": string,"created_at": string,"customer_name": string,"flag_reason": string,"flag_type": string,"flagged_by": string | null,"id": string,"identifier_type": string,"identifier_value": string,"related_rejection_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"customer_name": string,"flag_reason": string,"flag_type"?: string,"flagged_by"?: string | null,"id"?: string,"identifier_type": string,"identifier_value": string,"related_rejection_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"customer_name"?: string,"flag_reason"?: string,"flag_type"?: string,"flagged_by"?: string | null,"id"?: string,"identifier_type"?: string,"identifier_value"?: string,"related_rejection_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_flags_flagged_by_fkey"
      columns: ["flagged_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_flags_related_rejection_id_fkey"
      columns: ["related_rejection_id"]
isOneToOne: false
      referencedRelation: "contraband_rejection_log"
      referencedColumns: ["id"]
    }
                  ]
                },"deletion_requests": {
                  Row: {
                    "company_id": string | null,"created_at": string,"id": string,"reason": string | null,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"created_at"?: string,"id"?: string,"reason"?: string | null,"status"?: string,"user_id": string
                  }
                  Update: {
                    "company_id"?: string | null,"created_at"?: string,"id"?: string,"reason"?: string | null,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"departments": {
                  Row: {
                    "code": string | null,"company_id": string,"created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code"?: string | null,"company_id": string,"created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "code"?: string | null,"company_id"?: string,"created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"deviation_counters": {
                  Row: {
                    "company_id": string,"last_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"last_number"?: number
                  }
                  Update: {
                    "company_id"?: string,"last_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "deviation_counters_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"deviation_links": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"deviation_id": string,"id": string,"linked_id": string,"linked_type": string,"note": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"deviation_id": string,"id"?: string,"linked_id": string,"linked_type": string,"note"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deviation_id"?: string,"id"?: string,"linked_id"?: string,"linked_type"?: string,"note"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "deviation_links_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deviation_links_deviation_id_fkey"
      columns: ["deviation_id"]
isOneToOne: false
      referencedRelation: "deviations"
      referencedColumns: ["id"]
    }
                  ]
                },"deviations": {
                  Row: {
                    "closed_at": string | null,"company_id": string,"containment": string | null,"description": string | null,"deviation_number": string,"entry_point": string,"id": string,"immediate_action": string | null,"investigation_due_date": string | null,"investigation_owner": string | null,"product_quality_impact": string,"raised_at": string,"raised_by": string | null,"severity": string,"source_id": string | null,"source_type": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"company_id": string,"containment"?: string | null,"description"?: string | null,"deviation_number": string,"entry_point"?: string,"id"?: string,"immediate_action"?: string | null,"investigation_due_date"?: string | null,"investigation_owner"?: string | null,"product_quality_impact": string,"raised_at"?: string,"raised_by"?: string | null,"severity": string,"source_id"?: string | null,"source_type": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "closed_at"?: string | null,"company_id"?: string,"containment"?: string | null,"description"?: string | null,"deviation_number"?: string,"entry_point"?: string,"id"?: string,"immediate_action"?: string | null,"investigation_due_date"?: string | null,"investigation_owner"?: string | null,"product_quality_impact"?: string,"raised_at"?: string,"raised_by"?: string | null,"severity"?: string,"source_id"?: string | null,"source_type"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deviations_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"dispensing_records": {
                  Row: {
                    "actual_quantity": number,"authorisation_reason": string | null,"authorisation_signature_id": string | null,"authorised_by": string | null,"balance_identifier": string,"batch_id": string,"batch_stage_id": string | null,"company_id": string,"created_at": string,"dispense_signature_id": string | null,"dispensed_at": string,"dispensed_by": string,"formula_material_id": string | null,"id": string,"instrument_id": string | null,"internal_lot_number": string,"material_id": string,"material_lot_id": string,"notes": string | null,"required_quantity": number,"tolerance_exception": boolean,"unit": string,"updated_at": string,"verified_at": string | null,"verified_by": string | null,"verify_signature_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_quantity": number,"authorisation_reason"?: string | null,"authorisation_signature_id"?: string | null,"authorised_by"?: string | null,"balance_identifier": string,"batch_id": string,"batch_stage_id"?: string | null,"company_id": string,"created_at"?: string,"dispense_signature_id"?: string | null,"dispensed_at"?: string,"dispensed_by": string,"formula_material_id"?: string | null,"id"?: string,"instrument_id"?: string | null,"internal_lot_number": string,"material_id": string,"material_lot_id": string,"notes"?: string | null,"required_quantity": number,"tolerance_exception"?: boolean,"unit": string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null,"verify_signature_id"?: string | null
                  }
                  Update: {
                    "actual_quantity"?: number,"authorisation_reason"?: string | null,"authorisation_signature_id"?: string | null,"authorised_by"?: string | null,"balance_identifier"?: string,"batch_id"?: string,"batch_stage_id"?: string | null,"company_id"?: string,"created_at"?: string,"dispense_signature_id"?: string | null,"dispensed_at"?: string,"dispensed_by"?: string,"formula_material_id"?: string | null,"id"?: string,"instrument_id"?: string | null,"internal_lot_number"?: string,"material_id"?: string,"material_lot_id"?: string,"notes"?: string | null,"required_quantity"?: number,"tolerance_exception"?: boolean,"unit"?: string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null,"verify_signature_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "dispensing_records_authorisation_signature_id_fkey"
      columns: ["authorisation_signature_id"]
isOneToOne: false
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispensing_records_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batch_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispensing_records_batch_stage_id_fkey"
      columns: ["batch_stage_id"]
isOneToOne: false
      referencedRelation: "batch_stages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispensing_records_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispensing_records_dispense_signature_id_fkey"
      columns: ["dispense_signature_id"]
isOneToOne: false
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispensing_records_formula_material_id_fkey"
      columns: ["formula_material_id"]
isOneToOne: false
      referencedRelation: "master_formula_materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispensing_records_instrument_id_fkey"
      columns: ["instrument_id"]
isOneToOne: false
      referencedRelation: "instruments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispensing_records_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispensing_records_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispensing_records_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots_conditionally_released"
      referencedColumns: ["material_lot_id"]
    },{
      foreignKeyName: "dispensing_records_verify_signature_id_fkey"
      columns: ["verify_signature_id"]
isOneToOne: false
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    }
                  ]
                },"document_tags": {
                  Row: {
                    "content_id": string,"created_at": string | null,"id": string,"tag_name": string,"tag_type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"created_at"?: string | null,"id"?: string,"tag_name": string,"tag_type"?: string,"user_id": string
                  }
                  Update: {
                    "content_id"?: string,"created_at"?: string | null,"id"?: string,"tag_name"?: string,"tag_type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_tags_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"drift_alerts": {
                  Row: {
                    "approved_hash": string | null,"channel_id": string,"company_id": string,"current_hash": string | null,"detected_at": string,"diff_summary": string | null,"drift_type": string,"id": string,"resolved": boolean,"resolved_at": string | null,"resolved_by": string | null,"severity": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_hash"?: string | null,"channel_id": string,"company_id": string,"current_hash"?: string | null,"detected_at"?: string,"diff_summary"?: string | null,"drift_type"?: string,"id"?: string,"resolved"?: boolean,"resolved_at"?: string | null,"resolved_by"?: string | null,"severity"?: string
                  }
                  Update: {
                    "approved_hash"?: string | null,"channel_id"?: string,"company_id"?: string,"current_hash"?: string | null,"detected_at"?: string,"diff_summary"?: string | null,"drift_type"?: string,"id"?: string,"resolved"?: boolean,"resolved_at"?: string | null,"resolved_by"?: string | null,"severity"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "drift_alerts_channel_id_fkey"
      columns: ["channel_id"]
isOneToOne: false
      referencedRelation: "monitored_channels"
      referencedColumns: ["id"]
    }
                  ]
                },"electronic_signature_attempts": {
                  Row: {
                    "action": string | null,"company_id": string | null,"created_at": string,"detail": string | null,"entity_id": string | null,"entity_type": string | null,"id": string,"outcome": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action"?: string | null,"company_id"?: string | null,"created_at"?: string,"detail"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"outcome": string,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string | null,"company_id"?: string | null,"created_at"?: string,"detail"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"outcome"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"electronic_signature_consumptions": {
                  Row: {
                    "consumed_at": string,"history_id": string,"signature_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consumed_at"?: string,"history_id": string,"signature_id": string
                  }
                  Update: {
                    "consumed_at"?: string,"history_id"?: string,"signature_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "electronic_signature_consumptions_history_id_fkey"
      columns: ["history_id"]
isOneToOne: false
      referencedRelation: "entity_state_history"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "electronic_signature_consumptions_signature_id_fkey"
      columns: ["signature_id"]
isOneToOne: true
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    }
                  ]
                },"electronic_signatures": {
                  Row: {
                    "action": string,"company_id": string,"created_at": string,"definition_id": string | null,"entity_id": string,"entity_type": string,"hash_convention": string,"id": string,"meaning": string,"metadata": NonNullable<Json>,"reason": string | null,"record_hash": string,"signed_at": string,"signed_state": string,"signer_email": string,"signer_id": string,"signer_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"company_id": string,"created_at"?: string,"definition_id"?: string | null,"entity_id": string,"entity_type": string,"hash_convention"?: string,"id"?: string,"meaning": string,"metadata"?: NonNullable<Json>,"reason"?: string | null,"record_hash": string,"signed_at"?: string,"signed_state": string,"signer_email": string,"signer_id": string,"signer_name": string
                  }
                  Update: {
                    "action"?: string,"company_id"?: string,"created_at"?: string,"definition_id"?: string | null,"entity_id"?: string,"entity_type"?: string,"hash_convention"?: string,"id"?: string,"meaning"?: string,"metadata"?: NonNullable<Json>,"reason"?: string | null,"record_hash"?: string,"signed_at"?: string,"signed_state"?: string,"signer_email"?: string,"signer_id"?: string,"signer_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "electronic_signatures_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "electronic_signatures_definition_id_fkey"
      columns: ["definition_id"]
isOneToOne: false
      referencedRelation: "lifecycle_definitions"
      referencedColumns: ["id"]
    }
                  ]
                },"entity_current_state": {
                  Row: {
                    "company_id": string,"definition_id": string,"entered_at": string,"entered_by": string | null,"entity_id": string,"entity_type": string,"id": string,"state_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"definition_id": string,"entered_at"?: string,"entered_by"?: string | null,"entity_id": string,"entity_type": string,"id"?: string,"state_id": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"definition_id"?: string,"entered_at"?: string,"entered_by"?: string | null,"entity_id"?: string,"entity_type"?: string,"id"?: string,"state_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entity_current_state_company_fk"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entity_current_state_definition_id_fkey"
      columns: ["definition_id"]
isOneToOne: false
      referencedRelation: "lifecycle_definitions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entity_current_state_state_id_fkey"
      columns: ["state_id"]
isOneToOne: false
      referencedRelation: "lifecycle_states"
      referencedColumns: ["id"]
    }
                  ]
                },"entity_state_history": {
                  Row: {
                    "actor_id": string | null,"comment": string | null,"company_id": string,"created_at": string,"definition_id": string,"entity_id": string,"entity_type": string,"from_state_id": string | null,"id": string,"metadata": NonNullable<Json>,"to_state_id": string,"transition_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"comment"?: string | null,"company_id": string,"created_at"?: string,"definition_id": string,"entity_id": string,"entity_type": string,"from_state_id"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"to_state_id": string,"transition_id"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"comment"?: string | null,"company_id"?: string,"created_at"?: string,"definition_id"?: string,"entity_id"?: string,"entity_type"?: string,"from_state_id"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"to_state_id"?: string,"transition_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "entity_state_history_company_fk"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entity_state_history_definition_id_fkey"
      columns: ["definition_id"]
isOneToOne: false
      referencedRelation: "lifecycle_definitions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entity_state_history_from_state_id_fkey"
      columns: ["from_state_id"]
isOneToOne: false
      referencedRelation: "lifecycle_states"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entity_state_history_to_state_id_fkey"
      columns: ["to_state_id"]
isOneToOne: false
      referencedRelation: "lifecycle_states"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entity_state_history_transition_id_fkey"
      columns: ["transition_id"]
isOneToOne: false
      referencedRelation: "lifecycle_transitions"
      referencedColumns: ["id"]
    }
                  ]
                },"external_evidence_ingestions": {
                  Row: {
                    "company_id": string,"created_at": string,"error_message": string | null,"id": string,"metadata": NonNullable<Json>,"processed_at": string | null,"related_audit_request_id": string | null,"related_control_id": string | null,"requested_by": string | null,"source_name": string,"source_type": string,"status": string,"submission_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"error_message"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"processed_at"?: string | null,"related_audit_request_id"?: string | null,"related_control_id"?: string | null,"requested_by"?: string | null,"source_name": string,"source_type": string,"status"?: string,"submission_id"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"error_message"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"processed_at"?: string | null,"related_audit_request_id"?: string | null,"related_control_id"?: string | null,"requested_by"?: string | null,"source_name"?: string,"source_type"?: string,"status"?: string,"submission_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "external_evidence_ingestions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_evidence_ingestions_related_audit_request_id_fkey"
      columns: ["related_audit_request_id"]
isOneToOne: false
      referencedRelation: "audit_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_evidence_ingestions_related_control_id_fkey"
      columns: ["related_control_id"]
isOneToOne: false
      referencedRelation: "grc_controls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_evidence_ingestions_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_evidence_ingestions_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "content_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"extracted_claims": {
                  Row: {
                    "claim_text": string,"claim_type": string,"company_id": string,"confidence": number | null,"extracted_at": string,"extracted_by": string | null,"has_evidence": boolean | null,"id": string,"source_document": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "claim_text": string,"claim_type": string,"company_id": string,"confidence"?: number | null,"extracted_at"?: string,"extracted_by"?: string | null,"has_evidence"?: boolean | null,"id"?: string,"source_document": string,"status"?: string
                  }
                  Update: {
                    "claim_text"?: string,"claim_type"?: string,"company_id"?: string,"confidence"?: number | null,"extracted_at"?: string,"extracted_by"?: string | null,"has_evidence"?: boolean | null,"id"?: string,"source_document"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "extracted_claims_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"framework_control_config": {
                  Row: {
                    "company_id": string,"control_id": string,"id": string,"is_applicable": boolean,"notes": string | null,"owner_id": string | null,"test_interval_days": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"control_id": string,"id"?: string,"is_applicable"?: boolean,"notes"?: string | null,"owner_id"?: string | null,"test_interval_days"?: number,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"control_id"?: string,"id"?: string,"is_applicable"?: boolean,"notes"?: string | null,"owner_id"?: string | null,"test_interval_days"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "framework_control_config_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "framework_control_config_control_id_fkey"
      columns: ["control_id"]
isOneToOne: false
      referencedRelation: "framework_controls"
      referencedColumns: ["id"]
    }
                  ]
                },"framework_controls": {
                  Row: {
                    "audiences": Json | null,"category": string | null,"control_code": string,"control_type": string,"created_at": string,"description": string,"framework_id": string,"id": string,"is_active": boolean,"jurisdiction": string | null,"pattern_flags": string,"pattern_source": string | null,"platforms": Json | null,"regulation_cited": string,"required_phrases": Json | null,"section_id": string | null,"severity": string,"suggestion_template": string,"title": string,"trigger_patterns": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "audiences"?: Json | null,"category"?: string | null,"control_code": string,"control_type": string,"created_at"?: string,"description": string,"framework_id": string,"id"?: string,"is_active"?: boolean,"jurisdiction"?: string | null,"pattern_flags"?: string,"pattern_source"?: string | null,"platforms"?: Json | null,"regulation_cited": string,"required_phrases"?: Json | null,"section_id"?: string | null,"severity"?: string,"suggestion_template": string,"title": string,"trigger_patterns"?: Json | null
                  }
                  Update: {
                    "audiences"?: Json | null,"category"?: string | null,"control_code"?: string,"control_type"?: string,"created_at"?: string,"description"?: string,"framework_id"?: string,"id"?: string,"is_active"?: boolean,"jurisdiction"?: string | null,"pattern_flags"?: string,"pattern_source"?: string | null,"platforms"?: Json | null,"regulation_cited"?: string,"required_phrases"?: Json | null,"section_id"?: string | null,"severity"?: string,"suggestion_template"?: string,"title"?: string,"trigger_patterns"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "framework_controls_framework_id_fkey"
      columns: ["framework_id"]
isOneToOne: false
      referencedRelation: "regulatory_frameworks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "framework_controls_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "framework_sections"
      referencedColumns: ["id"]
    }
                  ]
                },"framework_evidence": {
                  Row: {
                    "company_id": string,"control_id": string,"created_at": string,"description": string | null,"evidence_type": string,"expires_at": string | null,"file_name": string | null,"file_url": string | null,"id": string,"title": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"control_id": string,"created_at"?: string,"description"?: string | null,"evidence_type"?: string,"expires_at"?: string | null,"file_name"?: string | null,"file_url"?: string | null,"id"?: string,"title": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"control_id"?: string,"created_at"?: string,"description"?: string | null,"evidence_type"?: string,"expires_at"?: string | null,"file_name"?: string | null,"file_url"?: string | null,"id"?: string,"title"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "framework_evidence_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "framework_evidence_control_id_fkey"
      columns: ["control_id"]
isOneToOne: false
      referencedRelation: "framework_controls"
      referencedColumns: ["id"]
    }
                  ]
                },"framework_sections": {
                  Row: {
                    "description": string | null,"framework_id": string,"id": string,"section_number": string | null,"sort_order": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"framework_id": string,"id"?: string,"section_number"?: string | null,"sort_order"?: number,"title": string
                  }
                  Update: {
                    "description"?: string | null,"framework_id"?: string,"id"?: string,"section_number"?: string | null,"sort_order"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "framework_sections_framework_id_fkey"
      columns: ["framework_id"]
isOneToOne: false
      referencedRelation: "regulatory_frameworks"
      referencedColumns: ["id"]
    }
                  ]
                },"framework_test_log": {
                  Row: {
                    "company_id": string,"control_id": string,"created_at": string,"id": string,"next_test_due": string | null,"notes": string | null,"status": string,"tested_at": string,"tested_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"control_id": string,"created_at"?: string,"id"?: string,"next_test_due"?: string | null,"notes"?: string | null,"status": string,"tested_at"?: string,"tested_by"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"control_id"?: string,"created_at"?: string,"id"?: string,"next_test_due"?: string | null,"notes"?: string | null,"status"?: string,"tested_at"?: string,"tested_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "framework_test_log_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "framework_test_log_control_id_fkey"
      columns: ["control_id"]
isOneToOne: false
      referencedRelation: "framework_controls"
      referencedColumns: ["id"]
    }
                  ]
                },"gmp_readiness_log": {
                  Row: {
                    "company_id": string,"evidence_name": string | null,"evidence_url": string | null,"id": string,"item_id": string,"notes": string | null,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"evidence_name"?: string | null,"evidence_url"?: string | null,"id"?: string,"item_id": string,"notes"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"evidence_name"?: string | null,"evidence_url"?: string | null,"id"?: string,"item_id"?: string,"notes"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "gmp_readiness_log_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"governance_job_runs": {
                  Row: {
                    "company_id": string | null,"completed_at": string | null,"duration_ms": number | null,"error_message": string | null,"id": string,"job_name": string,"job_type": string,"metadata": Json | null,"related_entity_id": string | null,"related_entity_type": string | null,"source": string,"started_at": string | null,"status": string,"triggered_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"completed_at"?: string | null,"duration_ms"?: number | null,"error_message"?: string | null,"id"?: string,"job_name": string,"job_type": string,"metadata"?: Json | null,"related_entity_id"?: string | null,"related_entity_type"?: string | null,"source": string,"started_at"?: string | null,"status": string,"triggered_by"?: string | null
                  }
                  Update: {
                    "company_id"?: string | null,"completed_at"?: string | null,"duration_ms"?: number | null,"error_message"?: string | null,"id"?: string,"job_name"?: string,"job_type"?: string,"metadata"?: Json | null,"related_entity_id"?: string | null,"related_entity_type"?: string | null,"source"?: string,"started_at"?: string | null,"status"?: string,"triggered_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "governance_job_runs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "governance_job_runs_triggered_by_fkey"
      columns: ["triggered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"grc_control_evidence": {
                  Row: {
                    "company_id": string,"control_id": string,"created_at": string | null,"entity_id": string | null,"entity_type": string | null,"id": string,"linked_by": string | null,"status": string | null,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"control_id": string,"created_at"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"linked_by"?: string | null,"status"?: string | null,"valid_until"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"control_id"?: string,"created_at"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"linked_by"?: string | null,"status"?: string | null,"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "grc_control_evidence_control_id_fkey"
      columns: ["control_id"]
isOneToOne: false
      referencedRelation: "grc_controls"
      referencedColumns: ["id"]
    }
                  ]
                },"grc_control_snapshots": {
                  Row: {
                    "company_id": string,"control_id": string,"created_at": string | null,"created_by": string | null,"id": string,"notes": string | null,"snapshot_date": string | null,"status": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"control_id": string,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"notes"?: string | null,"snapshot_date"?: string | null,"status"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"control_id"?: string,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"notes"?: string | null,"snapshot_date"?: string | null,"status"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "grc_control_snapshots_control_id_fkey"
      columns: ["control_id"]
isOneToOne: false
      referencedRelation: "grc_controls"
      referencedColumns: ["id"]
    }
                  ]
                },"grc_controls": {
                  Row: {
                    "company_id": string,"created_at": string | null,"created_by": string | null,"description": string | null,"domain_category": string | null,"framework_id": string,"id": string,"owner_user_id": string | null,"reference_code": string | null,"status": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"domain_category"?: string | null,"framework_id": string,"id"?: string,"owner_user_id"?: string | null,"reference_code"?: string | null,"status"?: string | null,"title": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"domain_category"?: string | null,"framework_id"?: string,"id"?: string,"owner_user_id"?: string | null,"reference_code"?: string | null,"status"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "grc_controls_framework_id_fkey"
      columns: ["framework_id"]
isOneToOne: false
      referencedRelation: "grc_frameworks"
      referencedColumns: ["id"]
    }
                  ]
                },"grc_frameworks": {
                  Row: {
                    "company_id": string,"created_at": string | null,"created_by": string | null,"description": string | null,"id": string,"name": string,"status": string | null,"version": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"id"?: string,"name": string,"status"?: string | null,"version"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"id"?: string,"name"?: string,"status"?: string | null,"version"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"identity_providers": {
                  Row: {
                    "company_id": string,"created_at": string | null,"domain": string | null,"enabled": boolean | null,"id": string,"metadata": Json | null,"name": string,"provider_type": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string | null,"domain"?: string | null,"enabled"?: boolean | null,"id"?: string,"metadata"?: Json | null,"name": string,"provider_type": string,"updated_at"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string | null,"domain"?: string | null,"enabled"?: boolean | null,"id"?: string,"metadata"?: Json | null,"name"?: string,"provider_type"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "identity_providers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"identity_role_mappings": {
                  Row: {
                    "created_at": string | null,"custom_role_id": string | null,"external_group": string,"id": string,"provider_id": string,"role": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"custom_role_id"?: string | null,"external_group": string,"id"?: string,"provider_id": string,"role"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"custom_role_id"?: string | null,"external_group"?: string,"id"?: string,"provider_id"?: string,"role"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "identity_role_mappings_custom_role_id_fkey"
      columns: ["custom_role_id"]
isOneToOne: false
      referencedRelation: "custom_roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "identity_role_mappings_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "identity_providers"
      referencedColumns: ["id"]
    }
                  ]
                },"identity_sessions": {
                  Row: {
                    "company_id": string | null,"created_at": string | null,"id": string,"ip_address": string | null,"login_method": string | null,"provider_id": string | null,"user_agent": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"created_at"?: string | null,"id"?: string,"ip_address"?: string | null,"login_method"?: string | null,"provider_id"?: string | null,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "company_id"?: string | null,"created_at"?: string | null,"id"?: string,"ip_address"?: string | null,"login_method"?: string | null,"provider_id"?: string | null,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "identity_sessions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "identity_sessions_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "identity_providers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "identity_sessions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"inprocess_oos_escalations": {
                  Row: {
                    "company_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision": string | null,"decision_reason": string | null,"deviation_id": string | null,"id": string,"raised_at": string,"raised_by": string,"raised_note": string | null,"reading_id": string,"signature_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision"?: string | null,"decision_reason"?: string | null,"deviation_id"?: string | null,"id"?: string,"raised_at"?: string,"raised_by": string,"raised_note"?: string | null,"reading_id": string,"signature_id"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision"?: string | null,"decision_reason"?: string | null,"deviation_id"?: string | null,"id"?: string,"raised_at"?: string,"raised_by"?: string,"raised_note"?: string | null,"reading_id"?: string,"signature_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inprocess_oos_esc_deviation_fkey"
      columns: ["deviation_id"]
isOneToOne: false
      referencedRelation: "deviations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inprocess_oos_escalations_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inprocess_oos_escalations_reading_id_fkey"
      columns: ["reading_id"]
isOneToOne: true
      referencedRelation: "batch_stage_parameter_readings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inprocess_oos_escalations_signature_id_fkey"
      columns: ["signature_id"]
isOneToOne: false
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    }
                  ]
                },"instrument_alert_policies": {
                  Row: {
                    "calibration_lead_days": number,"company_id": string,"created_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "calibration_lead_days"?: number,"company_id": string,"created_at"?: string,"updated_at"?: string
                  }
                  Update: {
                    "calibration_lead_days"?: number,"company_id"?: string,"created_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "instrument_alert_policies_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"instrument_calibration_alerts": {
                  Row: {
                    "acknowledged_at": string | null,"acknowledged_by": string | null,"alert_type": string,"company_id": string,"due_date": string,"id": string,"instrument_id": string,"lead_days": number,"owner_user_id": string | null,"raised_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"alert_type": string,"company_id": string,"due_date": string,"id"?: string,"instrument_id": string,"lead_days": number,"owner_user_id"?: string | null,"raised_at"?: string
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"alert_type"?: string,"company_id"?: string,"due_date"?: string,"id"?: string,"instrument_id"?: string,"lead_days"?: number,"owner_user_id"?: string | null,"raised_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "instrument_calibration_alerts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "instrument_calibration_alerts_instrument_id_fkey"
      columns: ["instrument_id"]
isOneToOne: false
      referencedRelation: "instruments"
      referencedColumns: ["id"]
    }
                  ]
                },"instrument_calibrations": {
                  Row: {
                    "calibrated_on": string,"certificate_number": string | null,"company_id": string,"created_at": string,"document_mime_type": string | null,"document_path": string | null,"document_size_bytes": number | null,"due_on": string,"id": string,"instrument_id": string,"performed_by_org": string | null,"performed_in_house": boolean,"result": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "calibrated_on": string,"certificate_number"?: string | null,"company_id": string,"created_at"?: string,"document_mime_type"?: string | null,"document_path"?: string | null,"document_size_bytes"?: number | null,"due_on": string,"id"?: string,"instrument_id": string,"performed_by_org"?: string | null,"performed_in_house"?: boolean,"result"?: string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "calibrated_on"?: string,"certificate_number"?: string | null,"company_id"?: string,"created_at"?: string,"document_mime_type"?: string | null,"document_path"?: string | null,"document_size_bytes"?: number | null,"due_on"?: string,"id"?: string,"instrument_id"?: string,"performed_by_org"?: string | null,"performed_in_house"?: boolean,"result"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "instrument_calibrations_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "instrument_calibrations_instrument_id_fkey"
      columns: ["instrument_id"]
isOneToOne: false
      referencedRelation: "instruments"
      referencedColumns: ["id"]
    }
                  ]
                },"instrument_usages": {
                  Row: {
                    "company_id": string,"created_at": string,"due_on_at_use": string | null,"entity_id": string,"entity_type": string,"id": string,"instrument_code_at_use": string | null,"instrument_id": string,"used_at": string,"used_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"due_on_at_use"?: string | null,"entity_id": string,"entity_type": string,"id"?: string,"instrument_code_at_use"?: string | null,"instrument_id": string,"used_at"?: string,"used_by"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"due_on_at_use"?: string | null,"entity_id"?: string,"entity_type"?: string,"id"?: string,"instrument_code_at_use"?: string | null,"instrument_id"?: string,"used_at"?: string,"used_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "instrument_usages_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "instrument_usages_instrument_id_fkey"
      columns: ["instrument_id"]
isOneToOne: false
      referencedRelation: "instruments"
      referencedColumns: ["id"]
    }
                  ]
                },"instruments": {
                  Row: {
                    "calibration_due_date": string | null,"code": string,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"instrument_type": string,"last_calibrated_on": string | null,"location": string | null,"manufacturer": string | null,"model": string | null,"name": string,"notes": string | null,"owner_user_id": string | null,"serial_number": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "calibration_due_date"?: string | null,"code": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"instrument_type": string,"last_calibrated_on"?: string | null,"location"?: string | null,"manufacturer"?: string | null,"model"?: string | null,"name": string,"notes"?: string | null,"owner_user_id"?: string | null,"serial_number"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "calibration_due_date"?: string | null,"code"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"instrument_type"?: string,"last_calibrated_on"?: string | null,"location"?: string | null,"manufacturer"?: string | null,"model"?: string | null,"name"?: string,"notes"?: string | null,"owner_user_id"?: string | null,"serial_number"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "instruments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_connections": {
                  Row: {
                    "company_id": string,"config": NonNullable<Json>,"created_at": string,"created_by": string,"credentials_encrypted": string | null,"display_name": string,"id": string,"last_error": string | null,"last_health_check_at": string | null,"last_synced_at": string | null,"provider_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"config"?: NonNullable<Json>,"created_at"?: string,"created_by": string,"credentials_encrypted"?: string | null,"display_name": string,"id"?: string,"last_error"?: string | null,"last_health_check_at"?: string | null,"last_synced_at"?: string | null,"provider_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"config"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string,"credentials_encrypted"?: string | null,"display_name"?: string,"id"?: string,"last_error"?: string | null,"last_health_check_at"?: string | null,"last_synced_at"?: string | null,"provider_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"integration_logs": {
                  Row: {
                    "action": string,"company_id": string,"connection_id": string | null,"created_at": string,"id": string,"level": string,"message": string,"metadata": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"company_id": string,"connection_id"?: string | null,"created_at"?: string,"id"?: string,"level"?: string,"message"?: string,"metadata"?: Json | null
                  }
                  Update: {
                    "action"?: string,"company_id"?: string,"connection_id"?: string | null,"created_at"?: string,"id"?: string,"level"?: string,"message"?: string,"metadata"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_logs_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: false
      referencedRelation: "integration_connections"
      referencedColumns: ["id"]
    }
                  ]
                },"legal_hold_items": {
                  Row: {
                    "company_id": string,"created_at": string | null,"entity_id": string,"entity_type": string,"id": string,"legal_hold_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string | null,"entity_id": string,"entity_type": string,"id"?: string,"legal_hold_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string | null,"entity_id"?: string,"entity_type"?: string,"id"?: string,"legal_hold_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "legal_hold_items_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "legal_hold_items_legal_hold_id_fkey"
      columns: ["legal_hold_id"]
isOneToOne: false
      referencedRelation: "legal_holds"
      referencedColumns: ["id"]
    }
                  ]
                },"legal_holds": {
                  Row: {
                    "company_id": string,"created_at": string | null,"created_by": string | null,"id": string,"name": string,"reason": string | null,"released_at": string | null,"status": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"name": string,"reason"?: string | null,"released_at"?: string | null,"status"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"name"?: string,"reason"?: string | null,"released_at"?: string | null,"status"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "legal_holds_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"legal_partner_profiles": {
                  Row: {
                    "bio": string | null,"contact_email": string | null,"firm_name": string | null,"hourly_rate": number,"id": string,"jurisdictions": (string)[],"onboarded_at": string,"partner_type": string,"specialties": (string)[],"verification_status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bio"?: string | null,"contact_email"?: string | null,"firm_name"?: string | null,"hourly_rate"?: number,"id": string,"jurisdictions"?: (string)[],"onboarded_at"?: string,"partner_type": string,"specialties"?: (string)[],"verification_status"?: string
                  }
                  Update: {
                    "bio"?: string | null,"contact_email"?: string | null,"firm_name"?: string | null,"hourly_rate"?: number,"id"?: string,"jurisdictions"?: (string)[],"onboarded_at"?: string,"partner_type"?: string,"specialties"?: (string)[],"verification_status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"legal_reviews": {
                  Row: {
                    "comments": string | null,"content_id": string,"created_at": string | null,"id": string,"reviewer_id": string | null,"status": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "comments"?: string | null,"content_id": string,"created_at"?: string | null,"id"?: string,"reviewer_id"?: string | null,"status"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "comments"?: string | null,"content_id"?: string,"created_at"?: string | null,"id"?: string,"reviewer_id"?: string | null,"status"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "legal_reviews_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"licence_renewal_alerts": {
                  Row: {
                    "acknowledged_at": string | null,"acknowledged_by": string | null,"company_id": string,"due_date": string,"id": string,"licence_id": string,"milestone_months": number,"raised_at": string,"renewal_cycle_expiry": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"company_id": string,"due_date": string,"id"?: string,"licence_id": string,"milestone_months": number,"raised_at"?: string,"renewal_cycle_expiry": string
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"company_id"?: string,"due_date"?: string,"id"?: string,"licence_id"?: string,"milestone_months"?: number,"raised_at"?: string,"renewal_cycle_expiry"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "licence_renewal_alerts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "licence_renewal_alerts_licence_id_fkey"
      columns: ["licence_id"]
isOneToOne: false
      referencedRelation: "regulatory_licences"
      referencedColumns: ["id"]
    }
                  ]
                },"licence_renewal_policies": {
                  Row: {
                    "alert_months": (number)[],"company_id": string,"monthly_from_month": number,"production_notify_roles": (string)[],"renewal_exception_allows_initiation": boolean,"renewal_exception_allows_release": boolean,"renewal_template_key": string,"suppress_when_discontinued": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alert_months"?: (number)[],"company_id": string,"monthly_from_month"?: number,"production_notify_roles"?: (string)[],"renewal_exception_allows_initiation"?: boolean,"renewal_exception_allows_release"?: boolean,"renewal_template_key"?: string,"suppress_when_discontinued"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "alert_months"?: (number)[],"company_id"?: string,"monthly_from_month"?: number,"production_notify_roles"?: (string)[],"renewal_exception_allows_initiation"?: boolean,"renewal_exception_allows_release"?: boolean,"renewal_template_key"?: string,"suppress_when_discontinued"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "licence_renewal_policies_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"licence_renewal_steps": {
                  Row: {
                    "company_id": string,"completed_at": string | null,"completed_by": string | null,"created_at": string,"deadline": string,"description": string,"id": string,"is_completed": boolean,"licence_id": string,"renewal_cycle_expiry": string,"step_no": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"deadline": string,"description"?: string,"id"?: string,"is_completed"?: boolean,"licence_id": string,"renewal_cycle_expiry": string,"step_no": number,"title": string
                  }
                  Update: {
                    "company_id"?: string,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"deadline"?: string,"description"?: string,"id"?: string,"is_completed"?: boolean,"licence_id"?: string,"renewal_cycle_expiry"?: string,"step_no"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "licence_renewal_steps_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "licence_renewal_steps_licence_id_fkey"
      columns: ["licence_id"]
isOneToOne: false
      referencedRelation: "regulatory_licences"
      referencedColumns: ["id"]
    }
                  ]
                },"licence_renewal_task_templates": {
                  Row: {
                    "company_id": string | null,"created_at": string,"description": string,"id": string,"months_before": number,"step_no": number,"template_key": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"months_before": number,"step_no": number,"template_key"?: string,"title": string
                  }
                  Update: {
                    "company_id"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"months_before"?: number,"step_no"?: number,"template_key"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "licence_renewal_task_templates_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"licence_variations": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"decision_date": string | null,"description": string,"id": string,"impact_assessment": string | null,"justification": string | null,"licence_id": string,"napams_reference": string | null,"product_id": string | null,"reference": string | null,"resulting_expiry_date": string | null,"status": string,"submitted_date": string | null,"title": string,"updated_at": string,"variation_class": string,"variation_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"decision_date"?: string | null,"description"?: string,"id"?: string,"impact_assessment"?: string | null,"justification"?: string | null,"licence_id": string,"napams_reference"?: string | null,"product_id"?: string | null,"reference"?: string | null,"resulting_expiry_date"?: string | null,"status"?: string,"submitted_date"?: string | null,"title": string,"updated_at"?: string,"variation_class": string,"variation_type": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"decision_date"?: string | null,"description"?: string,"id"?: string,"impact_assessment"?: string | null,"justification"?: string | null,"licence_id"?: string,"napams_reference"?: string | null,"product_id"?: string | null,"reference"?: string | null,"resulting_expiry_date"?: string | null,"status"?: string,"submitted_date"?: string | null,"title"?: string,"updated_at"?: string,"variation_class"?: string,"variation_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "licence_variations_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "licence_variations_licence_id_fkey"
      columns: ["licence_id"]
isOneToOne: false
      referencedRelation: "regulatory_licences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "licence_variations_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"license_renewal_tasks": {
                  Row: {
                    "completed_at": string | null,"completed_by": string | null,"created_at": string,"deadline": string,"description": string,"id": string,"is_completed": boolean,"license_id": string,"sort_order": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"deadline": string,"description"?: string,"id"?: string,"is_completed"?: boolean,"license_id": string,"sort_order"?: number,"title": string
                  }
                  Update: {
                    "completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"deadline"?: string,"description"?: string,"id"?: string,"is_completed"?: boolean,"license_id"?: string,"sort_order"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "license_renewal_tasks_license_id_fkey"
      columns: ["license_id"]
isOneToOne: false
      referencedRelation: "licenses"
      referencedColumns: ["id"]
    }
                  ]
                },"licenses": {
                  Row: {
                    "category": string,"certificate_url": string | null,"company_id": string,"created_at": string,"expiry_date": string,"id": string,"issue_date": string | null,"issuing_authority": string,"nafdac_reg_number": string,"notes": string | null,"product_name": string,"renewal_status": string,"status": string,"updated_at": string,"uploaded_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"certificate_url"?: string | null,"company_id": string,"created_at"?: string,"expiry_date": string,"id"?: string,"issue_date"?: string | null,"issuing_authority"?: string,"nafdac_reg_number"?: string,"notes"?: string | null,"product_name": string,"renewal_status"?: string,"status"?: string,"updated_at"?: string,"uploaded_by": string
                  }
                  Update: {
                    "category"?: string,"certificate_url"?: string | null,"company_id"?: string,"created_at"?: string,"expiry_date"?: string,"id"?: string,"issue_date"?: string | null,"issuing_authority"?: string,"nafdac_reg_number"?: string,"notes"?: string | null,"product_name"?: string,"renewal_status"?: string,"status"?: string,"updated_at"?: string,"uploaded_by"?: string
                  }
                  Relationships: [
                    
                  ]
                },"lifecycle_definitions": {
                  Row: {
                    "company_id": string | null,"created_at": string,"description": string | null,"entity_type": string,"id": string,"is_active": boolean,"name": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"created_at"?: string,"description"?: string | null,"entity_type": string,"id"?: string,"is_active"?: boolean,"name": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "company_id"?: string | null,"created_at"?: string,"description"?: string | null,"entity_type"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "lifecycle_definitions_company_fk"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"lifecycle_states": {
                  Row: {
                    "created_at": string,"definition_id": string,"description": string | null,"id": string,"is_initial": boolean,"is_locked": boolean,"is_terminal": boolean,"label": string,"sort_order": number,"state_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"definition_id": string,"description"?: string | null,"id"?: string,"is_initial"?: boolean,"is_locked"?: boolean,"is_terminal"?: boolean,"label": string,"sort_order"?: number,"state_key": string
                  }
                  Update: {
                    "created_at"?: string,"definition_id"?: string,"description"?: string | null,"id"?: string,"is_initial"?: boolean,"is_locked"?: boolean,"is_terminal"?: boolean,"label"?: string,"sort_order"?: number,"state_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lifecycle_states_definition_id_fkey"
      columns: ["definition_id"]
isOneToOne: false
      referencedRelation: "lifecycle_definitions"
      referencedColumns: ["id"]
    }
                  ]
                },"lifecycle_transitions": {
                  Row: {
                    "action_key": string,"created_at": string,"definition_id": string,"from_state_id": string,"id": string,"label": string,"required_permission": string | null,"required_role": string | null,"requires_comment": boolean,"requires_signature": boolean,"sort_order": number,"to_state_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_key": string,"created_at"?: string,"definition_id": string,"from_state_id": string,"id"?: string,"label": string,"required_permission"?: string | null,"required_role"?: string | null,"requires_comment"?: boolean,"requires_signature"?: boolean,"sort_order"?: number,"to_state_id": string
                  }
                  Update: {
                    "action_key"?: string,"created_at"?: string,"definition_id"?: string,"from_state_id"?: string,"id"?: string,"label"?: string,"required_permission"?: string | null,"required_role"?: string | null,"requires_comment"?: boolean,"requires_signature"?: boolean,"sort_order"?: number,"to_state_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lifecycle_transitions_definition_id_fkey"
      columns: ["definition_id"]
isOneToOne: false
      referencedRelation: "lifecycle_definitions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lifecycle_transitions_from_state_id_fkey"
      columns: ["from_state_id"]
isOneToOne: false
      referencedRelation: "lifecycle_states"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lifecycle_transitions_to_state_id_fkey"
      columns: ["to_state_id"]
isOneToOne: false
      referencedRelation: "lifecycle_states"
      referencedColumns: ["id"]
    }
                  ]
                },"line_changeover_verifications": {
                  Row: {
                    "clearance_id": string,"company_id": string,"created_at": string,"detail": string | null,"deviation_id": string | null,"id": string,"limit_value": number | null,"measured_value": number | null,"method": string,"performed_at": string,"performed_by": string,"result": string,"unit": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clearance_id": string,"company_id": string,"created_at"?: string,"detail"?: string | null,"deviation_id"?: string | null,"id"?: string,"limit_value"?: number | null,"measured_value"?: number | null,"method": string,"performed_at"?: string,"performed_by": string,"result": string,"unit"?: string | null
                  }
                  Update: {
                    "clearance_id"?: string,"company_id"?: string,"created_at"?: string,"detail"?: string | null,"deviation_id"?: string | null,"id"?: string,"limit_value"?: number | null,"measured_value"?: number | null,"method"?: string,"performed_at"?: string,"performed_by"?: string,"result"?: string,"unit"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lcv_deviation_fkey"
      columns: ["deviation_id"]
isOneToOne: false
      referencedRelation: "deviations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_changeover_verifications_clearance_id_fkey"
      columns: ["clearance_id"]
isOneToOne: false
      referencedRelation: "line_clearance_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_changeover_verifications_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"line_clearance_check_results": {
                  Row: {
                    "answered_at": string | null,"answered_by": string | null,"clearance_id": string,"company_id": string,"created_at": string,"id": string,"is_required": boolean,"item_code": string,"label": string,"note": string | null,"record_reference": string | null,"requires_record_reference": boolean,"result": string | null,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "answered_at"?: string | null,"answered_by"?: string | null,"clearance_id": string,"company_id": string,"created_at"?: string,"id"?: string,"is_required"?: boolean,"item_code": string,"label": string,"note"?: string | null,"record_reference"?: string | null,"requires_record_reference"?: boolean,"result"?: string | null,"sort_order"?: number
                  }
                  Update: {
                    "answered_at"?: string | null,"answered_by"?: string | null,"clearance_id"?: string,"company_id"?: string,"created_at"?: string,"id"?: string,"is_required"?: boolean,"item_code"?: string,"label"?: string,"note"?: string | null,"record_reference"?: string | null,"requires_record_reference"?: boolean,"result"?: string | null,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "line_clearance_check_results_clearance_id_fkey"
      columns: ["clearance_id"]
isOneToOne: false
      referencedRelation: "line_clearance_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_clearance_check_results_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"line_clearance_checklist_items": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"is_active": boolean,"is_required": boolean,"item_code": string,"label": string,"line_id": string,"note": string | null,"requires_record_reference": boolean,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_required"?: boolean,"item_code": string,"label": string,"line_id": string,"note"?: string | null,"requires_record_reference"?: boolean,"sort_order"?: number
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_required"?: boolean,"item_code"?: string,"label"?: string,"line_id"?: string,"note"?: string | null,"requires_record_reference"?: boolean,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "line_clearance_checklist_items_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_clearance_checklist_items_line_id_fkey"
      columns: ["line_id"]
isOneToOne: false
      referencedRelation: "production_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"line_clearance_overrides": {
                  Row: {
                    "authorised_by": string,"clearance_id": string,"company_id": string,"decided_at": string,"id": string,"reason": string,"signature_id": string,"verification_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "authorised_by": string,"clearance_id": string,"company_id": string,"decided_at"?: string,"id"?: string,"reason": string,"signature_id": string,"verification_id": string
                  }
                  Update: {
                    "authorised_by"?: string,"clearance_id"?: string,"company_id"?: string,"decided_at"?: string,"id"?: string,"reason"?: string,"signature_id"?: string,"verification_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "line_clearance_overrides_clearance_id_fkey"
      columns: ["clearance_id"]
isOneToOne: false
      referencedRelation: "line_clearance_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_clearance_overrides_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_clearance_overrides_signature_id_fkey"
      columns: ["signature_id"]
isOneToOne: false
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_clearance_overrides_verification_id_fkey"
      columns: ["verification_id"]
isOneToOne: true
      referencedRelation: "line_changeover_verifications"
      referencedColumns: ["id"]
    }
                  ]
                },"line_clearance_records": {
                  Row: {
                    "batch_id": string,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"line_id": string,"notes": string | null,"performed_at": string | null,"performed_by": string | null,"performed_signature_id": string | null,"previous_batch_id": string | null,"previous_product_name": string | null,"status": string,"updated_at": string,"verified_at": string | null,"verified_by": string | null,"verified_signature_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"line_id": string,"notes"?: string | null,"performed_at"?: string | null,"performed_by"?: string | null,"performed_signature_id"?: string | null,"previous_batch_id"?: string | null,"previous_product_name"?: string | null,"status"?: string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null,"verified_signature_id"?: string | null
                  }
                  Update: {
                    "batch_id"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"line_id"?: string,"notes"?: string | null,"performed_at"?: string | null,"performed_by"?: string | null,"performed_signature_id"?: string | null,"previous_batch_id"?: string | null,"previous_product_name"?: string | null,"status"?: string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null,"verified_signature_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "line_clearance_records_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batch_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_clearance_records_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_clearance_records_line_id_fkey"
      columns: ["line_id"]
isOneToOne: false
      referencedRelation: "production_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_clearance_records_performed_signature_id_fkey"
      columns: ["performed_signature_id"]
isOneToOne: false
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_clearance_records_previous_batch_id_fkey"
      columns: ["previous_batch_id"]
isOneToOne: false
      referencedRelation: "batch_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_clearance_records_verified_signature_id_fkey"
      columns: ["verified_signature_id"]
isOneToOne: false
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    }
                  ]
                },"marketplace_connections": {
                  Row: {
                    "auto_assign_frequency": string,"company_id": string,"created_at": string,"id": string,"is_active": boolean,"legal_partner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_assign_frequency"?: string,"company_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"legal_partner_id": string
                  }
                  Update: {
                    "auto_assign_frequency"?: string,"company_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"legal_partner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_marketplace_connections_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketplace_connections_legal_partner_id_fkey"
      columns: ["legal_partner_id"]
isOneToOne: false
      referencedRelation: "legal_partner_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"marketplace_requests": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"legal_partner_id": string,"message": string | null,"partner_reply": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"legal_partner_id": string,"message"?: string | null,"partner_reply"?: string | null,"status"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"legal_partner_id"?: string,"message"?: string | null,"partner_reply"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_marketplace_requests_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketplace_requests_legal_partner_id_fkey"
      columns: ["legal_partner_id"]
isOneToOne: false
      referencedRelation: "legal_partner_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"master_formula_materials": {
                  Row: {
                    "consumed_at_stage": string | null,"formula_id": string,"id": string,"is_critical": boolean,"material_id": string,"notes": string | null,"overage_pct": number,"quantity_per_batch": number,"role": string,"sort_order": number,"tolerance_pct": number | null,"unit": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consumed_at_stage"?: string | null,"formula_id": string,"id"?: string,"is_critical"?: boolean,"material_id": string,"notes"?: string | null,"overage_pct"?: number,"quantity_per_batch": number,"role": string,"sort_order"?: number,"tolerance_pct"?: number | null,"unit": string
                  }
                  Update: {
                    "consumed_at_stage"?: string | null,"formula_id"?: string,"id"?: string,"is_critical"?: boolean,"material_id"?: string,"notes"?: string | null,"overage_pct"?: number,"quantity_per_batch"?: number,"role"?: string,"sort_order"?: number,"tolerance_pct"?: number | null,"unit"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "master_formula_materials_formula_id_fkey"
      columns: ["formula_id"]
isOneToOne: false
      referencedRelation: "master_formula_current"
      referencedColumns: ["formula_id"]
    },{
      foreignKeyName: "master_formula_materials_formula_id_fkey"
      columns: ["formula_id"]
isOneToOne: false
      referencedRelation: "master_formulas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "master_formula_materials_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "master_formula_materials_stage_fk"
      columns: ["consumed_at_stage"]
isOneToOne: false
      referencedRelation: "master_formula_stages"
      referencedColumns: ["id"]
    }
                  ]
                },"master_formula_stage_parameters": {
                  Row: {
                    "id": string,"is_critical": boolean,"is_weight_variation": boolean,"max_value": number | null,"min_value": number | null,"notes": string | null,"parameter": string,"parameter_type": string,"sampling_interval_minutes": number | null,"sort_order": number,"stage_id": string,"target_text": string | null,"target_value": number | null,"unit": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"is_critical"?: boolean,"is_weight_variation"?: boolean,"max_value"?: number | null,"min_value"?: number | null,"notes"?: string | null,"parameter": string,"parameter_type": string,"sampling_interval_minutes"?: number | null,"sort_order"?: number,"stage_id": string,"target_text"?: string | null,"target_value"?: number | null,"unit"?: string | null
                  }
                  Update: {
                    "id"?: string,"is_critical"?: boolean,"is_weight_variation"?: boolean,"max_value"?: number | null,"min_value"?: number | null,"notes"?: string | null,"parameter"?: string,"parameter_type"?: string,"sampling_interval_minutes"?: number | null,"sort_order"?: number,"stage_id"?: string,"target_text"?: string | null,"target_value"?: number | null,"unit"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "master_formula_stage_parameters_stage_id_fkey"
      columns: ["stage_id"]
isOneToOne: false
      referencedRelation: "master_formula_stages"
      referencedColumns: ["id"]
    }
                  ]
                },"master_formula_stages": {
                  Row: {
                    "description": string | null,"duration_minutes": number | null,"equipment": string | null,"formula_id": string,"id": string,"name": string,"requires_signoff": boolean,"sequence_no": number,"stage_code": string
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"duration_minutes"?: number | null,"equipment"?: string | null,"formula_id": string,"id"?: string,"name": string,"requires_signoff"?: boolean,"sequence_no": number,"stage_code": string
                  }
                  Update: {
                    "description"?: string | null,"duration_minutes"?: number | null,"equipment"?: string | null,"formula_id"?: string,"id"?: string,"name"?: string,"requires_signoff"?: boolean,"sequence_no"?: number,"stage_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "master_formula_stages_formula_id_fkey"
      columns: ["formula_id"]
isOneToOne: false
      referencedRelation: "master_formula_current"
      referencedColumns: ["formula_id"]
    },{
      foreignKeyName: "master_formula_stages_formula_id_fkey"
      columns: ["formula_id"]
isOneToOne: false
      referencedRelation: "master_formulas"
      referencedColumns: ["id"]
    }
                  ]
                },"master_formulas": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"batch_size": number,"batch_size_unit": string,"change_control_id": string | null,"company_id": string,"created_at": string,"created_by": string | null,"effective_date": string | null,"expected_yield_pct": number | null,"id": string,"notes": string | null,"product_id": string,"signature_id": string | null,"status": string,"superseded_at": string | null,"supersedes_id": string | null,"updated_at": string,"version": string,"yield_max_pct": number | null,"yield_min_pct": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"batch_size": number,"batch_size_unit": string,"change_control_id"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"effective_date"?: string | null,"expected_yield_pct"?: number | null,"id"?: string,"notes"?: string | null,"product_id": string,"signature_id"?: string | null,"status"?: string,"superseded_at"?: string | null,"supersedes_id"?: string | null,"updated_at"?: string,"version": string,"yield_max_pct"?: number | null,"yield_min_pct"?: number | null
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"batch_size"?: number,"batch_size_unit"?: string,"change_control_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"effective_date"?: string | null,"expected_yield_pct"?: number | null,"id"?: string,"notes"?: string | null,"product_id"?: string,"signature_id"?: string | null,"status"?: string,"superseded_at"?: string | null,"supersedes_id"?: string | null,"updated_at"?: string,"version"?: string,"yield_max_pct"?: number | null,"yield_min_pct"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "master_formulas_change_control_id_fkey"
      columns: ["change_control_id"]
isOneToOne: false
      referencedRelation: "change_controls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "master_formulas_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "master_formulas_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "master_formulas_signature_id_fkey"
      columns: ["signature_id"]
isOneToOne: false
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "master_formulas_supersedes_id_fkey"
      columns: ["supersedes_id"]
isOneToOne: false
      referencedRelation: "master_formula_current"
      referencedColumns: ["formula_id"]
    },{
      foreignKeyName: "master_formulas_supersedes_id_fkey"
      columns: ["supersedes_id"]
isOneToOne: false
      referencedRelation: "master_formulas"
      referencedColumns: ["id"]
    }
                  ]
                },"material_alert_policies": {
                  Row: {
                    "company_id": string,"created_at": string,"expiry_lead_days": number,"retest_lead_days": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"expiry_lead_days"?: number,"retest_lead_days"?: number,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"expiry_lead_days"?: number,"retest_lead_days"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_alert_policies_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"material_certificates_of_analysis": {
                  Row: {
                    "certificate_number": string | null,"company_id": string,"created_at": string,"discrepancy_count": number,"document_mime_type": string | null,"document_path": string | null,"document_size_bytes": number | null,"id": string,"issued_date": string | null,"material_lot_id": string,"received_date": string,"supplier_results": NonNullable<Json>,"updated_at": string,"uploaded_by": string | null,"verification_status": string,"verified_at": string | null,"verified_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "certificate_number"?: string | null,"company_id": string,"created_at"?: string,"discrepancy_count"?: number,"document_mime_type"?: string | null,"document_path"?: string | null,"document_size_bytes"?: number | null,"id"?: string,"issued_date"?: string | null,"material_lot_id": string,"received_date"?: string,"supplier_results"?: NonNullable<Json>,"updated_at"?: string,"uploaded_by"?: string | null,"verification_status"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "certificate_number"?: string | null,"company_id"?: string,"created_at"?: string,"discrepancy_count"?: number,"document_mime_type"?: string | null,"document_path"?: string | null,"document_size_bytes"?: number | null,"id"?: string,"issued_date"?: string | null,"material_lot_id"?: string,"received_date"?: string,"supplier_results"?: NonNullable<Json>,"updated_at"?: string,"uploaded_by"?: string | null,"verification_status"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_certificates_of_analysis_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_certificates_of_analysis_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_certificates_of_analysis_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots_conditionally_released"
      referencedColumns: ["material_lot_id"]
    }
                  ]
                },"material_coa_discrepancies": {
                  Row: {
                    "certificate_id": string,"company_id": string,"detected_at": string,"deviation_id": string | null,"discrepancy_type": string,"id": string,"is_critical": boolean,"material_lot_id": string,"parameter": string,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"specification_limit": string | null,"stated_value": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "certificate_id": string,"company_id": string,"detected_at"?: string,"deviation_id"?: string | null,"discrepancy_type": string,"id"?: string,"is_critical"?: boolean,"material_lot_id": string,"parameter": string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"specification_limit"?: string | null,"stated_value"?: string | null
                  }
                  Update: {
                    "certificate_id"?: string,"company_id"?: string,"detected_at"?: string,"deviation_id"?: string | null,"discrepancy_type"?: string,"id"?: string,"is_critical"?: boolean,"material_lot_id"?: string,"parameter"?: string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"specification_limit"?: string | null,"stated_value"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_coa_disc_deviation_fkey"
      columns: ["deviation_id"]
isOneToOne: false
      referencedRelation: "deviations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_coa_discrepancies_certificate_id_fkey"
      columns: ["certificate_id"]
isOneToOne: false
      referencedRelation: "material_certificates_of_analysis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_coa_discrepancies_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_coa_discrepancies_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_coa_discrepancies_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots_conditionally_released"
      referencedColumns: ["material_lot_id"]
    }
                  ]
                },"material_lot_alerts": {
                  Row: {
                    "acknowledged_at": string | null,"acknowledged_by": string | null,"alert_type": string,"company_id": string,"due_date": string,"id": string,"lead_days": number,"material_lot_id": string,"raised_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"alert_type": string,"company_id": string,"due_date": string,"id"?: string,"lead_days": number,"material_lot_id": string,"raised_at"?: string
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"alert_type"?: string,"company_id"?: string,"due_date"?: string,"id"?: string,"lead_days"?: number,"material_lot_id"?: string,"raised_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_lot_alerts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_lot_alerts_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_lot_alerts_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots_conditionally_released"
      referencedColumns: ["material_lot_id"]
    }
                  ]
                },"material_lot_rejections": {
                  Row: {
                    "company_id": string,"completed_at": string | null,"decided_at": string,"decided_by": string,"disposition": string,"disposition_note": string | null,"id": string,"material_lot_id": string,"reason": string,"signature_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"completed_at"?: string | null,"decided_at"?: string,"decided_by": string,"disposition": string,"disposition_note"?: string | null,"id"?: string,"material_lot_id": string,"reason": string,"signature_id"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"completed_at"?: string | null,"decided_at"?: string,"decided_by"?: string,"disposition"?: string,"disposition_note"?: string | null,"id"?: string,"material_lot_id"?: string,"reason"?: string,"signature_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_lot_rejections_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_lot_rejections_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: true
      referencedRelation: "material_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_lot_rejections_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: true
      referencedRelation: "material_lots_conditionally_released"
      referencedColumns: ["material_lot_id"]
    },{
      foreignKeyName: "material_lot_rejections_signature_id_fkey"
      columns: ["signature_id"]
isOneToOne: false
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    }
                  ]
                },"material_lot_release_records": {
                  Row: {
                    "authorised_by": string | null,"company_id": string,"id": string,"justification": string | null,"material_lot_id": string,"release_type": string,"released_at": string,"released_by": string,"signature_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "authorised_by"?: string | null,"company_id": string,"id"?: string,"justification"?: string | null,"material_lot_id": string,"release_type": string,"released_at"?: string,"released_by": string,"signature_id"?: string | null
                  }
                  Update: {
                    "authorised_by"?: string | null,"company_id"?: string,"id"?: string,"justification"?: string | null,"material_lot_id"?: string,"release_type"?: string,"released_at"?: string,"released_by"?: string,"signature_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_lot_release_records_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_lot_release_records_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_lot_release_records_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots_conditionally_released"
      referencedColumns: ["material_lot_id"]
    },{
      foreignKeyName: "material_lot_release_records_signature_id_fkey"
      columns: ["signature_id"]
isOneToOne: false
      referencedRelation: "electronic_signatures"
      referencedColumns: ["id"]
    }
                  ]
                },"material_lot_sampling": {
                  Row: {
                    "company_id": string,"containers_sampled": number,"containers_total": number,"created_at": string,"id": string,"material_lot_id": string,"note": string | null,"reference": string,"sampled_by": string | null,"sampled_on": string,"sampling_plan": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"containers_sampled": number,"containers_total": number,"created_at"?: string,"id"?: string,"material_lot_id": string,"note"?: string | null,"reference": string,"sampled_by"?: string | null,"sampled_on"?: string,"sampling_plan"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"containers_sampled"?: number,"containers_total"?: number,"created_at"?: string,"id"?: string,"material_lot_id"?: string,"note"?: string | null,"reference"?: string,"sampled_by"?: string | null,"sampled_on"?: string,"sampling_plan"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_lot_sampling_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_lot_sampling_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_lot_sampling_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots_conditionally_released"
      referencedColumns: ["material_lot_id"]
    }
                  ]
                },"material_lots": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"id": string,"lot_number": string,"manufacture_date": string | null,"material_id": string,"quantity_available": number | null,"quantity_received": number | null,"received_by": string | null,"received_date": string,"retest_due_date": string | null,"status": string,"storage_location": string | null,"supplier_batch_number": string | null,"supplier_expiry_date": string | null,"supplier_id": string | null,"unit_of_measure": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"lot_number": string,"manufacture_date"?: string | null,"material_id": string,"quantity_available"?: number | null,"quantity_received"?: number | null,"received_by"?: string | null,"received_date"?: string,"retest_due_date"?: string | null,"status"?: string,"storage_location"?: string | null,"supplier_batch_number"?: string | null,"supplier_expiry_date"?: string | null,"supplier_id"?: string | null,"unit_of_measure"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"lot_number"?: string,"manufacture_date"?: string | null,"material_id"?: string,"quantity_available"?: number | null,"quantity_received"?: number | null,"received_by"?: string | null,"received_date"?: string,"retest_due_date"?: string | null,"status"?: string,"storage_location"?: string | null,"supplier_batch_number"?: string | null,"supplier_expiry_date"?: string | null,"supplier_id"?: string | null,"unit_of_measure"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_lots_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_lots_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_lots_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"material_notification_recipients": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"purpose": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"purpose": string,"user_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"purpose"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_notification_recipients_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"material_qa_authorities": {
                  Row: {
                    "company_id": string,"designated_at": string,"designated_by": string | null,"id": string,"revoked_at": string | null,"revoked_by": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"designated_at"?: string,"designated_by"?: string | null,"id"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "company_id"?: string,"designated_at"?: string,"designated_by"?: string | null,"id"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_qa_authorities_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"material_specification_parameters": {
                  Row: {
                    "created_at": string,"expected_text": string | null,"id": string,"is_critical": boolean,"limit_type": string,"max_value": number | null,"min_value": number | null,"parameter": string,"sort_order": number,"specification_id": string,"unit": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expected_text"?: string | null,"id"?: string,"is_critical"?: boolean,"limit_type": string,"max_value"?: number | null,"min_value"?: number | null,"parameter": string,"sort_order"?: number,"specification_id": string,"unit"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"expected_text"?: string | null,"id"?: string,"is_critical"?: boolean,"limit_type"?: string,"max_value"?: number | null,"min_value"?: number | null,"parameter"?: string,"sort_order"?: number,"specification_id"?: string,"unit"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_specification_parameters_specification_id_fkey"
      columns: ["specification_id"]
isOneToOne: false
      referencedRelation: "material_specifications"
      referencedColumns: ["id"]
    }
                  ]
                },"material_specifications": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"effective_date": string | null,"id": string,"material_id": string,"reference": string | null,"status": string,"superseded_at": string | null,"updated_at": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"effective_date"?: string | null,"id"?: string,"material_id": string,"reference"?: string | null,"status"?: string,"superseded_at"?: string | null,"updated_at"?: string,"version": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"effective_date"?: string | null,"id"?: string,"material_id"?: string,"reference"?: string | null,"status"?: string,"superseded_at"?: string | null,"updated_at"?: string,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_specifications_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_specifications_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    }
                  ]
                },"material_test_definitions": {
                  Row: {
                    "code": string | null,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"instrument": string | null,"is_active": boolean,"is_required": boolean,"method": string | null,"name": string,"sort_order": number,"specification_parameter_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"instrument"?: string | null,"is_active"?: boolean,"is_required"?: boolean,"method"?: string | null,"name": string,"sort_order"?: number,"specification_parameter_id": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"instrument"?: string | null,"is_active"?: boolean,"is_required"?: boolean,"method"?: string | null,"name"?: string,"sort_order"?: number,"specification_parameter_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_test_definitions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_test_definitions_specification_parameter_id_fkey"
      columns: ["specification_parameter_id"]
isOneToOne: true
      referencedRelation: "material_specification_parameters"
      referencedColumns: ["id"]
    }
                  ]
                },"material_test_results": {
                  Row: {
                    "actual_text": string | null,"actual_value": number | null,"analyst_id": string | null,"analyst_name": string,"company_id": string,"created_at": string,"id": string,"instrument": string | null,"limit_expected_text": string | null,"limit_max": number | null,"limit_min": number | null,"limit_type": string,"material_lot_id": string,"method": string | null,"parameter": string,"result": string,"specification_limit": string,"superseded_at": string | null,"superseded_by": string | null,"test_date": string,"test_definition_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_text"?: string | null,"actual_value"?: number | null,"analyst_id"?: string | null,"analyst_name": string,"company_id": string,"created_at"?: string,"id"?: string,"instrument"?: string | null,"limit_expected_text"?: string | null,"limit_max"?: number | null,"limit_min"?: number | null,"limit_type": string,"material_lot_id": string,"method"?: string | null,"parameter": string,"result": string,"specification_limit": string,"superseded_at"?: string | null,"superseded_by"?: string | null,"test_date"?: string,"test_definition_id": string
                  }
                  Update: {
                    "actual_text"?: string | null,"actual_value"?: number | null,"analyst_id"?: string | null,"analyst_name"?: string,"company_id"?: string,"created_at"?: string,"id"?: string,"instrument"?: string | null,"limit_expected_text"?: string | null,"limit_max"?: number | null,"limit_min"?: number | null,"limit_type"?: string,"material_lot_id"?: string,"method"?: string | null,"parameter"?: string,"result"?: string,"specification_limit"?: string,"superseded_at"?: string | null,"superseded_by"?: string | null,"test_date"?: string,"test_definition_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_test_results_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_test_results_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_test_results_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots_conditionally_released"
      referencedColumns: ["material_lot_id"]
    },{
      foreignKeyName: "material_test_results_test_definition_id_fkey"
      columns: ["test_definition_id"]
isOneToOne: false
      referencedRelation: "material_test_definitions"
      referencedColumns: ["id"]
    }
                  ]
                },"materials": {
                  Row: {
                    "allergen_contains": (string)[],"allergen_hidden": boolean,"allergen_may_contain": (string)[],"allergen_processing_aid": (string)[],"code": string,"company_id": string,"created_at": string,"created_by": string | null,"criticality": string,"further_processing_note": string | null,"id": string,"is_active": boolean,"material_type": string,"name": string,"requires_further_processing": boolean,"retest_period_days": number | null,"specification_reference": string | null,"specification_version": string | null,"storage_conditions": string | null,"storage_temperature_max_c": number | null,"storage_temperature_min_c": number | null,"unit_of_measure": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allergen_contains"?: (string)[],"allergen_hidden"?: boolean,"allergen_may_contain"?: (string)[],"allergen_processing_aid"?: (string)[],"code": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"criticality"?: string,"further_processing_note"?: string | null,"id"?: string,"is_active"?: boolean,"material_type": string,"name": string,"requires_further_processing"?: boolean,"retest_period_days"?: number | null,"specification_reference"?: string | null,"specification_version"?: string | null,"storage_conditions"?: string | null,"storage_temperature_max_c"?: number | null,"storage_temperature_min_c"?: number | null,"unit_of_measure"?: string,"updated_at"?: string
                  }
                  Update: {
                    "allergen_contains"?: (string)[],"allergen_hidden"?: boolean,"allergen_may_contain"?: (string)[],"allergen_processing_aid"?: (string)[],"code"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"criticality"?: string,"further_processing_note"?: string | null,"id"?: string,"is_active"?: boolean,"material_type"?: string,"name"?: string,"requires_further_processing"?: boolean,"retest_period_days"?: number | null,"specification_reference"?: string | null,"specification_version"?: string | null,"storage_conditions"?: string | null,"storage_temperature_max_c"?: number | null,"storage_temperature_min_c"?: number | null,"unit_of_measure"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "materials_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"monitored_channels": {
                  Row: {
                    "approved_content_hash": string | null,"approved_content_snapshot": string | null,"channel_name": string,"channel_type": string,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"last_checked_at": string | null,"status": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_content_hash"?: string | null,"approved_content_snapshot"?: string | null,"channel_name": string,"channel_type": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"last_checked_at"?: string | null,"status"?: string,"url"?: string | null
                  }
                  Update: {
                    "approved_content_hash"?: string | null,"approved_content_snapshot"?: string | null,"channel_name"?: string,"channel_type"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"last_checked_at"?: string | null,"status"?: string,"url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"monitored_pages": {
                  Row: {
                    "approved_content_hash": string | null,"company_id": string,"crawl_frequency": string | null,"created_at": string,"id": string,"last_crawled_at": string | null,"page_title": string,"page_url": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_content_hash"?: string | null,"company_id": string,"crawl_frequency"?: string | null,"created_at"?: string,"id"?: string,"last_crawled_at"?: string | null,"page_title": string,"page_url": string,"status"?: string
                  }
                  Update: {
                    "approved_content_hash"?: string | null,"company_id"?: string,"crawl_frequency"?: string | null,"created_at"?: string,"id"?: string,"last_crawled_at"?: string | null,"page_title"?: string,"page_url"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "monitored_pages_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "content_id": string | null,"created_at": string | null,"id": string,"message": string | null,"read_at": string | null,"recipient_id": string,"type": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id"?: string | null,"created_at"?: string | null,"id"?: string,"message"?: string | null,"read_at"?: string | null,"recipient_id": string,"type"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "content_id"?: string | null,"created_at"?: string | null,"id"?: string,"message"?: string | null,"read_at"?: string | null,"recipient_id"?: string,"type"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"obligation_links": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"link_type": string,"linked_entity_id": string,"obligation_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"link_type": string,"linked_entity_id": string,"obligation_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"link_type"?: string,"linked_entity_id"?: string,"obligation_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "obligation_links_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligation_links_obligation_id_fkey"
      columns: ["obligation_id"]
isOneToOne: false
      referencedRelation: "regulatory_obligations"
      referencedColumns: ["id"]
    }
                  ]
                },"org_regulation_libraries": {
                  Row: {
                    "added_by": string | null,"created_at": string,"id": string,"notes": string | null,"organization_id": string,"regulation_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"created_at"?: string,"id"?: string,"notes"?: string | null,"organization_id": string,"regulation_id": string
                  }
                  Update: {
                    "added_by"?: string | null,"created_at"?: string,"id"?: string,"notes"?: string | null,"organization_id"?: string,"regulation_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_regulation_libraries_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"created_by": string | null,"domain": string | null,"id": string,"logo_url": string | null,"name": string,"settings": NonNullable<Json>,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"domain"?: string | null,"id"?: string,"logo_url"?: string | null,"name": string,"settings"?: NonNullable<Json>,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"domain"?: string | null,"id"?: string,"logo_url"?: string | null,"name"?: string,"settings"?: NonNullable<Json>,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"page_compliance_alerts": {
                  Row: {
                    "alert_type": string,"description": string,"detected_at": string,"id": string,"page_id": string,"resolved": boolean | null,"resolved_at": string | null,"severity": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alert_type": string,"description": string,"detected_at"?: string,"id"?: string,"page_id": string,"resolved"?: boolean | null,"resolved_at"?: string | null,"severity"?: string
                  }
                  Update: {
                    "alert_type"?: string,"description"?: string,"detected_at"?: string,"id"?: string,"page_id"?: string,"resolved"?: boolean | null,"resolved_at"?: string | null,"severity"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "page_compliance_alerts_page_id_fkey"
      columns: ["page_id"]
isOneToOne: false
      referencedRelation: "monitored_pages"
      referencedColumns: ["id"]
    }
                  ]
                },"patient_consents": {
                  Row: {
                    "company_id": string,"consent_document_url": string | null,"consent_status": string,"consent_type": string,"created_at": string,"created_by": string | null,"digital_signature_hash": string | null,"expires_at": string | null,"id": string,"notes": string | null,"patient_identifier_hash": string | null,"patient_name": string,"signed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"consent_document_url"?: string | null,"consent_status"?: string,"consent_type": string,"created_at"?: string,"created_by"?: string | null,"digital_signature_hash"?: string | null,"expires_at"?: string | null,"id"?: string,"notes"?: string | null,"patient_identifier_hash"?: string | null,"patient_name": string,"signed_at"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"consent_document_url"?: string | null,"consent_status"?: string,"consent_type"?: string,"created_at"?: string,"created_by"?: string | null,"digital_signature_hash"?: string | null,"expires_at"?: string | null,"id"?: string,"notes"?: string | null,"patient_identifier_hash"?: string | null,"patient_name"?: string,"signed_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"pharma_ae_reports": {
                  Row: {
                    "company_id": string,"connection_id": string | null,"created_at": string,"created_by": string | null,"date_of_onset": string | null,"event_description": string,"forwarded_at": string | null,"forwarded_to_pv": boolean | null,"id": string,"meddra_pt": string | null,"patient_initials": string | null,"product_name": string,"pv_case_id": string | null,"reporter_type": string | null,"seriousness": string | null,"source_channel": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"connection_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"date_of_onset"?: string | null,"event_description": string,"forwarded_at"?: string | null,"forwarded_to_pv"?: boolean | null,"id"?: string,"meddra_pt"?: string | null,"patient_initials"?: string | null,"product_name": string,"pv_case_id"?: string | null,"reporter_type"?: string | null,"seriousness"?: string | null,"source_channel": string,"status"?: string
                  }
                  Update: {
                    "company_id"?: string,"connection_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"date_of_onset"?: string | null,"event_description"?: string,"forwarded_at"?: string | null,"forwarded_to_pv"?: boolean | null,"id"?: string,"meddra_pt"?: string | null,"patient_initials"?: string | null,"product_name"?: string,"pv_case_id"?: string | null,"reporter_type"?: string | null,"seriousness"?: string | null,"source_channel"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pharma_ae_reports_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"pharma_label_changes": {
                  Row: {
                    "affected_content_count": number | null,"change_summary": string,"change_type": string,"company_id": string,"completed_at": string | null,"connection_id": string | null,"id": string,"label_version": string | null,"product_name": string,"re_review_triggered": boolean | null,"received_at": string,"source_system": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "affected_content_count"?: number | null,"change_summary": string,"change_type": string,"company_id": string,"completed_at"?: string | null,"connection_id"?: string | null,"id"?: string,"label_version"?: string | null,"product_name": string,"re_review_triggered"?: boolean | null,"received_at"?: string,"source_system"?: string | null,"status"?: string
                  }
                  Update: {
                    "affected_content_count"?: number | null,"change_summary"?: string,"change_type"?: string,"company_id"?: string,"completed_at"?: string | null,"connection_id"?: string | null,"id"?: string,"label_version"?: string | null,"product_name"?: string,"re_review_triggered"?: boolean | null,"received_at"?: string,"source_system"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pharma_label_changes_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"pharma_sync_events": {
                  Row: {
                    "company_id": string,"completed_at": string | null,"connection_id": string,"created_at": string,"direction": string,"entity_id": string | null,"entity_type": string | null,"error_message": string | null,"event_type": string,"id": string,"payload": Json | null,"provider_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"completed_at"?: string | null,"connection_id": string,"created_at"?: string,"direction": string,"entity_id"?: string | null,"entity_type"?: string | null,"error_message"?: string | null,"event_type": string,"id"?: string,"payload"?: Json | null,"provider_id": string,"status"?: string
                  }
                  Update: {
                    "company_id"?: string,"completed_at"?: string | null,"connection_id"?: string,"created_at"?: string,"direction"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"error_message"?: string | null,"event_type"?: string,"id"?: string,"payload"?: Json | null,"provider_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pharma_sync_events_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"phi_scan_results": {
                  Row: {
                    "company_id": string,"content_id": string | null,"findings": NonNullable<Json>,"id": string,"risk_level": string,"scan_type": string,"scanned_at": string,"scanned_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"content_id"?: string | null,"findings"?: NonNullable<Json>,"id"?: string,"risk_level"?: string,"scan_type"?: string,"scanned_at"?: string,"scanned_by"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"content_id"?: string | null,"findings"?: NonNullable<Json>,"id"?: string,"risk_level"?: string,"scan_type"?: string,"scanned_at"?: string,"scanned_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "phi_scan_results_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"policies": {
                  Row: {
                    "category": string,"company_id": string,"created_at": string | null,"description": string | null,"id": string,"is_active": boolean | null,"last_reviewed_at": string | null,"next_review_due": string | null,"owner_id": string | null,"review_cycle_months": number,"title": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"company_id": string,"created_at"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean | null,"last_reviewed_at"?: string | null,"next_review_due"?: string | null,"owner_id"?: string | null,"review_cycle_months"?: number,"title": string,"updated_at"?: string | null
                  }
                  Update: {
                    "category"?: string,"company_id"?: string,"created_at"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean | null,"last_reviewed_at"?: string | null,"next_review_due"?: string | null,"owner_id"?: string | null,"review_cycle_months"?: number,"title"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"policy_acknowledgements": {
                  Row: {
                    "acknowledged_at": string | null,"id": string,"metadata": Json | null,"policy_id": string,"user_id": string,"version_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string | null,"id"?: string,"metadata"?: Json | null,"policy_id": string,"user_id": string,"version_id": string
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"id"?: string,"metadata"?: Json | null,"policy_id"?: string,"user_id"?: string,"version_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "policy_acknowledgements_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_acknowledgements_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "v_policy_compliance_stats"
      referencedColumns: ["policy_id"]
    },{
      foreignKeyName: "policy_acknowledgements_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "policy_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"policy_drafts": {
                  Row: {
                    "company_id": string,"content": string,"created_at": string,"id": string,"source_circular_id": string | null,"status": string | null,"title": string,"updated_at": string,"user_id": string,"version": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"content": string,"created_at"?: string,"id"?: string,"source_circular_id"?: string | null,"status"?: string | null,"title": string,"updated_at"?: string,"user_id": string,"version"?: number | null
                  }
                  Update: {
                    "company_id"?: string,"content"?: string,"created_at"?: string,"id"?: string,"source_circular_id"?: string | null,"status"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string,"version"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "policy_drafts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_drafts_source_circular_id_fkey"
      columns: ["source_circular_id"]
isOneToOne: false
      referencedRelation: "regulatory_circulars"
      referencedColumns: ["id"]
    }
                  ]
                },"policy_templates": {
                  Row: {
                    "base_content": string,"category": string,"created_at": string,"id": string,"metadata": Json | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_content": string,"category": string,"created_at"?: string,"id"?: string,"metadata"?: Json | null,"title": string
                  }
                  Update: {
                    "base_content"?: string,"category"?: string,"created_at"?: string,"id"?: string,"metadata"?: Json | null,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"policy_versions": {
                  Row: {
                    "approved_at": string | null,"approver_id": string | null,"content_text": string | null,"created_at": string | null,"created_by": string | null,"expiry_date": string | null,"file_name": string | null,"file_url": string | null,"id": string,"policy_id": string,"published_at": string | null,"rejected_at": string | null,"review_notes": string | null,"reviewed_at": string | null,"reviewer_id": string | null,"status": string,"submission_id": string | null,"submitted_for_review_at": string | null,"version_label": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approver_id"?: string | null,"content_text"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"expiry_date"?: string | null,"file_name"?: string | null,"file_url"?: string | null,"id"?: string,"policy_id": string,"published_at"?: string | null,"rejected_at"?: string | null,"review_notes"?: string | null,"reviewed_at"?: string | null,"reviewer_id"?: string | null,"status"?: string,"submission_id"?: string | null,"submitted_for_review_at"?: string | null,"version_label": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approver_id"?: string | null,"content_text"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"expiry_date"?: string | null,"file_name"?: string | null,"file_url"?: string | null,"id"?: string,"policy_id"?: string,"published_at"?: string | null,"rejected_at"?: string | null,"review_notes"?: string | null,"reviewed_at"?: string | null,"reviewer_id"?: string | null,"status"?: string,"submission_id"?: string | null,"submitted_for_review_at"?: string | null,"version_label"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "policy_versions_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_versions_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "v_policy_compliance_stats"
      referencedColumns: ["policy_id"]
    },{
      foreignKeyName: "policy_versions_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "content_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"product_documents": {
                  Row: {
                    "company_id": string,"created_at": string,"ctd_module": string | null,"description": string | null,"document_type": string,"expiry_date": string | null,"file_name": string | null,"file_url": string | null,"id": string,"is_ctd_administrative": boolean,"issue_date": string | null,"metadata": NonNullable<Json>,"name": string,"product_id": string | null,"scope": string,"updated_at": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"ctd_module"?: string | null,"description"?: string | null,"document_type": string,"expiry_date"?: string | null,"file_name"?: string | null,"file_url"?: string | null,"id"?: string,"is_ctd_administrative"?: boolean,"issue_date"?: string | null,"metadata"?: NonNullable<Json>,"name": string,"product_id"?: string | null,"scope": string,"updated_at"?: string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"ctd_module"?: string | null,"description"?: string | null,"document_type"?: string,"expiry_date"?: string | null,"file_name"?: string | null,"file_url"?: string | null,"id"?: string,"is_ctd_administrative"?: boolean,"issue_date"?: string | null,"metadata"?: NonNullable<Json>,"name"?: string,"product_id"?: string | null,"scope"?: string,"updated_at"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_documents_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_documents_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_weight_limits": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"id": string,"lal": number,"lwl": number,"notes": string | null,"product_id": string,"target_value": number,"ual": number,"unit": string,"updated_at": string,"uwl": number,"zone_1_action": string,"zone_2l_action": string,"zone_2u_action": string,"zone_3l_action": string,"zone_3u_action": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"lal": number,"lwl": number,"notes"?: string | null,"product_id": string,"target_value": number,"ual": number,"unit": string,"updated_at"?: string,"uwl": number,"zone_1_action"?: string,"zone_2l_action"?: string,"zone_2u_action"?: string,"zone_3l_action"?: string,"zone_3u_action"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"lal"?: number,"lwl"?: number,"notes"?: string | null,"product_id"?: string,"target_value"?: number,"ual"?: number,"unit"?: string,"updated_at"?: string,"uwl"?: number,"zone_1_action"?: string,"zone_2l_action"?: string,"zone_2u_action"?: string,"zone_3l_action"?: string,"zone_3u_action"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_weight_limits_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_weight_limits_product_id_fkey"
      columns: ["product_id"]
isOneToOne: true
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"production_lines": {
                  Row: {
                    "area": string | null,"code": string,"company_id": string,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"is_active": boolean,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area"?: string | null,"code": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "area"?: string | null,"code"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "production_lines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "category": string,"company_id": string,"controlled_substance_schedule": string | null,"created_at": string,"created_by": string | null,"description": string | null,"dosage_form": string | null,"generic_name": string | null,"id": string,"is_controlled_substance": boolean,"manufacturer_name": string | null,"manufacturer_vendor_id": string | null,"manufacturing_site": string | null,"manufacturing_type": string,"metadata": NonNullable<Json>,"nafdac_number": string | null,"pack_size": string | null,"product_code": string,"registration_expiry_date": string | null,"shelf_life_months": number | null,"status": string,"strength": string | null,"trade_name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"company_id": string,"controlled_substance_schedule"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"dosage_form"?: string | null,"generic_name"?: string | null,"id"?: string,"is_controlled_substance"?: boolean,"manufacturer_name"?: string | null,"manufacturer_vendor_id"?: string | null,"manufacturing_site"?: string | null,"manufacturing_type"?: string,"metadata"?: NonNullable<Json>,"nafdac_number"?: string | null,"pack_size"?: string | null,"product_code": string,"registration_expiry_date"?: string | null,"shelf_life_months"?: number | null,"status"?: string,"strength"?: string | null,"trade_name": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"company_id"?: string,"controlled_substance_schedule"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"dosage_form"?: string | null,"generic_name"?: string | null,"id"?: string,"is_controlled_substance"?: boolean,"manufacturer_name"?: string | null,"manufacturer_vendor_id"?: string | null,"manufacturing_site"?: string | null,"manufacturing_type"?: string,"metadata"?: NonNullable<Json>,"nafdac_number"?: string | null,"pack_size"?: string | null,"product_code"?: string,"registration_expiry_date"?: string | null,"shelf_life_months"?: number | null,"status"?: string,"strength"?: string | null,"trade_name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_manufacturer_vendor_id_fkey"
      columns: ["manufacturer_vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_settings": {
                  Row: {
                    "created_at": string,"digest_frequency": string,"email_enabled": boolean,"inapp_enabled": boolean,"toggles": NonNullable<Json>,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"digest_frequency"?: string,"email_enabled"?: boolean,"inapp_enabled"?: boolean,"toggles"?: NonNullable<Json>,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"digest_frequency"?: string,"email_enabled"?: boolean,"inapp_enabled"?: boolean,"toggles"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"brand_id": string | null,"business_unit_id": string | null,"company_id": string | null,"created_at": string | null,"custom_role_id": string | null,"default_jurisdiction": string | null,"deleted_at": string | null,"department": string | null,"email": string,"full_name": string | null,"id": string,"industry_type": string | null,"job_title": string | null,"language": string | null,"onboarding_completed": boolean,"organization": string | null,"organization_id": string | null,"phone": string | null,"primary_markets": (string)[] | null,"product_categories": (string)[] | null,"regulators": (string)[] | null,"role": string | null,"timezone": string | null,"updated_at": string | null,"vault_pin_hash": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"brand_id"?: string | null,"business_unit_id"?: string | null,"company_id"?: string | null,"created_at"?: string | null,"custom_role_id"?: string | null,"default_jurisdiction"?: string | null,"deleted_at"?: string | null,"department"?: string | null,"email": string,"full_name"?: string | null,"id": string,"industry_type"?: string | null,"job_title"?: string | null,"language"?: string | null,"onboarding_completed"?: boolean,"organization"?: string | null,"organization_id"?: string | null,"phone"?: string | null,"primary_markets"?: (string)[] | null,"product_categories"?: (string)[] | null,"regulators"?: (string)[] | null,"role"?: string | null,"timezone"?: string | null,"updated_at"?: string | null,"vault_pin_hash"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"brand_id"?: string | null,"business_unit_id"?: string | null,"company_id"?: string | null,"created_at"?: string | null,"custom_role_id"?: string | null,"default_jurisdiction"?: string | null,"deleted_at"?: string | null,"department"?: string | null,"email"?: string,"full_name"?: string | null,"id"?: string,"industry_type"?: string | null,"job_title"?: string | null,"language"?: string | null,"onboarding_completed"?: boolean,"organization"?: string | null,"organization_id"?: string | null,"phone"?: string | null,"primary_markets"?: (string)[] | null,"product_categories"?: (string)[] | null,"regulators"?: (string)[] | null,"role"?: string | null,"timezone"?: string | null,"updated_at"?: string | null,"vault_pin_hash"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_business_unit_id_fkey"
      columns: ["business_unit_id"]
isOneToOne: false
      referencedRelation: "business_units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_custom_role_id_fkey"
      columns: ["custom_role_id"]
isOneToOne: false
      referencedRelation: "custom_roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"raw_material_receipts": {
                  Row: {
                    "company_id": string,"created_at": string | null,"created_by": string | null,"id": string,"lot_number": string,"material_code": string | null,"material_name": string,"quantity": number | null,"received_by": string | null,"received_date": string,"supplier_name": string | null,"test_result": string | null,"test_status": string,"unit": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"lot_number": string,"material_code"?: string | null,"material_name": string,"quantity"?: number | null,"received_by"?: string | null,"received_date"?: string,"supplier_name"?: string | null,"test_result"?: string | null,"test_status"?: string,"unit"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"lot_number"?: string,"material_code"?: string | null,"material_name"?: string,"quantity"?: number | null,"received_by"?: string | null,"received_date"?: string,"supplier_name"?: string | null,"test_result"?: string | null,"test_status"?: string,"unit"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "raw_material_receipts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"regulation_impact_reports": {
                  Row: {
                    "affected_count": number,"affected_items": NonNullable<Json>,"company_id": string,"created_at": string,"generated_by": string | null,"id": string,"regulation_id": string | null,"regulation_title": string,"risk_distribution": NonNullable<Json>,"status": string,"summary_narrative": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "affected_count"?: number,"affected_items"?: NonNullable<Json>,"company_id": string,"created_at"?: string,"generated_by"?: string | null,"id"?: string,"regulation_id"?: string | null,"regulation_title"?: string,"risk_distribution"?: NonNullable<Json>,"status"?: string,"summary_narrative"?: string,"updated_at"?: string
                  }
                  Update: {
                    "affected_count"?: number,"affected_items"?: NonNullable<Json>,"company_id"?: string,"created_at"?: string,"generated_by"?: string | null,"id"?: string,"regulation_id"?: string | null,"regulation_title"?: string,"risk_distribution"?: NonNullable<Json>,"status"?: string,"summary_narrative"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_regulation_impact_reports_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"regulation_updates": {
                  Row: {
                    "acknowledged_at": string | null,"acknowledged_by": string | null,"change_summary": string,"created_at": string | null,"detected_at": string | null,"id": string,"new_version": string,"previous_version": string,"regulation_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"change_summary": string,"created_at"?: string | null,"detected_at"?: string | null,"id"?: string,"new_version": string,"previous_version": string,"regulation_id": string
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"change_summary"?: string,"created_at"?: string | null,"detected_at"?: string | null,"id"?: string,"new_version"?: string,"previous_version"?: string,"regulation_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "regulation_updates_regulation_id_fkey"
      columns: ["regulation_id"]
isOneToOne: false
      referencedRelation: "regulations"
      referencedColumns: ["id"]
    }
                  ]
                },"regulations": {
                  Row: {
                    "category": string,"content": string,"created_at": string | null,"effective_date": string | null,"id": string,"is_active": boolean | null,"jurisdiction": string | null,"last_crawled": string | null,"source": string,"source_url": string | null,"title": string,"updated_at": string | null,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"content": string,"created_at"?: string | null,"effective_date"?: string | null,"id"?: string,"is_active"?: boolean | null,"jurisdiction"?: string | null,"last_crawled"?: string | null,"source": string,"source_url"?: string | null,"title": string,"updated_at"?: string | null,"version": string
                  }
                  Update: {
                    "category"?: string,"content"?: string,"created_at"?: string | null,"effective_date"?: string | null,"id"?: string,"is_active"?: boolean | null,"jurisdiction"?: string | null,"last_crawled"?: string | null,"source"?: string,"source_url"?: string | null,"title"?: string,"updated_at"?: string | null,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"regulatory_alert_subscriptions": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"is_active": boolean,"notify_email": boolean,"notify_in_app": boolean,"regulation_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"notify_email"?: boolean,"notify_in_app"?: boolean,"regulation_id": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"notify_email"?: boolean,"notify_in_app"?: boolean,"regulation_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "regulatory_alert_subscriptions_regulation_id_fkey"
      columns: ["regulation_id"]
isOneToOne: false
      referencedRelation: "regulations"
      referencedColumns: ["id"]
    }
                  ]
                },"regulatory_circulars": {
                  Row: {
                    "circular_number": string,"created_at": string,"document_type": string | null,"effective_date": string | null,"id": string,"is_active": boolean,"jurisdiction": string | null,"product_categories": (string)[],"published_date": string,"severity": string,"source": string,"source_url": string | null,"summary": string,"title": string,"topics": (string)[] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "circular_number": string,"created_at"?: string,"document_type"?: string | null,"effective_date"?: string | null,"id"?: string,"is_active"?: boolean,"jurisdiction"?: string | null,"product_categories"?: (string)[],"published_date"?: string,"severity"?: string,"source": string,"source_url"?: string | null,"summary": string,"title": string,"topics"?: (string)[] | null
                  }
                  Update: {
                    "circular_number"?: string,"created_at"?: string,"document_type"?: string | null,"effective_date"?: string | null,"id"?: string,"is_active"?: boolean,"jurisdiction"?: string | null,"product_categories"?: (string)[],"published_date"?: string,"severity"?: string,"source"?: string,"source_url"?: string | null,"summary"?: string,"title"?: string,"topics"?: (string)[] | null
                  }
                  Relationships: [
                    
                  ]
                },"regulatory_crawl_runs": {
                  Row: {
                    "created_at": string,"error_message": string | null,"fetched_count": number,"finished_at": string | null,"id": string,"inserted_count": number,"source_id": string | null,"started_at": string,"status": string,"updated_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error_message"?: string | null,"fetched_count"?: number,"finished_at"?: string | null,"id"?: string,"inserted_count"?: number,"source_id"?: string | null,"started_at"?: string,"status"?: string,"updated_count"?: number
                  }
                  Update: {
                    "created_at"?: string,"error_message"?: string | null,"fetched_count"?: number,"finished_at"?: string | null,"id"?: string,"inserted_count"?: number,"source_id"?: string | null,"started_at"?: string,"status"?: string,"updated_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "regulatory_crawl_runs_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "regulatory_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"regulatory_frameworks": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"id": string,"is_active": boolean,"jurisdiction": string,"name": string,"regulatory_body": string,"short_name": string,"sort_order": number,"version": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"jurisdiction": string,"name": string,"regulatory_body": string,"short_name": string,"sort_order"?: number,"version"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"jurisdiction"?: string,"name"?: string,"regulatory_body"?: string,"short_name"?: string,"sort_order"?: number,"version"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"regulatory_impact_assessments": {
                  Row: {
                    "company_id": string,"content_id": string,"created_at": string,"id": string,"impact_level": string,"original_content": string | null,"reason": string,"status": string,"suggested_change": string,"update_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"content_id": string,"created_at"?: string,"id"?: string,"impact_level": string,"original_content"?: string | null,"reason": string,"status"?: string,"suggested_change": string,"update_id": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"content_id"?: string,"created_at"?: string,"id"?: string,"impact_level"?: string,"original_content"?: string | null,"reason"?: string,"status"?: string,"suggested_change"?: string,"update_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "regulatory_impact_assessments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "regulatory_impact_assessments_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content_submissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "regulatory_impact_assessments_update_id_fkey"
      columns: ["update_id"]
isOneToOne: false
      referencedRelation: "regulation_updates"
      referencedColumns: ["id"]
    }
                  ]
                },"regulatory_licences": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"discontinued_at": string | null,"expiry_date": string | null,"file_name": string | null,"file_url": string | null,"id": string,"issue_date": string | null,"licence_type": string,"name": string,"notes": string | null,"product_id": string | null,"product_name": string | null,"registration_number": string | null,"regulatory_body": string,"renewal_lead_days": number,"status": string,"submission_id": string | null,"superseded_by_licence_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"discontinued_at"?: string | null,"expiry_date"?: string | null,"file_name"?: string | null,"file_url"?: string | null,"id"?: string,"issue_date"?: string | null,"licence_type": string,"name": string,"notes"?: string | null,"product_id"?: string | null,"product_name"?: string | null,"registration_number"?: string | null,"regulatory_body"?: string,"renewal_lead_days"?: number,"status"?: string,"submission_id"?: string | null,"superseded_by_licence_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"discontinued_at"?: string | null,"expiry_date"?: string | null,"file_name"?: string | null,"file_url"?: string | null,"id"?: string,"issue_date"?: string | null,"licence_type"?: string,"name"?: string,"notes"?: string | null,"product_id"?: string | null,"product_name"?: string | null,"registration_number"?: string | null,"regulatory_body"?: string,"renewal_lead_days"?: number,"status"?: string,"submission_id"?: string | null,"superseded_by_licence_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "regulatory_licences_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "regulatory_licences_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "regulatory_licences_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "regulatory_submissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "regulatory_licences_superseded_by_licence_id_fkey"
      columns: ["superseded_by_licence_id"]
isOneToOne: false
      referencedRelation: "regulatory_licences"
      referencedColumns: ["id"]
    }
                  ]
                },"regulatory_obligations": {
                  Row: {
                    "category": string,"company_id": string,"created_at": string,"description": string,"due_date": string | null,"frequency": string | null,"id": string,"is_recurring": boolean,"jurisdiction": string,"owner_id": string | null,"regulation_id": string | null,"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"company_id": string,"created_at"?: string,"description": string,"due_date"?: string | null,"frequency"?: string | null,"id"?: string,"is_recurring"?: boolean,"jurisdiction"?: string,"owner_id"?: string | null,"regulation_id"?: string | null,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"company_id"?: string,"created_at"?: string,"description"?: string,"due_date"?: string | null,"frequency"?: string | null,"id"?: string,"is_recurring"?: boolean,"jurisdiction"?: string,"owner_id"?: string | null,"regulation_id"?: string | null,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "regulatory_obligations_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "regulatory_obligations_regulation_id_fkey"
      columns: ["regulation_id"]
isOneToOne: false
      referencedRelation: "regulations"
      referencedColumns: ["id"]
    }
                  ]
                },"regulatory_sources": {
                  Row: {
                    "crawl_interval_minutes": number,"created_at": string,"id": string,"is_active": boolean,"jurisdiction": string,"last_crawled_at": string | null,"name": string,"priority": number,"source_type": string,"updated_at": string,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "crawl_interval_minutes"?: number,"created_at"?: string,"id"?: string,"is_active"?: boolean,"jurisdiction"?: string,"last_crawled_at"?: string | null,"name": string,"priority"?: number,"source_type"?: string,"updated_at"?: string,"url": string
                  }
                  Update: {
                    "crawl_interval_minutes"?: number,"created_at"?: string,"id"?: string,"is_active"?: boolean,"jurisdiction"?: string,"last_crawled_at"?: string | null,"name"?: string,"priority"?: number,"source_type"?: string,"updated_at"?: string,"url"?: string
                  }
                  Relationships: [
                    
                  ]
                },"regulatory_submissions": {
                  Row: {
                    "approved_date": string | null,"checklist_phases": NonNullable<Json>,"company_id": string,"created_at": string,"created_by": string | null,"current_status": string,"document_checklist": NonNullable<Json>,"dossier_id": string | null,"expiry_date": string | null,"id": string,"napams_reference": string | null,"notes": string | null,"product_category": string,"product_id": string | null,"product_name": string,"registration_number": string | null,"regulatory_body": string,"submission_type": string,"submitted_date": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_date"?: string | null,"checklist_phases"?: NonNullable<Json>,"company_id": string,"created_at"?: string,"created_by"?: string | null,"current_status"?: string,"document_checklist"?: NonNullable<Json>,"dossier_id"?: string | null,"expiry_date"?: string | null,"id"?: string,"napams_reference"?: string | null,"notes"?: string | null,"product_category": string,"product_id"?: string | null,"product_name": string,"registration_number"?: string | null,"regulatory_body": string,"submission_type": string,"submitted_date"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "approved_date"?: string | null,"checklist_phases"?: NonNullable<Json>,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"current_status"?: string,"document_checklist"?: NonNullable<Json>,"dossier_id"?: string | null,"expiry_date"?: string | null,"id"?: string,"napams_reference"?: string | null,"notes"?: string | null,"product_category"?: string,"product_id"?: string | null,"product_name"?: string,"registration_number"?: string | null,"regulatory_body"?: string,"submission_type"?: string,"submitted_date"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "regulatory_submissions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "regulatory_submissions_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "ctd_dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "regulatory_submissions_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"regulatory_update_control_flags": {
                  Row: {
                    "alert_id": string,"company_id": string,"control_code": string | null,"control_id": string,"control_title": string | null,"created_at": string,"framework_id": string | null,"framework_name": string | null,"id": string,"reason": string | null,"severity": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alert_id": string,"company_id": string,"control_code"?: string | null,"control_id": string,"control_title"?: string | null,"created_at"?: string,"framework_id"?: string | null,"framework_name"?: string | null,"id"?: string,"reason"?: string | null,"severity"?: string,"status"?: string
                  }
                  Update: {
                    "alert_id"?: string,"company_id"?: string,"control_code"?: string | null,"control_id"?: string,"control_title"?: string | null,"created_at"?: string,"framework_id"?: string | null,"framework_name"?: string | null,"id"?: string,"reason"?: string | null,"severity"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "regulatory_update_control_flags_control_id_fkey"
      columns: ["control_id"]
isOneToOne: false
      referencedRelation: "framework_controls"
      referencedColumns: ["id"]
    }
                  ]
                },"regulatory_updates": {
                  Row: {
                    "company_id": string | null,"id": string,"jurisdiction": string,"published_at": string | null,"raw": Json | null,"retrieved_at": string,"snippet": string,"source": string,"title": string,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"id"?: string,"jurisdiction"?: string,"published_at"?: string | null,"raw"?: Json | null,"retrieved_at"?: string,"snippet"?: string,"source"?: string,"title"?: string,"url": string
                  }
                  Update: {
                    "company_id"?: string | null,"id"?: string,"jurisdiction"?: string,"published_at"?: string | null,"raw"?: Json | null,"retrieved_at"?: string,"snippet"?: string,"source"?: string,"title"?: string,"url"?: string
                  }
                  Relationships: [
                    
                  ]
                },"retention_policies": {
                  Row: {
                    "archive_after_days": number | null,"auto_delete": boolean,"company_id": string,"created_at": string | null,"created_by": string | null,"data_class": string,"enabled": boolean,"id": string,"retention_days": number,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archive_after_days"?: number | null,"auto_delete"?: boolean,"company_id": string,"created_at"?: string | null,"created_by"?: string | null,"data_class": string,"enabled"?: boolean,"id"?: string,"retention_days"?: number,"updated_at"?: string | null
                  }
                  Update: {
                    "archive_after_days"?: number | null,"auto_delete"?: boolean,"company_id"?: string,"created_at"?: string | null,"created_by"?: string | null,"data_class"?: string,"enabled"?: boolean,"id"?: string,"retention_days"?: number,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "retention_policies_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"review_assignments": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string,"deadline_at": string | null,"entity_id": string | null,"entity_type": string,"id": string,"quorum": number,"resolved_at": string | null,"resolved_outcome": string | null,"reviewer_ids": (string)[],"sla_hours": number,"status": string,"submission_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by": string,"deadline_at"?: string | null,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"quorum"?: number,"resolved_at"?: string | null,"resolved_outcome"?: string | null,"reviewer_ids"?: (string)[],"sla_hours"?: number,"status"?: string,"submission_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string,"deadline_at"?: string | null,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"quorum"?: number,"resolved_at"?: string | null,"resolved_outcome"?: string | null,"reviewer_ids"?: (string)[],"sla_hours"?: number,"status"?: string,"submission_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"review_votes": {
                  Row: {
                    "assignment_id": string,"comments": string | null,"created_at": string,"id": string,"reviewer_id": string,"updated_at": string,"vote": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_id": string,"comments"?: string | null,"created_at"?: string,"id"?: string,"reviewer_id": string,"updated_at"?: string,"vote": string
                  }
                  Update: {
                    "assignment_id"?: string,"comments"?: string | null,"created_at"?: string,"id"?: string,"reviewer_id"?: string,"updated_at"?: string,"vote"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_votes_assignment_id_fkey"
      columns: ["assignment_id"]
isOneToOne: false
      referencedRelation: "review_assignments"
      referencedColumns: ["id"]
    }
                  ]
                },"risk_links": {
                  Row: {
                    "company_id": string,"created_at": string | null,"id": string,"link_type": string,"linked_entity_id": string,"risk_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string | null,"id"?: string,"link_type": string,"linked_entity_id": string,"risk_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string | null,"id"?: string,"link_type"?: string,"linked_entity_id"?: string,"risk_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_risk_links_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "risk_links_risk_id_fkey"
      columns: ["risk_id"]
isOneToOne: false
      referencedRelation: "risks"
      referencedColumns: ["id"]
    }
                  ]
                },"risk_predictions": {
                  Row: {
                    "audience_type": string | null,"claim_types": (string)[] | null,"company_id": string,"confidence": number,"created_at": string,"created_by": string | null,"id": string,"platform": string,"predicted_risk": number,"recommendation": string | null,"risk_grade": string,"target_market": string,"therapeutic_area": string,"title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "audience_type"?: string | null,"claim_types"?: (string)[] | null,"company_id": string,"confidence": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"platform": string,"predicted_risk": number,"recommendation"?: string | null,"risk_grade": string,"target_market": string,"therapeutic_area": string,"title"?: string | null
                  }
                  Update: {
                    "audience_type"?: string | null,"claim_types"?: (string)[] | null,"company_id"?: string,"confidence"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"platform"?: string,"predicted_risk"?: number,"recommendation"?: string | null,"risk_grade"?: string,"target_market"?: string,"therapeutic_area"?: string,"title"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_risk_predictions_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"risks": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"owner_id": string | null,"risk_category": string,"risk_level": string,"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"owner_id"?: string | null,"risk_category": string,"risk_level": string,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"owner_id"?: string | null,"risk_category"?: string,"risk_level"?: string,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_risks_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "risks_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"root_cause_analyses": {
                  Row: {
                    "company_id": string,"completed_at": string | null,"created_at": string,"determined_root_cause": string | null,"framework": string,"id": string,"performed_by": string | null,"root_cause_category": string | null,"subject_id": string,"subject_type": string,"updated_at": string,"w5h1_how": string | null,"w5h1_what": string | null,"w5h1_when": string | null,"w5h1_where": string | null,"w5h1_who": string | null,"w5h1_why": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"completed_at"?: string | null,"created_at"?: string,"determined_root_cause"?: string | null,"framework": string,"id"?: string,"performed_by"?: string | null,"root_cause_category"?: string | null,"subject_id": string,"subject_type": string,"updated_at"?: string,"w5h1_how"?: string | null,"w5h1_what"?: string | null,"w5h1_when"?: string | null,"w5h1_where"?: string | null,"w5h1_who"?: string | null,"w5h1_why"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"completed_at"?: string | null,"created_at"?: string,"determined_root_cause"?: string | null,"framework"?: string,"id"?: string,"performed_by"?: string | null,"root_cause_category"?: string | null,"subject_id"?: string,"subject_type"?: string,"updated_at"?: string,"w5h1_how"?: string | null,"w5h1_what"?: string | null,"w5h1_when"?: string | null,"w5h1_where"?: string | null,"w5h1_who"?: string | null,"w5h1_why"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "root_cause_analyses_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"root_cause_categories": {
                  Row: {
                    "category_key": string,"company_id": string,"created_at": string,"id": string,"is_active": boolean,"label": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category_key": string,"company_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label": string,"sort_order"?: number
                  }
                  Update: {
                    "category_key"?: string,"company_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "root_cause_categories_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"root_cause_whys": {
                  Row: {
                    "analysis_id": string,"answer": string | null,"created_at": string,"id": string,"question": string,"seq": number
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_id": string,"answer"?: string | null,"created_at"?: string,"id"?: string,"question": string,"seq": number
                  }
                  Update: {
                    "analysis_id"?: string,"answer"?: string | null,"created_at"?: string,"id"?: string,"question"?: string,"seq"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "root_cause_whys_analysis_id_fkey"
      columns: ["analysis_id"]
isOneToOne: false
      referencedRelation: "root_cause_analyses"
      referencedColumns: ["id"]
    }
                  ]
                },"scenario_attempts": {
                  Row: {
                    "attempted_at": string,"feedback": string | null,"id": string,"passed": boolean | null,"scenario_id": string,"score": number,"user_id": string,"user_response": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempted_at"?: string,"feedback"?: string | null,"id"?: string,"passed"?: boolean | null,"scenario_id": string,"score"?: number,"user_id": string,"user_response": string
                  }
                  Update: {
                    "attempted_at"?: string,"feedback"?: string | null,"id"?: string,"passed"?: boolean | null,"scenario_id"?: string,"score"?: number,"user_id"?: string,"user_response"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "scenario_attempts_scenario_id_fkey"
      columns: ["scenario_id"]
isOneToOne: false
      referencedRelation: "training_scenarios"
      referencedColumns: ["id"]
    }
                  ]
                },"service_accounts": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"name": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"name": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"name"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_accounts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_accounts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"shipment_events": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"event_type": string,"id": string,"location": string | null,"notes": string | null,"occurred_at": string,"shipment_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"event_type": string,"id"?: string,"location"?: string | null,"notes"?: string | null,"occurred_at"?: string,"shipment_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"event_type"?: string,"id"?: string,"location"?: string | null,"notes"?: string | null,"occurred_at"?: string,"shipment_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shipment_events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shipment_events_shipment_id_fkey"
      columns: ["shipment_id"]
isOneToOne: false
      referencedRelation: "shipments"
      referencedColumns: ["id"]
    }
                  ]
                },"shipments": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"declared_value_gbp": number | null,"description": string | null,"destination_country": string,"id": string,"origin_country": string,"recipient_name": string | null,"reference": string,"sender_name": string | null,"service_type": string,"status": string,"updated_at": string,"weight_kg": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"declared_value_gbp"?: number | null,"description"?: string | null,"destination_country"?: string,"id"?: string,"origin_country"?: string,"recipient_name"?: string | null,"reference": string,"sender_name"?: string | null,"service_type"?: string,"status"?: string,"updated_at"?: string,"weight_kg"?: number | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"declared_value_gbp"?: number | null,"description"?: string | null,"destination_country"?: string,"id"?: string,"origin_country"?: string,"recipient_name"?: string | null,"reference"?: string,"sender_name"?: string | null,"service_type"?: string,"status"?: string,"updated_at"?: string,"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "shipments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"facility_zones": {
                  Row: {
                    "alert_owner_after_days": number,"cleaning_sop_ref": string | null,"code": string | null,"company_id": string,"created_at": string,"created_by": string | null,"equipment_refs": (string)[],"escalate_to_qa_after_days": number,"grade": string | null,"id": string,"is_active": boolean,"line_ref": string | null,"name": string,"owner_id": string | null,"site_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alert_owner_after_days"?: number,"cleaning_sop_ref"?: string | null,"code"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"equipment_refs"?: (string)[],"escalate_to_qa_after_days"?: number,"grade"?: string | null,"id"?: string,"is_active"?: boolean,"line_ref"?: string | null,"name": string,"owner_id"?: string | null,"site_id": string,"updated_at"?: string
                  }
                  Update: {
                    "alert_owner_after_days"?: number,"cleaning_sop_ref"?: string | null,"code"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"equipment_refs"?: (string)[],"escalate_to_qa_after_days"?: number,"grade"?: string | null,"id"?: string,"is_active"?: boolean,"line_ref"?: string | null,"name"?: string,"owner_id"?: string | null,"site_id"?: string,"updated_at"?: string
                  }
                  Relationships: []
                },"facility_zone_schedules": {
                  Row: {
                    "action_limit": number | null,"alert_limit": number | null,"company_id": string,"created_at": string,"description": string,"due_time": string | null,"frequency": string,"id": string,"is_active": boolean,"log_type": string,"owner_id": string | null,"result_unit": string | null,"updated_at": string,"zone_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_limit"?: number | null,"alert_limit"?: number | null,"company_id": string,"created_at"?: string,"description": string,"due_time"?: string | null,"frequency": string,"id"?: string,"is_active"?: boolean,"log_type": string,"owner_id"?: string | null,"result_unit"?: string | null,"updated_at"?: string,"zone_id": string
                  }
                  Update: {
                    "action_limit"?: number | null,"alert_limit"?: number | null,"company_id"?: string,"created_at"?: string,"description"?: string,"due_time"?: string | null,"frequency"?: string,"id"?: string,"is_active"?: boolean,"log_type"?: string,"owner_id"?: string | null,"result_unit"?: string | null,"updated_at"?: string,"zone_id"?: string
                  }
                  Relationships: []
                },"facility_log_entries": {
                  Row: {
                    "company_id": string,"created_at": string,"due_at": string | null,"id": string,"linked_deviation_id": string | null,"log_type": string,"notes": string | null,"outcome": string,"performed": boolean,"recorded_at": string,"recorded_by": string | null,"reference": string | null,"result_position": string | null,"result_unit": string | null,"result_value": number | null,"schedule_id": string | null,"zone_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"due_at"?: string | null,"id"?: string,"linked_deviation_id"?: string | null,"log_type": string,"notes"?: string | null,"outcome"?: string,"performed"?: boolean,"recorded_at"?: string,"recorded_by"?: string | null,"reference"?: string | null,"result_position"?: string | null,"result_unit"?: string | null,"result_value"?: number | null,"schedule_id"?: string | null,"zone_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"due_at"?: string | null,"id"?: string,"linked_deviation_id"?: string | null,"log_type"?: string,"notes"?: string | null,"outcome"?: string,"performed"?: boolean,"recorded_at"?: string,"recorded_by"?: string | null,"reference"?: string | null,"result_position"?: string | null,"result_unit"?: string | null,"result_value"?: number | null,"schedule_id"?: string | null,"zone_id"?: string
                  }
                  Relationships: []
                },"sites": {
                  Row: {
                    "address": string | null,"company_id": string,"created_at": string,"id": string,"name": string,"notes": string | null,"product_categories": (string)[],"site_type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"company_id": string,"created_at"?: string,"id"?: string,"name": string,"notes"?: string | null,"product_categories"?: (string)[],"site_type"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"company_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"product_categories"?: (string)[],"site_type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sites_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"social_mentions": {
                  Row: {
                    "ai_analysis": string | null,"ai_recommendation": string | null,"author": string,"author_type": string,"company_id": string,"content": string,"detected_at": string,"flag_type": string | null,"id": string,"platform": string,"resolved_at": string | null,"sentiment": string | null,"severity": string | null,"status": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_analysis"?: string | null,"ai_recommendation"?: string | null,"author": string,"author_type": string,"company_id": string,"content": string,"detected_at"?: string,"flag_type"?: string | null,"id"?: string,"platform": string,"resolved_at"?: string | null,"sentiment"?: string | null,"severity"?: string | null,"status"?: string,"url"?: string | null
                  }
                  Update: {
                    "ai_analysis"?: string | null,"ai_recommendation"?: string | null,"author"?: string,"author_type"?: string,"company_id"?: string,"content"?: string,"detected_at"?: string,"flag_type"?: string | null,"id"?: string,"platform"?: string,"resolved_at"?: string | null,"sentiment"?: string | null,"severity"?: string | null,"status"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "social_mentions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"social_monitoring_rules": {
                  Row: {
                    "active": boolean | null,"company_id": string,"created_at": string,"id": string,"keywords": (string)[],"platform": string,"product": string | null,"rule_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean | null,"company_id": string,"created_at"?: string,"id"?: string,"keywords"?: (string)[],"platform": string,"product"?: string | null,"rule_type": string
                  }
                  Update: {
                    "active"?: boolean | null,"company_id"?: string,"created_at"?: string,"id"?: string,"keywords"?: (string)[],"platform"?: string,"product"?: string | null,"rule_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "social_monitoring_rules_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"son_audits": {
                  Row: {
                    "audit_type": string,"auditor_name": string | null,"company_id": string,"corrective_actions": string | null,"created_at": string | null,"created_by": string | null,"findings": string | null,"id": string,"scheduled_date": string,"status": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "audit_type"?: string,"auditor_name"?: string | null,"company_id": string,"corrective_actions"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"findings"?: string | null,"id"?: string,"scheduled_date": string,"status"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "audit_type"?: string,"auditor_name"?: string | null,"company_id"?: string,"corrective_actions"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"findings"?: string | null,"id"?: string,"scheduled_date"?: string,"status"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "son_audits_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"son_certificates": {
                  Row: {
                    "certificate_number": string,"certificate_type": string,"certificate_url": string | null,"company_id": string,"created_at": string | null,"created_by": string | null,"expiry_date": string,"id": string,"issue_date": string,"nis_standard": string,"notes": string | null,"product_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "certificate_number": string,"certificate_type"?: string,"certificate_url"?: string | null,"company_id": string,"created_at"?: string | null,"created_by"?: string | null,"expiry_date": string,"id"?: string,"issue_date": string,"nis_standard": string,"notes"?: string | null,"product_name": string
                  }
                  Update: {
                    "certificate_number"?: string,"certificate_type"?: string,"certificate_url"?: string | null,"company_id"?: string,"created_at"?: string | null,"created_by"?: string | null,"expiry_date"?: string,"id"?: string,"issue_date"?: string,"nis_standard"?: string,"notes"?: string | null,"product_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "son_certificates_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"son_mancap_applications": {
                  Row: {
                    "application_date": string,"certificate_expiry": string | null,"certificate_number": string | null,"company_id": string,"created_at": string | null,"created_by": string | null,"id": string,"nis_standard": string,"notes": string | null,"product_name": string,"reference_number": string | null,"status": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "application_date": string,"certificate_expiry"?: string | null,"certificate_number"?: string | null,"company_id": string,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"nis_standard": string,"notes"?: string | null,"product_name": string,"reference_number"?: string | null,"status"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "application_date"?: string,"certificate_expiry"?: string | null,"certificate_number"?: string | null,"company_id"?: string,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"nis_standard"?: string,"notes"?: string | null,"product_name"?: string,"reference_number"?: string | null,"status"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "son_mancap_applications_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"sop_acknowledgements": {
                  Row: {
                    "acknowledged_at": string | null,"id": string,"sop_version_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string | null,"id"?: string,"sop_version_id": string,"user_id": string
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"id"?: string,"sop_version_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sop_acknowledgements_sop_version_id_fkey"
      columns: ["sop_version_id"]
isOneToOne: false
      referencedRelation: "sop_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"sop_documents": {
                  Row: {
                    "category": string,"company_id": string,"created_at": string | null,"current_version": string,"department": string,"effective_date": string | null,"id": string,"owner_id": string | null,"review_due_date": string | null,"sop_number": string,"status": string,"title": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"company_id": string,"created_at"?: string | null,"current_version"?: string,"department": string,"effective_date"?: string | null,"id"?: string,"owner_id"?: string | null,"review_due_date"?: string | null,"sop_number": string,"status"?: string,"title": string,"updated_at"?: string | null
                  }
                  Update: {
                    "category"?: string,"company_id"?: string,"created_at"?: string | null,"current_version"?: string,"department"?: string,"effective_date"?: string | null,"id"?: string,"owner_id"?: string | null,"review_due_date"?: string | null,"sop_number"?: string,"status"?: string,"title"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sop_documents_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"sop_versions": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"change_summary": string | null,"content_text": string | null,"created_at": string | null,"created_by": string | null,"effective_date": string | null,"file_name": string | null,"file_url": string | null,"id": string,"sop_id": string,"status": string,"version_number": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"change_summary"?: string | null,"content_text"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"effective_date"?: string | null,"file_name"?: string | null,"file_url"?: string | null,"id"?: string,"sop_id": string,"status"?: string,"version_number": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"change_summary"?: string | null,"content_text"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"effective_date"?: string | null,"file_name"?: string | null,"file_url"?: string | null,"id"?: string,"sop_id"?: string,"status"?: string,"version_number"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sop_versions_sop_id_fkey"
      columns: ["sop_id"]
isOneToOne: false
      referencedRelation: "sop_documents"
      referencedColumns: ["id"]
    }
                  ]
                },"submission_directives": {
                  Row: {
                    "company_id": string,"content": string,"created_at": string,"date_received": string,"id": string,"originating_state_key": string,"raised_by": string | null,"resolved_to_state_key": string | null,"responded_at": string | null,"response_deadline": string | null,"response_notes": string | null,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"content": string,"created_at"?: string,"date_received": string,"id"?: string,"originating_state_key": string,"raised_by"?: string | null,"resolved_to_state_key"?: string | null,"responded_at"?: string | null,"response_deadline"?: string | null,"response_notes"?: string | null,"submission_id": string
                  }
                  Update: {
                    "company_id"?: string,"content"?: string,"created_at"?: string,"date_received"?: string,"id"?: string,"originating_state_key"?: string,"raised_by"?: string | null,"resolved_to_state_key"?: string | null,"responded_at"?: string | null,"response_deadline"?: string | null,"response_notes"?: string | null,"submission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_directives_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submission_directives_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "regulatory_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"submission_status_log": {
                  Row: {
                    "created_at": string,"from_status": string | null,"id": string,"notes": string | null,"submission_id": string,"to_status": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"from_status"?: string | null,"id"?: string,"notes"?: string | null,"submission_id": string,"to_status": string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"from_status"?: string | null,"id"?: string,"notes"?: string | null,"submission_id"?: string,"to_status"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_status_log_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "regulatory_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "address": string | null,"code": string | null,"company_id": string,"contact_email": string | null,"country": string | null,"created_at": string,"created_by": string | null,"id": string,"name": string,"notes": string | null,"qualification_status": string,"qualified_until": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"code"?: string | null,"company_id": string,"contact_email"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"qualification_status"?: string,"qualified_until"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"code"?: string | null,"company_id"?: string,"contact_email"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"qualification_status"?: string,"qualified_until"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"support_tickets": {
                  Row: {
                    "company_id": string | null,"created_at": string,"id": string,"message": string,"severity": string,"status": string,"subject": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"created_at"?: string,"id"?: string,"message": string,"severity"?: string,"status"?: string,"subject": string,"user_id": string
                  }
                  Update: {
                    "company_id"?: string | null,"created_at"?: string,"id"?: string,"message"?: string,"severity"?: string,"status"?: string,"subject"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"targeting_guardrails": {
                  Row: {
                    "active": boolean | null,"company_id": string,"created_at": string,"description": string | null,"guardrail_type": string,"id": string,"name": string,"violations": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean | null,"company_id": string,"created_at"?: string,"description"?: string | null,"guardrail_type": string,"id"?: string,"name": string,"violations"?: number | null
                  }
                  Update: {
                    "active"?: boolean | null,"company_id"?: string,"created_at"?: string,"description"?: string | null,"guardrail_type"?: string,"id"?: string,"name"?: string,"violations"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "targeting_guardrails_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"training_responses": {
                  Row: {
                    "answered_at": string | null,"company_id": string | null,"id": string,"is_correct": boolean,"question_id": string,"selected_answer": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answered_at"?: string | null,"company_id"?: string | null,"id"?: string,"is_correct": boolean,"question_id": string,"selected_answer": number,"user_id": string
                  }
                  Update: {
                    "answered_at"?: string | null,"company_id"?: string | null,"id"?: string,"is_correct"?: boolean,"question_id"?: string,"selected_answer"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"training_scenarios": {
                  Row: {
                    "active": boolean | null,"company_id": string,"correct_response": string,"created_at": string,"description": string,"difficulty": string,"explanation": string,"id": string,"scenario_text": string,"scenario_type": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean | null,"company_id": string,"correct_response": string,"created_at"?: string,"description": string,"difficulty"?: string,"explanation": string,"id"?: string,"scenario_text": string,"scenario_type": string,"title": string
                  }
                  Update: {
                    "active"?: boolean | null,"company_id"?: string,"correct_response"?: string,"created_at"?: string,"description"?: string,"difficulty"?: string,"explanation"?: string,"id"?: string,"scenario_text"?: string,"scenario_type"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "training_scenarios_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"translation_compliance_flags": {
                  Row: {
                    "created_at": string,"id": string,"issue": string,"job_id": string,"market": string | null,"original_claim": string,"rule": string | null,"severity": string,"translated_claim": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"issue": string,"job_id": string,"market"?: string | null,"original_claim": string,"rule"?: string | null,"severity"?: string,"translated_claim": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"issue"?: string,"job_id"?: string,"market"?: string | null,"original_claim"?: string,"rule"?: string | null,"severity"?: string,"translated_claim"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "translation_compliance_flags_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "translation_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"translation_jobs": {
                  Row: {
                    "company_id": string,"completed_at": string | null,"content_title": string,"created_at": string,"created_by": string | null,"id": string,"source_language": string,"status": string,"target_language": string,"target_market": string,"translator": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"completed_at"?: string | null,"content_title": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"source_language"?: string,"status"?: string,"target_language": string,"target_market": string,"translator"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"completed_at"?: string | null,"content_title"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"source_language"?: string,"status"?: string,"target_language"?: string,"target_market"?: string,"translator"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "translation_jobs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"vendor_audits": {
                  Row: {
                    "audit_date": string,"audit_type": string,"auditor": string,"findings": string | null,"id": string,"next_audit_due": string | null,"score": number | null,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audit_date"?: string,"audit_type": string,"auditor": string,"findings"?: string | null,"id"?: string,"next_audit_due"?: string | null,"score"?: number | null,"vendor_id": string
                  }
                  Update: {
                    "audit_date"?: string,"audit_type"?: string,"auditor"?: string,"findings"?: string | null,"id"?: string,"next_audit_due"?: string | null,"score"?: number | null,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_audits_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendor_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"vendor_carrier_profiles": {
                  Row: {
                    "anti_bribery_ack": boolean,"carrier_licence_type": string | null,"created_at": string,"damage_rate": number | null,"due_diligence_completed": boolean,"id": string,"insurance_coverage_gbp": number | null,"insurance_expiry": string | null,"last_due_diligence_date": string | null,"last_mile_areas": (string)[] | null,"notes": string | null,"on_time_delivery_rate": number | null,"route_coverage": Json | null,"shipping_modes": (string)[] | null,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anti_bribery_ack"?: boolean,"carrier_licence_type"?: string | null,"created_at"?: string,"damage_rate"?: number | null,"due_diligence_completed"?: boolean,"id"?: string,"insurance_coverage_gbp"?: number | null,"insurance_expiry"?: string | null,"last_due_diligence_date"?: string | null,"last_mile_areas"?: (string)[] | null,"notes"?: string | null,"on_time_delivery_rate"?: number | null,"route_coverage"?: Json | null,"shipping_modes"?: (string)[] | null,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "anti_bribery_ack"?: boolean,"carrier_licence_type"?: string | null,"created_at"?: string,"damage_rate"?: number | null,"due_diligence_completed"?: boolean,"id"?: string,"insurance_coverage_gbp"?: number | null,"insurance_expiry"?: string | null,"last_due_diligence_date"?: string | null,"last_mile_areas"?: (string)[] | null,"notes"?: string | null,"on_time_delivery_rate"?: number | null,"route_coverage"?: Json | null,"shipping_modes"?: (string)[] | null,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_carrier_profiles_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: true
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"vendor_contracts": {
                  Row: {
                    "auto_renewal": boolean,"breach_penalty_clause": boolean,"company_id": string,"contract_value": number | null,"created_at": string,"created_by": string | null,"currency": string,"expiry_date": string | null,"id": string,"notes": string | null,"notice_period_days": number | null,"risk_score": number,"sla_uptime_pct": number | null,"start_date": string | null,"status": string,"title": string,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_renewal"?: boolean,"breach_penalty_clause"?: boolean,"company_id": string,"contract_value"?: number | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"expiry_date"?: string | null,"id"?: string,"notes"?: string | null,"notice_period_days"?: number | null,"risk_score"?: number,"sla_uptime_pct"?: number | null,"start_date"?: string | null,"status"?: string,"title": string,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "auto_renewal"?: boolean,"breach_penalty_clause"?: boolean,"company_id"?: string,"contract_value"?: number | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"expiry_date"?: string | null,"id"?: string,"notes"?: string | null,"notice_period_days"?: number | null,"risk_score"?: number,"sla_uptime_pct"?: number | null,"start_date"?: string | null,"status"?: string,"title"?: string,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_contracts_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"vendor_documents": {
                  Row: {
                    "created_at": string,"document_type": string,"file_name": string | null,"file_size": number | null,"file_url": string | null,"id": string,"submission_id": string | null,"uploaded_by": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"document_type"?: string,"file_name"?: string | null,"file_size"?: number | null,"file_url"?: string | null,"id"?: string,"submission_id"?: string | null,"uploaded_by": string,"vendor_id": string
                  }
                  Update: {
                    "created_at"?: string,"document_type"?: string,"file_name"?: string | null,"file_size"?: number | null,"file_url"?: string | null,"id"?: string,"submission_id"?: string | null,"uploaded_by"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_documents_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "content_submissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendor_documents_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"vendor_profiles": {
                  Row: {
                    "certification_expiry": string | null,"company_id": string,"compliance_certified": boolean | null,"contact_email": string | null,"created_at": string,"id": string,"overall_score": number | null,"risk_tier": string | null,"status": string,"vendor_name": string,"vendor_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "certification_expiry"?: string | null,"company_id": string,"compliance_certified"?: boolean | null,"contact_email"?: string | null,"created_at"?: string,"id"?: string,"overall_score"?: number | null,"risk_tier"?: string | null,"status"?: string,"vendor_name": string,"vendor_type": string
                  }
                  Update: {
                    "certification_expiry"?: string | null,"company_id"?: string,"compliance_certified"?: boolean | null,"contact_email"?: string | null,"created_at"?: string,"id"?: string,"overall_score"?: number | null,"risk_tier"?: string | null,"status"?: string,"vendor_name"?: string,"vendor_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_profiles_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"vendor_questionnaires": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"id": string,"questionnaire_type": string,"sent_at": string | null,"status": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"id"?: string,"questionnaire_type"?: string,"sent_at"?: string | null,"status"?: string,"vendor_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"id"?: string,"questionnaire_type"?: string,"sent_at"?: string | null,"status"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_questionnaires_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"vendor_risk_profiles": {
                  Row: {
                    "data_access_level": string,"id": string,"last_review_date": string | null,"next_review_date": string | null,"risk_score": number,"risk_tier": string,"security_review_status": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "data_access_level"?: string,"id"?: string,"last_review_date"?: string | null,"next_review_date"?: string | null,"risk_score"?: number,"risk_tier"?: string,"security_review_status"?: string,"vendor_id": string
                  }
                  Update: {
                    "data_access_level"?: string,"id"?: string,"last_review_date"?: string | null,"next_review_date"?: string | null,"risk_score"?: number,"risk_tier"?: string,"security_review_status"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_risk_profiles_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: true
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"vendors": {
                  Row: {
                    "category": string,"company_id": string,"created_at": string,"id": string,"name": string,"primary_contact": string | null,"risk_level": string,"status": string,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"company_id": string,"created_at"?: string,"id"?: string,"name": string,"primary_contact"?: string | null,"risk_level"?: string,"status"?: string,"website"?: string | null
                  }
                  Update: {
                    "category"?: string,"company_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"primary_contact"?: string | null,"risk_level"?: string,"status"?: string,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_vendors_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"violation_trends": {
                  Row: {
                    "category": string,"company_id": string,"created_at": string,"id": string,"period_end": string,"period_start": string,"severity_breakdown": NonNullable<Json>,"top_phrases": NonNullable<Json>,"updated_at": string,"violation_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"company_id": string,"created_at"?: string,"id"?: string,"period_end": string,"period_start": string,"severity_breakdown"?: NonNullable<Json>,"top_phrases"?: NonNullable<Json>,"updated_at"?: string,"violation_count"?: number
                  }
                  Update: {
                    "category"?: string,"company_id"?: string,"created_at"?: string,"id"?: string,"period_end"?: string,"period_start"?: string,"severity_breakdown"?: NonNullable<Json>,"top_phrases"?: NonNullable<Json>,"updated_at"?: string,"violation_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "violation_trends_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"waitlist_signups": {
                  Row: {
                    "company": string | null,"created_at": string,"email": string,"full_name": string | null,"id": string,"industry": string | null,"intent": string | null,"notes": string | null,"role": string | null,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company"?: string | null,"created_at"?: string,"email": string,"full_name"?: string | null,"id"?: string,"industry"?: string | null,"intent"?: string | null,"notes"?: string | null,"role"?: string | null,"source": string
                  }
                  Update: {
                    "company"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"industry"?: string | null,"intent"?: string | null,"notes"?: string | null,"role"?: string | null,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"watchdog_alerts": {
                  Row: {
                    "circular_id": string | null,"content_id": string,"created_at": string | null,"id": string,"matched_phrases": Json | null,"regulation_id": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": string | null,"trigger_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "circular_id"?: string | null,"content_id": string,"created_at"?: string | null,"id"?: string,"matched_phrases"?: Json | null,"regulation_id"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string | null,"trigger_type": string
                  }
                  Update: {
                    "circular_id"?: string | null,"content_id"?: string,"created_at"?: string | null,"id"?: string,"matched_phrases"?: Json | null,"regulation_id"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string | null,"trigger_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "watchdog_alerts_circular_id_fkey"
      columns: ["circular_id"]
isOneToOne: false
      referencedRelation: "regulatory_circulars"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "watchdog_alerts_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content_submissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "watchdog_alerts_regulation_id_fkey"
      columns: ["regulation_id"]
isOneToOne: false
      referencedRelation: "regulations"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_deliveries": {
                  Row: {
                    "attempt_count": number,"company_id": string,"created_at": string,"endpoint_id": string,"error_message": string | null,"event_name": string,"id": string,"last_attempt_at": string | null,"next_attempt_at": string | null,"payload": NonNullable<Json>,"related_entity_id": string | null,"related_entity_type": string | null,"response_body_preview": string | null,"response_status": number | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_count"?: number,"company_id": string,"created_at"?: string,"endpoint_id": string,"error_message"?: string | null,"event_name": string,"id"?: string,"last_attempt_at"?: string | null,"next_attempt_at"?: string | null,"payload"?: NonNullable<Json>,"related_entity_id"?: string | null,"related_entity_type"?: string | null,"response_body_preview"?: string | null,"response_status"?: number | null,"status": string
                  }
                  Update: {
                    "attempt_count"?: number,"company_id"?: string,"created_at"?: string,"endpoint_id"?: string,"error_message"?: string | null,"event_name"?: string,"id"?: string,"last_attempt_at"?: string | null,"next_attempt_at"?: string | null,"payload"?: NonNullable<Json>,"related_entity_id"?: string | null,"related_entity_type"?: string | null,"response_body_preview"?: string | null,"response_status"?: number | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "webhook_deliveries_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
      columns: ["endpoint_id"]
isOneToOne: false
      referencedRelation: "webhook_endpoints"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_endpoints": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"enabled": boolean,"id": string,"name": string,"secret_prefix": string,"signing_secret_encrypted": string,"target_url": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"enabled"?: boolean,"id"?: string,"name": string,"secret_prefix": string,"signing_secret_encrypted": string,"target_url": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"enabled"?: boolean,"id"?: string,"name"?: string,"secret_prefix"?: string,"signing_secret_encrypted"?: string,"target_url"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "webhook_endpoints_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "webhook_endpoints_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_subscriptions": {
                  Row: {
                    "company_id": string,"created_at": string,"enabled": boolean,"endpoint_id": string,"event_name": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"enabled"?: boolean,"endpoint_id": string,"event_name": string,"id"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"enabled"?: boolean,"endpoint_id"?: string,"event_name"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "webhook_subscriptions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "webhook_subscriptions_endpoint_id_fkey"
      columns: ["endpoint_id"]
isOneToOne: false
      referencedRelation: "webhook_endpoints"
      referencedColumns: ["id"]
    }
                  ]
                },"whistleblower_case_updates": {
                  Row: {
                    "action": string,"created_at": string,"id": string,"note": string | null,"performed_by": string,"report_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"id"?: string,"note"?: string | null,"performed_by": string,"report_id": string
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"id"?: string,"note"?: string | null,"performed_by"?: string,"report_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "whistleblower_case_updates_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "whistleblower_reports"
      referencedColumns: ["id"]
    }
                  ]
                },"whistleblower_reports": {
                  Row: {
                    "anonymous": boolean | null,"case_number": string,"category": string,"company_id": string,"description": string,"id": string,"last_updated_at": string,"priority": string,"status": string,"subject": string,"submitted_at": string,"submitted_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "anonymous"?: boolean | null,"case_number": string,"category": string,"company_id": string,"description": string,"id"?: string,"last_updated_at"?: string,"priority"?: string,"status"?: string,"subject": string,"submitted_at"?: string,"submitted_by"?: string | null
                  }
                  Update: {
                    "anonymous"?: boolean | null,"case_number"?: string,"category"?: string,"company_id"?: string,"description"?: string,"id"?: string,"last_updated_at"?: string,"priority"?: string,"status"?: string,"subject"?: string,"submitted_at"?: string,"submitted_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "whistleblower_reports_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_frameworks": {
                  Row: {
                    "company_id": string,"enabled_at": string,"enabled_by": string | null,"framework_id": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"enabled_at"?: string,"enabled_by"?: string | null,"framework_id": string,"id"?: string
                  }
                  Update: {
                    "company_id"?: string,"enabled_at"?: string,"enabled_by"?: string | null,"framework_id"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_frameworks_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_frameworks_framework_id_fkey"
      columns: ["framework_id"]
isOneToOne: false
      referencedRelation: "regulatory_frameworks"
      referencedColumns: ["id"]
    }
                  ]
                },"yield_reconciliation_configs": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"formula_stage_id": string | null,"id": string,"input_unit": string,"notes": string | null,"output_per_input": number,"output_unit": string,"product_id": string,"theoretical_basis": string,"updated_at": string,"variance_threshold_pct": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"formula_stage_id"?: string | null,"id"?: string,"input_unit": string,"notes"?: string | null,"output_per_input"?: number,"output_unit": string,"product_id": string,"theoretical_basis": string,"updated_at"?: string,"variance_threshold_pct": number
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"formula_stage_id"?: string | null,"id"?: string,"input_unit"?: string,"notes"?: string | null,"output_per_input"?: number,"output_unit"?: string,"product_id"?: string,"theoretical_basis"?: string,"updated_at"?: string,"variance_threshold_pct"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "yield_reconciliation_configs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "yield_reconciliation_configs_formula_stage_id_fkey"
      columns: ["formula_stage_id"]
isOneToOne: false
      referencedRelation: "master_formula_stages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "yield_reconciliation_configs_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "access_grants_active": {
                  Row: {
                    "company_id": string | null,"granted_at": string | null,"granted_by": string | null,"id": string | null,"level": string | null,"request_id": string | null,"revoke_reason": string | null,"revoked_at": string | null,"revoked_by": string | null,"scope": string | null,"section_key": string | null,"user_id": string | null,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "company_id"?: string | null,"granted_at"?: string | null,"granted_by"?: string | null,"id"?: string | null,"level"?: string | null,"request_id"?: string | null,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"scope"?: string | null,"section_key"?: string | null,"user_id"?: string | null,"valid_until"?: string | null
                         }
                        Update: {
                           "company_id"?: string | null,"granted_at"?: string | null,"granted_by"?: string | null,"id"?: string | null,"level"?: string | null,"request_id"?: string | null,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"scope"?: string | null,"section_key"?: string | null,"user_id"?: string | null,"valid_until"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "access_grants_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_grants_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "access_permission_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_grants_section_key_fkey"
      columns: ["section_key"]
isOneToOne: false
      referencedRelation: "access_sections"
      referencedColumns: ["key"]
    }
                  ]
                },"master_formula_current": {
                  Row: {
                    "approved_at": string | null,"batch_size": number | null,"batch_size_unit": string | null,"company_id": string | null,"dosage_form": string | null,"effective_date": string | null,"expected_yield_pct": number | null,"formula_id": string | null,"generic_name": string | null,"machine_settings": number | null,"material_lines": number | null,"product_attributes": number | null,"product_code": string | null,"product_id": string | null,"stages": number | null,"strength": string | null,"trade_name": string | null,"version": string | null,"yield_max_pct": number | null,"yield_min_pct": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "master_formulas_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "master_formulas_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"material_coa_discrepancies_pending_deviation": {
                  Row: {
                    "certificate_id": string | null,"company_id": string | null,"detected_at": string | null,"deviation_id": string | null,"discrepancy_type": string | null,"id": string | null,"is_critical": boolean | null,"material_lot_id": string | null,"parameter": string | null,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"specification_limit": string | null,"stated_value": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "certificate_id"?: string | null,"company_id"?: string | null,"detected_at"?: string | null,"deviation_id"?: string | null,"discrepancy_type"?: string | null,"id"?: string | null,"is_critical"?: boolean | null,"material_lot_id"?: string | null,"parameter"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"specification_limit"?: string | null,"stated_value"?: string | null
                         }
                        Update: {
                           "certificate_id"?: string | null,"company_id"?: string | null,"detected_at"?: string | null,"deviation_id"?: string | null,"discrepancy_type"?: string | null,"id"?: string | null,"is_critical"?: boolean | null,"material_lot_id"?: string | null,"parameter"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"specification_limit"?: string | null,"stated_value"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "material_coa_disc_deviation_fkey"
      columns: ["deviation_id"]
isOneToOne: false
      referencedRelation: "deviations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_coa_discrepancies_certificate_id_fkey"
      columns: ["certificate_id"]
isOneToOne: false
      referencedRelation: "material_certificates_of_analysis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_coa_discrepancies_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_coa_discrepancies_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_coa_discrepancies_material_lot_id_fkey"
      columns: ["material_lot_id"]
isOneToOne: false
      referencedRelation: "material_lots_conditionally_released"
      referencedColumns: ["material_lot_id"]
    }
                  ]
                },"material_lots_conditionally_released": {
                  Row: {
                    "authorised_by": string | null,"company_id": string | null,"justification": string | null,"lot_number": string | null,"material_lot_id": string | null,"material_name": string | null,"released_at": string | null,"released_by": string | null,"status": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "material_lots_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"materials_security_posture": {
                  Row: {
                    "anon_can_select": boolean | null,"commands_policed": number | null,"has_company_id": boolean | null,"rls_enabled": boolean | null,"table_name": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_audit_velocity": {
                  Row: {
                    "audit_session_id": string | null,"company_id": string | null,"fulfilled_requests": number | null,"session_name": string | null,"total_requests": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "audit_requests_audit_session_id_fkey"
      columns: ["audit_session_id"]
isOneToOne: false
      referencedRelation: "audit_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fk_audit_requests_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"v_policy_compliance_stats": {
                  Row: {
                    "acknowledged_users": number | null,"company_id": string | null,"compliance_rate": number | null,"policy_id": string | null,"policy_title": string | null,"total_users": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_vendor_risk_exposure": {
                  Row: {
                    "avg_risk_score": number | null,"category": string | null,"company_id": string | null,"vendor_count": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "fk_vendors_company"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "facility_log_register":
{ Args: { "p_company_id": string }; Returns: {
                             "schedule_id": string,"zone_id": string,"zone_name": string,"zone_grade": string | null,"zone_line_ref": string | null,"log_type": string,"description": string,"frequency": string,"due_time": string | null,"alert_limit": number | null,"action_limit": number | null,"result_unit": string | null,"last_entry_id": string | null,"last_recorded_at": string | null,"last_result_value": number | null,"last_result_position": string | null,"last_outcome": string | null,"last_reference": string | null,"days_since_last": number | null
                           }[]
                           },
"facility_log_outcome":
{ Args: { "p_performed": boolean,"p_result_value": number,"p_alert_limit": number,"p_action_limit": number }; Returns: string
                           },
"facility_site_options":
{ Args: { "p_company_id": string }; Returns: {
                             "id": string,"name": string,"site_type": string
                           }[]
                           },
            "_cc":
{ Args: { "p_detail"?: string,"p_name": string,"p_ok": boolean,"p_section": string }; Returns: undefined
                           },
"_ck":
{ Args: { "p_detail"?: string,"p_name": string,"p_ok": boolean,"p_section": string }; Returns: undefined
                           },
"_dk":
{ Args: { "p_detail"?: string,"p_name": string,"p_ok": boolean,"p_section": string }; Returns: undefined
                           },
"_fk":
{ Args: { "p_detail"?: string,"p_name": string,"p_ok": boolean,"p_section": string }; Returns: undefined
                           },
"_i12k":
{ Args: { "p_detail"?: string,"p_name": string,"p_ok": boolean,"p_section": string }; Returns: undefined
                           },
"_qk":
{ Args: { "p_detail"?: string,"p_name": string,"p_ok": boolean,"p_section": string }; Returns: undefined
                           },
"_r6k":
{ Args: { "p_detail"?: string,"p_name": string,"p_ok": boolean,"p_section": string }; Returns: undefined
                           },
"_sk":
{ Args: { "p_detail"?: string,"p_name": string,"p_ok": boolean,"p_section": string }; Returns: undefined
                           },
"_vsk":
{ Args: { "p_detail"?: string,"p_name": string,"p_ok": boolean,"p_section": string }; Returns: undefined
                           },
"acc_as":
{ Args: { "p_user": string }; Returns: undefined
                           },
"acc_assert":
{ Args: { "p_cond": boolean,"p_detail"?: string,"p_id": string,"p_name": string }; Returns: undefined
                           },
"acc_raises":
{ Args: { "p_expect"?: string,"p_sql": string }; Returns: boolean
                           },
"accept_company_invite":
{ Args: { "p_token": string }; Returns: Json
                           },
"access_conflict":
{ Args: { "p_company_id": string,"p_level": string,"p_section_key": string,"p_work_role": string }; Returns: {
              "instead_ask": string,"reason": string
            }[]
                           },
"access_decide":
{ Args: { "p_decision": string,"p_level"?: string,"p_note"?: string,"p_request_id": string,"p_scope"?: string,"p_until"?: string }; Returns: {
              "company_id": string,
"created_at": string,
"decided_at": string | null,
"decided_by": string | null,
"decision_note": string | null,
"granted_level": string | null,
"granted_scope": string | null,
"granted_until": string | null,
"id": string,
"level": string,
"reason": string,
"reference": string,
"requested_by": string,
"requested_until": string | null,
"scope": string,
"section_key": string,
"status": string,
"work_role": string
            }
                          SetofOptions: {
        from: "*"
        to: "access_permission_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"access_grant_revoke":
{ Args: { "p_grant_id": string,"p_reason": string }; Returns: {
              "company_id": string,
"granted_at": string,
"granted_by": string,
"id": string,
"level": string,
"request_id": string | null,
"revoke_reason": string | null,
"revoked_at": string | null,
"revoked_by": string | null,
"scope": string,
"section_key": string,
"user_id": string,
"valid_until": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "access_grants"
        isOneToOne: true
        isSetofReturn: false
      } },
"access_max_grant_days":
{ Args: { "p_company_id": string }; Returns: number
                           },
"access_request_raise":
{ Args: { "p_company_id": string,"p_level": string,"p_reason": string,"p_scope": string,"p_section_key": string,"p_until": string,"p_work_role": string }; Returns: {
              "company_id": string,
"created_at": string,
"decided_at": string | null,
"decided_by": string | null,
"decision_note": string | null,
"granted_level": string | null,
"granted_scope": string | null,
"granted_until": string | null,
"id": string,
"level": string,
"reason": string,
"reference": string,
"requested_by": string,
"requested_until": string | null,
"scope": string,
"section_key": string,
"status": string,
"work_role": string
            }
                          SetofOptions: {
        from: "*"
        to: "access_permission_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"allergen_codex_list":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"app_current_profile_company":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"app_current_profile_role":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"app_has_company_role":
{ Args: { "p_company_id": string,"p_roles": (string)[],"p_user_id"?: string }; Returns: boolean
                           },
"app_is_company_member":
{ Args: { "p_company_id": string,"p_user_id"?: string }; Returns: boolean
                           },
"app_is_service_context":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"app_signin_is_allowed":
{ Args: { "p_email": string }; Returns: boolean
                           },
"backfill_product_registry":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"access_restrict":
{ Args: { "p_company_id": string,"p_user_id": string,"p_section": string,"p_to_level": string,"p_reason": string,"p_until"?: string }; Returns: string
                           },
"access_restriction_lift":
{ Args: { "p_restriction_id": string,"p_reason": string }; Returns: undefined
                           },
"operational_role_assign":
{ Args: { "p_company_id": string,"p_user_id": string,"p_role": string,"p_reason": string,"p_signature_id"?: string }; Returns: string
                           },
"operational_role_revoke":
{ Args: { "p_assignment_id": string,"p_reason": string,"p_signature_id"?: string }; Returns: undefined
                           },
"quality_verdict_sign":
{ Args: { "p_action": string,"p_company_id": string,"p_record_id": string,"p_subject": string,"p_result": string,"p_pass": boolean,"p_password": string,"p_reason"?: string }; Returns: Json
                           },
"quality_action_needs_signature":
{ Args: { "p_action": string }; Returns: boolean
                           },
"operational_role_stranded_work":
{ Args: { "p_company_id": string }; Returns: {
              "entity_type": string,"entity_id": string,"state_key": string,"section": string,"last_actor": string,"last_acted_at": string,"roles_lost": string[],"roles_remaining": string[],"reassigned_to": string,"reassigned_at": string,"still_stranded": boolean
            }[]
                           },
"stranded_work_reassign":
{ Args: { "p_company_id": string,"p_entity_type": string,"p_entity_id": string,"p_to_user": string,"p_reason": string }; Returns: string
                           },
"duty_decisions_outstanding":
{ Args: Record<PropertyKey, never>; Returns: {
              "decision": string,"scope": string,"pair": string,"enforced": boolean,"decision_status": string,"derivable": boolean,"note": string
            }[]
                           },
"operational_role_sign":
{ Args: { "p_company_id": string,"p_user_id": string,"p_role": string,"p_action": string,"p_password": string,"p_assignment_id"?: string,"p_reason"?: string }; Returns: Json
                           },
"operational_role_bootstrap":
{ Args: { "p_company_id": string,"p_role": string,"p_declaration": string,"p_signature_id": string }; Returns: string
                           },
"operational_role_unsigned_grants":
{ Args: { "p_company_id": string }; Returns: {
              "assignment_id": string,"user_id": string,"role": string,"provenance": string,"reason": string,"declaration": string,"assigned_at": string,"still_live": boolean,"finding": string
            }[]
                           },
"operational_role_needs_signature":
{ Args: { "p_role": string }; Returns: boolean
                           },
"material_lot_actor_duties":
{ Args: { "p_lot_id": string,"p_user_id": string }; Returns: string[]
                           },
"duty_conflict":
{ Args: { "p_scope": string,"p_entity_id": string,"p_duty": string,"p_user_id"?: string }; Returns: string
                           },
"app_work_roles":
{ Args: { "p_company_id": string,"p_user_id"?: string }; Returns: string[]
                           },
"app_has_work_role":
{ Args: { "p_company_id": string,"p_role": string,"p_user_id"?: string }; Returns: boolean
                           },
"batch_actor_duties":
{ Args: { "p_batch_id": string,"p_user_id": string }; Returns: string[]
                           },
"batch_duty_conflict":
{ Args: { "p_batch_id": string,"p_duty": string,"p_user_id"?: string }; Returns: string
                           },
"product_specification_approve":
{ Args: { "p_specification_id": string,"p_effective_date"?: string,"p_signature_id"?: string }; Returns: Json
                           },
"product_specification_sign":
{ Args: { "p_specification_id": string,"p_password": string,"p_reason"?: string }; Returns: Json
                           },
"product_specification_record_hash":
{ Args: { "p_specification_id": string }; Returns: string
                           },
"batch_governing_specification":
{ Args: { "p_batch_id": string }; Returns: string
                           },
"batch_release_block_reason":
{ Args: { "p_batch_id": string }; Returns: string
                           },
"batch_release_conditions":
{ Args: { "p_batch_id": string }; Returns: {
              "condition_key": string,"continue_with": string,"detail": string,"severity": string,"sort_order": number,"title": string
            }[]
                           },
"batch_record_assign_line":
{ Args: { "p_batch_id": string,"p_line_id": string }; Returns: Json
                           },
"batch_record_close":
{ Args: { "p_batch_id": string,"p_comment"?: string }; Returns: Json
                           },
"batch_record_initiate":
{ Args: { "p_batch_number": string,"p_batch_size": number,"p_company_id": string,"p_customer_name"?: string,"p_expiry_date": string,"p_formula_id"?: string,"p_manufacturing_date": string,"p_product_id": string,"p_unit"?: string }; Returns: Json
                           },
"batch_stage_complete":
{ Args: { "p_operator_signature_id": string,"p_stage_id": string,"p_verifier_id"?: string,"p_verifier_signature_id"?: string }; Returns: Json
                           },
"batch_stage_completion_blockers":
{ Args: { "p_stage_id": string }; Returns: {
              "blocker_key": string,"detail": string,"sort_order": number,"title": string
            }[]
                           },
"batch_stage_context":
{ Args: { "p_stage_id": string }; Returns: {
              "batch_id": string,"closed_at": string,"company_id": string,"operator_id": string,"requires_verifier": boolean,"sequence_no": number,"stage_id": string,"status": string
            }[]
                           },
"batch_stage_correct_reading":
{ Args: { "p_reading_id": string,"p_reading_text": string,"p_reading_value": number,"p_reason": string }; Returns: Json
                           },
"batch_stage_record_reading":
{ Args: { "p_formula_parameter_id": string,"p_oos_acknowledged"?: boolean,"p_reading_text"?: string,"p_reading_value"?: number,"p_stage_id": string }; Returns: Json
                           },
"batch_stage_reopen":
{ Args: { "p_reason": string,"p_stage_id": string }; Returns: Json
                           },
"batch_stage_sign_operator":
{ Args: { "p_signature_id": string,"p_stage_id": string }; Returns: Json
                           },
"batch_stage_start":
{ Args: { "p_stage_id": string }; Returns: Json
                           },
"batch_stage_strip":
{ Args: { "p_batch_id": string }; Returns: {
              "name": string,"operator_id": string,"readings_out_of_spec": number,"readings_recorded": number,"readings_total": number,"requires_verifier": boolean,"sequence_no": number,"signed_by_operator": boolean,"signed_by_verifier": boolean,"stage_id": string,"state": string,"status": string,"verifier_id": string,"waiting_for": string
            }[]
                           },
"batch_stage_verify":
{ Args: { "p_signature_id": string,"p_stage_id": string }; Returns: Json
                           },
"calibration_document_allowed_types":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"calibration_document_max_bytes":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"cap_assert":
{ Args: { "p_cond": boolean,"p_detail"?: string,"p_id": string,"p_name": string }; Returns: undefined
                           },
"capa_open_for_batch":
{ Args: { "p_batch_id": string,"p_company_id": string }; Returns: {
              "affects_batch": boolean,"capa_number": string,"id": string,"is_systemic": boolean,"priority": string,"state_key": string,"title": string
            }[]
                           },
"capa_raise_from_deviation":
{ Args: { "p_capa_type"?: string,"p_deviation_id": string,"p_due_date"?: string,"p_is_systemic"?: boolean,"p_priority"?: string,"p_title"?: string }; Returns: {
              "batch_id": string | null,
"capa_number": string,
"capa_type": string,
"closed_at": string | null,
"company_id": string,
"control_code": string | null,
"control_id": string | null,
"created_at": string,
"created_by": string | null,
"description": string,
"due_date": string | null,
"id": string,
"is_systemic": boolean,
"owner_name": string | null,
"priority": string,
"root_cause": string | null,
"source": string,
"source_deviation_id": string | null,
"source_risk_id": string | null,
"status": string,
"title": string
            }
                          SetofOptions: {
        from: "*"
        to: "capa_records"
        isOneToOne: true
        isSetofReturn: false
      } },
"claim_ai_jobs":
{ Args: { "p_limit"?: number,"p_worker"?: string }; Returns: {
              "attempts": number,
"company_id": string | null,
"created_at": string,
"id": string,
"job_type": string,
"last_error": string | null,
"locked_at": string | null,
"locked_by": string | null,
"max_attempts": number,
"payload": NonNullable<Json>,
"result": Json | null,
"run_at": string,
"status": string,
"submission_id": string | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "ai_jobs"
        isOneToOne: false
        isSetofReturn: true
      } },
"company_rca_settings_effective":
{ Args: { "p_company_id": string }; Returns: {
              "configured": boolean,"default_framework": string,"undetermined_blocks_release": boolean
            }[]
                           },
"complete_ai_job":
{ Args: { "p_error"?: string,"p_job_id": string,"p_result"?: Json,"p_status"?: string }; Returns: undefined
                           },
"create_company":
{ Args: { "p_name": string }; Returns: string
                           },
"create_company_invite":
{ Args: { "p_company_id": string,"p_department_id"?: string,"p_email": string,"p_expires_in_hours"?: number,"p_module_access"?: (string)[],"p_role"?: string }; Returns: {
              "expires_at": string,"invite_id": string,"raw_token": string
            }[]
                           },
"create_content_version":
{ Args: { "p_company_id"?: string,"p_content_id": string,"p_content_text": string,"p_note"?: string }; Returns: Json
                           },
"create_vault_pin":
{ Args: { "pin": string }; Returns: boolean
                           },
"dblink":
{ Args: { "": string }; Returns: Record<string, unknown>[]
                           },
"dblink_cancel_query":
{ Args: { "": string }; Returns: string
                           },
"dblink_close":
{ Args: { "": string }; Returns: string
                           },
"dblink_connect":
{ Args: { "": string }; Returns: string
                           },
"dblink_connect_u":
{ Args: { "": string }; Returns: string
                           },
"dblink_current_query":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"dblink_disconnect":
{ Args: Record<PropertyKey, never>; Returns: string
                           } |
{ Args: { "": string }; Returns: string
                           },
"dblink_error_message":
{ Args: { "": string }; Returns: string
                           },
"dblink_exec":
{ Args: { "": string }; Returns: string
                           },
"dblink_fdw_validator":
{ Args: { "catalog": unknown,"options": (string)[] }; Returns: undefined
                           },
"dblink_get_connections":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"dblink_get_notify":
{ Args: { "conname": string }; Returns: Record<string, unknown>[]
                           } |
{ Args: Record<PropertyKey, never>; Returns: Record<string, unknown>[]
                           },
"dblink_get_pkey":
{ Args: { "": string }; Returns: Database["public"]['CompositeTypes']["dblink_pkey_results"][]
                          SetofOptions: {
        from: "*"
        to: "dblink_pkey_results"
        isOneToOne: false
        isSetofReturn: true
      } },
"dblink_get_result":
{ Args: { "": string }; Returns: Record<string, unknown>[]
                           },
"dblink_is_busy":
{ Args: { "": string }; Returns: number
                           },
"demo_company_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"demo_marker":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"demo_reset_pharma_manufacturer":
{ Args: { "p_company_id"?: string }; Returns: Json
                           },
"demo_seed_pharma_manufacturer":
{ Args: { "p_actor_id": string,"p_as_of"?: string,"p_company_id"?: string }; Returns: Json
                           },
"dev_assert":
{ Args: { "p_cond": boolean,"p_detail"?: string,"p_id": string,"p_name": string }; Returns: undefined
                           },
"deviation_closure_readiness":
{ Args: { "p_deviation_id": string }; Returns: {
              "blocking": boolean,"condition_key": string,"detail": string,"met": boolean,"sort_order": number,"title": string
            }[]
                           },
"deviation_entry_point_spec":
{ Args: Record<PropertyKey, never>; Returns: {
              "entry_point": string,"implemented_by": string,"kind": string,"prefills": string,"raised_from": string,"sort_order": number,"source_type": string
            }[]
                           },
"deviation_from_coa_discrepancy":
{ Args: { "p_discrepancy_id": string,"p_impact"?: string,"p_severity"?: string }; Returns: {
              "closed_at": string | null,
"company_id": string,
"containment": string | null,
"description": string | null,
"deviation_number": string,
"entry_point": string,
"id": string,
"immediate_action": string | null,
"investigation_due_date": string | null,
"investigation_owner": string | null,
"product_quality_impact": string,
"raised_at": string,
"raised_by": string | null,
"severity": string,
"source_id": string | null,
"source_type": string,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "deviations"
        isOneToOne: true
        isSetofReturn: false
      } },
"deviation_from_inprocess_reading":
{ Args: { "p_impact"?: string,"p_reading_id": string,"p_severity"?: string }; Returns: {
              "closed_at": string | null,
"company_id": string,
"containment": string | null,
"description": string | null,
"deviation_number": string,
"entry_point": string,
"id": string,
"immediate_action": string | null,
"investigation_due_date": string | null,
"investigation_owner": string | null,
"product_quality_impact": string,
"raised_at": string,
"raised_by": string | null,
"severity": string,
"source_id": string | null,
"source_type": string,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "deviations"
        isOneToOne: true
        isSetofReturn: false
      } },
"deviation_from_qc_result":
{ Args: { "p_impact"?: string,"p_result_id": string,"p_severity"?: string }; Returns: {
              "closed_at": string | null,
"company_id": string,
"containment": string | null,
"description": string | null,
"deviation_number": string,
"entry_point": string,
"id": string,
"immediate_action": string | null,
"investigation_due_date": string | null,
"investigation_owner": string | null,
"product_quality_impact": string,
"raised_at": string,
"raised_by": string | null,
"severity": string,
"source_id": string | null,
"source_type": string,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "deviations"
        isOneToOne: true
        isSetofReturn: false
      } },
"deviation_impact_consequence":
{ Args: { "p_company_id": string,"p_source_id"?: string,"p_source_type": string }; Returns: {
              "consequence": string,"effect": string,"impact": string,"label": string,"sort_order": number
            }[]
                           },
"deviation_open_for_batch":
{ Args: { "p_batch_id": string,"p_company_id": string }; Returns: {
              "attached_as": string,"deviation_number": string,"id": string,"product_quality_impact": string,"severity": string,"state_key": string,"title": string
            }[]
                           },
"deviation_raise":
{ Args: { "p_company_id": string,"p_containment"?: string,"p_description"?: string,"p_entry_point"?: string,"p_immediate_action"?: string,"p_investigation_due_date"?: string,"p_investigation_owner"?: string,"p_product_quality_impact": string,"p_severity": string,"p_source_id"?: string,"p_source_type": string,"p_title": string }; Returns: {
              "closed_at": string | null,
"company_id": string,
"containment": string | null,
"description": string | null,
"deviation_number": string,
"entry_point": string,
"id": string,
"immediate_action": string | null,
"investigation_due_date": string | null,
"investigation_owner": string | null,
"product_quality_impact": string,
"raised_at": string,
"raised_by": string | null,
"severity": string,
"source_id": string | null,
"source_type": string,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "deviations"
        isOneToOne: true
        isSetofReturn: false
      } },
"deviation_register":
{ Args: { "p_company_id": string,"p_include_closed"?: boolean }; Returns: {
              "closed_at": string,"days_overdue": number,"deviation_number": string,"id": string,"investigation_due_date": string,"investigation_owner": string,"is_overdue": boolean,"linked_capa_count": number,"product_quality_impact": string,"raised_at": string,"severity": string,"sort_order": number,"source_id": string,"source_label": string,"source_type": string,"state_key": string,"state_label": string,"title": string
            }[]
                           },
"dispensable_lots":
{ Args: { "p_batch_id": string,"p_material_id": string }; Returns: {
              "lot_id": string,"lot_number": string,"quantity_available": number,"retest_due_date": string,"supplier_expiry_date": string,"unit_of_measure": string
            }[]
                           },
"dispensing_block_reason":
{ Args: { "p_batch_id": string,"p_material_lot_id": string,"p_quantity"?: number }; Returns: string
                           },
"dispensing_conditions":
{ Args: { "p_batch_id": string,"p_material_lot_id": string,"p_quantity"?: number }; Returns: {
              "condition_key": string,"continue_with": string,"detail": string,"severity": string,"sort_order": number,"title": string
            }[]
                           },
"electronic_signature_record_hash":
{ Args: { "p_company_id": string,"p_entity_id": string,"p_entity_type": string }; Returns: string
                           },
"ensure_system_roles":
{ Args: { "p_company_id": string }; Returns: undefined
                           },
"get_company_activity_feed":
{ Args: { "p_company_id": string,"p_limit"?: number }; Returns: {
              "action": string,"created_at": string,"entity_id": string,"entity_type": string,"id": string,"metadata": Json,"user_id": string,"user_name": string
            }[]
                           },
"get_company_dashboard_breakdown":
{ Args: { "p_company_id": string,"p_jurisdiction"?: string }; Returns: Json
                           },
"get_company_dashboard_metrics":
{ Args: { "p_company_id": string }; Returns: Json
                           },
"get_company_dashboard_trends":
{ Args: { "p_company_id": string,"p_days"?: number,"p_jurisdiction"?: string }; Returns: {
              "approved": number,"avg_turnaround_hours": number,"day": string,"rejected": number,"sent_to_legal": number,"submitted": number
            }[]
                           },
"get_company_member_access":
{ Args: { "p_company_id"?: string,"p_user_id"?: string }; Returns: {
              "module_access": (string)[],"role": string
            }[]
                           },
"get_company_risk_distribution":
{ Args: { "p_company_id": string,"p_jurisdiction"?: string }; Returns: {
              "count": number,"status": string
            }[]
                           },
"get_decisions_summary":
{ Args: { "p_company_id": string,"p_reviewer_id": string }; Returns: Json
                           },
"get_jurisdiction_comparison":
{ Args: { "p_company_id": string,"p_user_id"?: string }; Returns: {
              "approval_rate": number,"approved": number,"avg_risk_score": number,"critical": number,"flagged": number,"jurisdiction": string,"rejected": number,"total_submissions": number
            }[]
                           },
"get_legal_performance":
{ Args: { "p_company_id": string,"p_days"?: number }; Returns: Json
                           },
"get_legal_queue":
{ Args: { "p_company_id": string,"p_department"?: string,"p_jurisdiction"?: string,"p_platform"?: string,"p_priority"?: string,"p_statuses"?: (string)[] }; Returns: {
              "content_id": string,"department": string,"jurisdiction": string,"platform": string,"priority": string,"risk": string,"signoff_status": string,"submitted_for_legal_at": string,"time_in_queue_hours": number,"title": string
            }[]
                           },
"get_marketing_pipeline":
{ Args: { "p_company_id": string,"p_jurisdiction"?: string,"p_user_id": string }; Returns: Json
                           },
"get_my_content_stats":
{ Args: { "p_company_id": string,"p_user_id": string }; Returns: Json
                           },
"get_my_past_decisions":
{ Args: { "p_company_id": string,"p_limit"?: number,"p_reviewer_id"?: string }; Returns: {
              "days_to_decide": number,"decided_at": string,"decision": string,"submission_id": string,"title": string
            }[]
                           } |
{ Args: { "p_company_id": string,"p_limit"?: number,"p_reviewer_id": string }; Returns: {
              "comments": string,"content_id": string,"content_title": string,"decided_at": string,"decision": string,"platform": string,"review_id": string
            }[]
                           },
"get_next_audit_sequence":
{ Args: { "p_company_id": string }; Returns: number
                           },
"get_or_create_company":
{ Args: { "p_name": string }; Returns: string
                           },
"get_reviewer_workload":
{ Args: { "p_company_id": string,"p_days"?: number }; Returns: {
              "approved": number,"avg_turnaround_hours": number,"current_queue": number,"rejected": number,"reviewer_id": string,"reviewer_name": string,"reviews_completed": number
            }[]
                           },
"get_risk_heatmap_data":
{ Args: { "p_company_id": string }; Returns: Json
                           },
"get_risk_velocity":
{ Args: { "p_company_id": string }; Returns: Json
                           },
"get_top_risk_causes":
{ Args: { "p_company_id": string,"p_jurisdiction"?: string,"p_limit"?: number,"p_user_id"?: string }; Returns: {
              "category": string,"cause": string,"occurrences": number,"severity": string
            }[]
                           },
"get_top_risk_trends":
{ Args: { "p_company_id": string,"p_days"?: number,"p_jurisdiction"?: string,"p_limit"?: number,"p_user_id"?: string }; Returns: Json
                           },
"inprocess_decide_escalation":
{ Args: { "p_decision": string,"p_escalation_id": string,"p_reason": string,"p_signature_id"?: string }; Returns: Json
                           },
"inprocess_escalate_reading":
{ Args: { "p_note"?: string,"p_reading_id": string }; Returns: Json
                           },
"inprocess_reading_conditions":
{ Args: { "p_batch_stage_id": string,"p_formula_parameter_id": string,"p_value": number }; Returns: {
              "condition_key": string,"continue_with": string,"detail": string,"severity": string,"sort_order": number,"title": string
            }[]
                           },
"inprocess_sampling_due":
{ Args: { "p_batch_stage_id": string }; Returns: {
              "formula_parameter_id": string,"interval_minutes": number,"last_recorded_at": string,"minutes_overdue": number,"next_due_at": string,"parameter": string,"parameter_type": string,"readings_taken": number
            }[]
                           },
"inprocess_shift_history":
{ Args: { "p_batch_stage_id": string,"p_formula_parameter_id": string,"p_since"?: string }; Returns: {
              "decision": string,"escalated": boolean,"in_specification": boolean,"reading_id": string,"reading_value": number,"recorded_at": string,"sequence_no": number,"unit": string,"zone": string,"zone_action": string
            }[]
                           },
"inprocess_zone_key":
{ Args: { "p_product_id": string }; Returns: {
              "action": string,"bound_text": string,"lower_bound": number,"lower_inclusive": boolean,"sort_order": number,"upper_bound": number,"upper_inclusive": boolean,"zone": string
            }[]
                           },
"instrument_assert_usable":
{ Args: { "p_instrument_id": string }; Returns: undefined
                           },
"instrument_block_reason":
{ Args: { "p_instrument_id": string }; Returns: string
                           },
"instrument_calibration_sweep":
{ Args: { "p_company_id"?: string }; Returns: Json
                           },
"instrument_conditions":
{ Args: { "p_instrument_id": string }; Returns: {
              "condition_key": string,"continue_with": string,"detail": string,"severity": string,"sort_order": number,"title": string
            }[]
                           },
"instrument_record_use":
{ Args: { "p_entity_id": string,"p_entity_type": string,"p_instrument_id": string }; Returns: Json
                           },
"is_company_admin":
{ Args: { "p_company_id": string,"p_user_id"?: string }; Returns: boolean
                           },
"is_on_legal_hold":
{ Args: { "p_entity_id": string,"p_entity_type": string }; Returns: boolean
                           },
"licence_alert_milestones":
{ Args: { "p_company_id": string }; Returns: (number)[]
                           },
"licence_alerting_suppressed":
{ Args: { "p_licence_id": string }; Returns: string
                           },
"licence_audit_step":
{ Args: { "p_action": string,"p_company_id": string,"p_entity_id": string,"p_entity_type": string,"p_metadata"?: Json }; Returns: string
                           },
"licence_block_reason":
{ Args: { "p_operation"?: string,"p_product_id": string }; Returns: string
                           },
"licence_complete_renewal":
{ Args: { "p_comment": string,"p_licence_id": string,"p_new_expiry_date": string,"p_new_issue_date"?: string,"p_new_registration_number": string }; Returns: Json
                           },
"licence_generate_renewal_alerts":
{ Args: { "p_as_of"?: string,"p_company_id": string }; Returns: Json
                           },
"licence_generate_renewal_steps":
{ Args: { "p_licence_id": string }; Returns: number
                           },
"licence_record_approval":
{ Args: { "p_expiry_date": string,"p_issue_date"?: string,"p_licence_id": string,"p_notify"?: boolean,"p_registration_number": string }; Returns: Json
                           },
"licence_renewal_dashboard":
{ Args: { "p_company_id": string }; Returns: Json
                           },
"licence_renewal_policy":
{ Args: { "p_company_id": string }; Returns: Json
                           },
"licence_variation_approve":
{ Args: { "p_comment": string,"p_resulting_expiry_date"?: string,"p_variation_id": string }; Returns: Json
                           },
"licence_variation_implement":
{ Args: { "p_comment": string,"p_variation_id": string }; Returns: Json
                           },
"licence_variation_minimum_class":
{ Args: { "p_type": string }; Returns: string
                           },
"lifecycle_actor_role":
{ Args: { "p_actor_id": string }; Returns: string
                           },
"lifecycle_available_actions":
{ Args: { "p_company_id": string,"p_entity_id": string,"p_entity_type": string }; Returns: {
              "action_key": string,"blocked_reason": string,"is_permitted": boolean,"label": string,"required_permission": string,"required_role": string,"requires_comment": boolean,"requires_signature": boolean,"sort_order": number,"to_state_key": string
            }[]
                           },
"lifecycle_consume_signature":
{ Args: { "p_action_key": string,"p_actor": string,"p_company_id": string,"p_entity_id": string,"p_entity_type": string,"p_signature_id": string }; Returns: string
                           },
"lifecycle_initialize":
{ Args: { "p_actor_id"?: string,"p_company_id": string,"p_entity_id": string,"p_entity_type": string,"p_state_key"?: string }; Returns: Json
                           },
"lifecycle_resolve_definition":
{ Args: { "p_company_id": string,"p_entity_type": string }; Returns: string
                           },
"lifecycle_transition":
{ Args: { "p_action_key": string,"p_actor_id"?: string,"p_comment"?: string,"p_company_id": string,"p_entity_id": string,"p_entity_type": string,"p_metadata"?: Json,"p_signature_id"?: string }; Returns: Json
                           },
"line_changeover_record":
{ Args: { "p_clearance_id": string,"p_detail"?: string,"p_limit_value"?: number,"p_measured_value"?: number,"p_method": string,"p_result": string,"p_unit"?: string }; Returns: Json
                           },
"line_clearance_answer":
{ Args: { "p_clearance_id": string,"p_item_code": string,"p_note"?: string,"p_record_reference"?: string,"p_result": string }; Returns: Json
                           },
"line_clearance_assert_cleared":
{ Args: { "p_batch_id": string }; Returns: undefined
                           },
"line_clearance_block_reason":
{ Args: { "p_batch_id": string }; Returns: string
                           },
"line_clearance_conditions":
{ Args: { "p_batch_id": string }; Returns: {
              "condition_key": string,"continue_with": string,"detail": string,"severity": string,"sort_order": number,"title": string
            }[]
                           },
"line_clearance_default_items":
{ Args: Record<PropertyKey, never>; Returns: {
              "item_code": string,"label": string,"note": string,"requires_record_reference": boolean,"sort_order": number
            }[]
                           },
"line_clearance_open":
{ Args: { "p_batch_id": string,"p_notes"?: string,"p_previous_batch_id"?: string }; Returns: Json
                           },
"line_clearance_override":
{ Args: { "p_clearance_id": string,"p_reason": string,"p_signature_id": string }; Returns: Json
                           },
"line_clearance_perform":
{ Args: { "p_clearance_id": string,"p_signature_id": string }; Returns: Json
                           },
"line_clearance_restart":
{ Args: { "p_clearance_id": string,"p_reason": string }; Returns: Json
                           },
"line_clearance_verify":
{ Args: { "p_clearance_id": string,"p_signature_id": string }; Returns: Json
                           },
"mark_content_in_review":
{ Args: { "p_submission_id": string }; Returns: undefined
                           },
"master_formula_approve":
{ Args: { "p_effective"?: string,"p_formula_id": string,"p_signature_id"?: string }; Returns: Json
                           },
"master_formula_compare":
{ Args: { "p_from_id": string,"p_to_id": string }; Returns: {
              "change": string,"field": string,"item": string,"new_value": string,"old_value": string,"scope": string,"sequence_no": number,"sort_order": number,"stage_code": string,"stage_name": string
            }[]
                           },
"master_formula_new_version":
{ Args: { "p_formula_id": string,"p_version"?: string }; Returns: string
                           },
"master_formula_parameter_critical_allowed":
{ Args: { "p_parameter_type": string }; Returns: boolean
                           },
"master_formula_parameter_text":
{ Args: { "p_critical": boolean,"p_interval": number,"p_max": number,"p_min": number,"p_target": number,"p_target_text": string,"p_type": string,"p_unit": string }; Returns: string
                           },
"master_formula_stage_move":
{ Args: { "p_direction": string,"p_stage_id": string }; Returns: {
              "description": string | null,
"duration_minutes": number | null,
"equipment": string | null,
"formula_id": string,
"id": string,
"name": string,
"requires_signoff": boolean,
"sequence_no": number,
"stage_code": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "master_formula_stages"
        isOneToOne: false
        isSetofReturn: true
      } },
"master_formula_stages_resequence":
{ Args: { "p_formula_id": string }; Returns: {
              "description": string | null,
"duration_minutes": number | null,
"equipment": string | null,
"formula_id": string,
"id": string,
"name": string,
"requires_signoff": boolean,
"sequence_no": number,
"stage_code": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "master_formula_stages"
        isOneToOne: false
        isSetofReturn: true
      } },
"material_alert_lead_days":
{ Args: { "p_company_id": string }; Returns: {
              "expiry_lead_days": number,"retest_lead_days": number
            }[]
                           },
"material_coa_verify":
{ Args: { "p_coa_id": string }; Returns: Json
                           },
"material_dispense":
{ Args: { "p_actual_quantity": number,"p_authorisation_reason"?: string,"p_authorisation_signature_id"?: string,"p_authorised_by"?: string,"p_batch_id": string,"p_batch_stage_id"?: string,"p_formula_material_id"?: string,"p_instrument_id": string,"p_material_lot_id": string,"p_notes"?: string,"p_required_quantity"?: number,"p_signature_id"?: string }; Returns: Json
                           },
"material_dispense_verify":
{ Args: { "p_dispensing_id": string,"p_signature_id"?: string }; Returns: Json
                           },
"material_document_allowed_types":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"material_document_max_bytes":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"material_document_path":
{ Args: { "p_company_id": string,"p_filename": string,"p_lot_id": string }; Returns: string
                           },
"material_documents_provision_storage":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"material_is_qa_authority":
{ Args: { "p_company_id": string,"p_user_id"?: string }; Returns: boolean
                           },
"material_lot_assert_dispensable":
{ Args: { "p_lot_id": string,"p_quantity"?: number }; Returns: undefined
                           },
"material_lot_block_reason":
{ Args: { "p_lot_id": string,"p_quantity"?: number }; Returns: string
                           },
"material_lot_record_sampling":
{ Args: { "p_containers_sampled": number,"p_containers_total": number,"p_lot_id": string,"p_note"?: string,"p_sampled_on"?: string,"p_sampling_plan"?: string }; Returns: {
              "company_id": string,
"containers_sampled": number,
"containers_total": number,
"created_at": string,
"id": string,
"material_lot_id": string,
"note": string | null,
"reference": string,
"sampled_by": string | null,
"sampled_on": string,
"sampling_plan": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "material_lot_sampling"
        isOneToOne: true
        isSetofReturn: false
      } },
"material_lot_reject":
{ Args: { "p_disposition": string,"p_lot_id": string,"p_note"?: string,"p_reason": string,"p_signature_id"?: string }; Returns: Json
                           },
"material_lot_release":
{ Args: { "p_authorised_by"?: string,"p_comment"?: string,"p_justification"?: string,"p_lot_id": string,"p_release_type"?: string,"p_signature_id": string }; Returns: Json
                           },
"material_lot_release_block_reason":
{ Args: { "p_lot_id": string }; Returns: string
                           },
"material_lot_release_conditions":
{ Args: { "p_lot_id": string }; Returns: {
              "blocking": boolean,"condition_key": string,"detail": string,"met": boolean,"sort_order": number,"title": string,"waiting_on": string
            }[]
                           },
"material_lot_retest_sweep":
{ Args: { "p_company_id"?: string }; Returns: Json
                           },
"material_notice_recipients":
{ Args: { "p_company_id": string,"p_purpose": string }; Returns: {
              "user_id": string
            }[]
                           },
"material_spec_evaluate":
{ Args: { "p_expected_text": string,"p_limit_type": string,"p_max": number,"p_min": number,"p_stated_text": string,"p_stated_value": number }; Returns: string
                           },
"material_spec_limit_text":
{ Args: { "p_expected_text": string,"p_limit_type": string,"p_max": number,"p_min": number,"p_unit": string }; Returns: string
                           },
"material_test_record_result":
{ Args: { "p_actual_text"?: string,"p_actual_value"?: number,"p_analyst_id"?: string,"p_instrument"?: string,"p_lot_id": string,"p_method"?: string,"p_test_date"?: string,"p_test_def_id": string }; Returns: Json
                           },
"mfs_assert":
{ Args: { "p_cond": boolean,"p_detail"?: string,"p_id": string,"p_name": string }; Returns: undefined
                           },
"mfs_seq":
{ Args: { "p_formula": string }; Returns: string
                           },
"numbering_next":
{ Args: { "p_company_id": string,"p_context"?: Json,"p_scope": string }; Returns: string
                           },
"policy_ack_coverage":
{ Args: { "p_policy_id": string }; Returns: {
              "acknowledged_users": number,"total_users": number
            }[]
                           },
"product_available_documents":
{ Args: { "p_product_id": string }; Returns: {
              "company_id": string,
"created_at": string,
"ctd_module": string | null,
"description": string | null,
"document_type": string,
"expiry_date": string | null,
"file_name": string | null,
"file_url": string | null,
"id": string,
"is_ctd_administrative": boolean,
"issue_date": string | null,
"metadata": NonNullable<Json>,
"name": string,
"product_id": string | null,
"scope": string,
"updated_at": string,
"uploaded_by": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "product_documents"
        isOneToOne: false
        isSetofReturn: true
      } },
"product_ctd_administrative_documents":
{ Args: { "p_product_id": string }; Returns: {
              "company_id": string,
"created_at": string,
"ctd_module": string | null,
"description": string | null,
"document_type": string,
"expiry_date": string | null,
"file_name": string | null,
"file_url": string | null,
"id": string,
"is_ctd_administrative": boolean,
"issue_date": string | null,
"metadata": NonNullable<Json>,
"name": string,
"product_id": string | null,
"scope": string,
"updated_at": string,
"uploaded_by": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "product_documents"
        isOneToOne: false
        isSetofReturn: true
      } },
"product_is_release_eligible":
{ Args: { "p_product_id": string }; Returns: boolean
                           },
"product_refresh_registration_expiry":
{ Args: { "p_product_id": string }; Returns: undefined
                           },
"provision_calibration_documents_bucket":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"provision_profile":
{ Args: { "p_company_id"?: string,"p_default_jurisdiction"?: string,"p_email": string,"p_full_name"?: string,"p_industry_type"?: string,"p_onboarding_completed"?: boolean,"p_organization"?: string,"p_primary_markets"?: (string)[] }; Returns: Json
                           },
"publish_sop_version":
{ Args: { "p_company_id": string,"p_sop_id": string,"p_version_id": string }; Returns: Json
                           },
"revoke_company_invite":
{ Args: { "p_invite_id": string }; Returns: undefined
                           },
"root_cause_categories_default":
{ Args: Record<PropertyKey, never>; Returns: {
              "category_key": string,"label": string,"sort_order": number
            }[]
                           },
"root_cause_categories_effective":
{ Args: { "p_company_id": string }; Returns: {
              "category_key": string,"is_active": boolean,"label": string,"seeded": boolean,"sort_order": number
            }[]
                           },
"root_cause_categories_seed":
{ Args: { "p_company_id": string }; Returns: undefined
                           },
"rr_assert":
{ Args: { "p_cond": boolean,"p_detail"?: string,"p_id": string,"p_name": string }; Returns: undefined
                           },
"sg_ok":
{ Args: { "p_cond": boolean,"p_detail"?: string,"p_id": string,"p_name": string }; Returns: undefined
                           },
"sign_electronic_record":
{ Args: { "p_action": string,"p_company_id": string,"p_entity_id": string,"p_entity_type": string,"p_meaning": string,"p_metadata"?: Json,"p_password": string,"p_reason"?: string }; Returns: Json
                           },
"sr_accepts":
{ Args: { "p_table": string,"p_value": string }; Returns: boolean
                           },
"sr_nullable":
{ Args: { "p_column": string,"p_table": string }; Returns: boolean
                           },
"sr_ok":
{ Args: { "p_cond": boolean,"p_detail"?: string,"p_id": string,"p_name": string }; Returns: undefined
                           },
"st_ok":
{ Args: { "p_cond": boolean,"p_detail"?: string,"p_id": string,"p_name": string }; Returns: undefined
                           },
"submission_missing_documents":
{ Args: { "p_submission_id": string }; Returns: {
              "name": string
            }[]
                           },
"submission_raise_directive":
{ Args: { "p_content": string,"p_date_received"?: string,"p_response_deadline"?: string,"p_submission_id": string }; Returns: Json
                           },
"submission_respond_to_directive":
{ Args: { "p_directive_id": string,"p_response_notes"?: string }; Returns: Json
                           },
"submission_time_breakdown":
{ Args: { "p_submission_id": string }; Returns: Json
                           },
"verify_audit_chain":
{ Args: { "p_company_id": string }; Returns: Json
                           },
"verify_user_password":
{ Args: { "password": string }; Returns: boolean
                           },
"verify_vault_pin":
{ Args: { "pin": string }; Returns: boolean
                           },
"weight_variation_zone":
{ Args: { "p_product_id": string,"p_value": number }; Returns: {
              "action": string,"limits_configured": boolean,"zone": string
            }[]
                           },
"yield_account_lines":
{ Args: { "p_reconciliation_id": string }; Returns: {
              "kind": string,"label": string,"line_key": string,"must_explain": boolean,"pct_of_theoretical": number,"quantity": number,"sort_order": number,"unit": string
            }[]
                           },
"yield_authorise_variance":
{ Args: { "p_reason": string,"p_reconciliation_id": string,"p_signature_id"?: string }; Returns: Json
                           },
"yield_batch_block_reason":
{ Args: { "p_batch_id": string }; Returns: string
                           },
"yield_block_reason":
{ Args: { "p_batch_stage_id": string }; Returns: string
                           },
"yield_flag_investigation":
{ Args: { "p_note": string,"p_reconciliation_id": string }; Returns: Json
                           },
"yield_reconcile_batch":
{ Args: { "p_actual_quantity": number,"p_batch_id": string,"p_notes"?: string,"p_unit"?: string }; Returns: Json
                           },
"yield_reconcile_stage":
{ Args: { "p_actual_quantity": number,"p_batch_stage_id": string,"p_notes"?: string,"p_unit"?: string }; Returns: Json
                           },
"yield_reconcile_stage_accounted":
{ Args: { "p_batch_stage_id": string,"p_notes"?: string,"p_packed_quantity": number,"p_rejects_quantity": number,"p_samples_quantity": number,"p_unit"?: string }; Returns: Json
                           },
"yield_reconciliation_status":
{ Args: { "p_batch_id": string }; Returns: {
              "actual_quantity": number,"authorised_by": string,"batch_stage_id": string,"block_reason": string,"configured": boolean,"investigation_required": boolean,"reconciliation_id": string,"scope": string,"sequence_no": number,"stage_name": string,"theoretical_quantity": number,"threshold_pct": number,"unit": string,"variance_pct": number,"within_threshold": boolean,"yield_pct": number
            }[]
                           },
"yield_theoretical_basis":
{ Args: { "p_basis": string,"p_batch_id": string,"p_batch_stage_id": string }; Returns: {
              "basis_quantity": number,"basis_unit": string,"detail": string
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            "dblink_pkey_results": {
                        "position": number | null,"colname": string | null
                      }
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
