/**
 * Static templates and examples for partner integrations.
 */

export const ECOSYSTEM_TEMPLATES = {
  evidence_ingestion: {
    endpoint: '/api/v1/evidence/ingest',
    method: 'POST',
    description: 'Push external evidence metadata and content into the platform.',
    curl_example: (projectId: string, apiKey: string) => `curl -X POST https://${projectId}.supabase.co/functions/v1/api-v1-proxy/api/v1/evidence/ingest \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Weekly Access Review",
    "source_name": "Okta",
    "source_type": "api",
    "evidence_type": "Identity AuditLog",
    "content_text": "Access review completed for March 2026. All 142 users verified.",
    "external_id": "okta-run-12345",
    "metadata": {
      "run_id": "12345",
      "region": "us-east-1"
    }
  }'`,
    payload_schema: {
      title: 'string (required) - Display name in Archive',
      source_name: 'string (required) - Integration source name',
      source_type: 'string (required) - "api", "manual", "automated"',
      content_text: 'string (optional) - Content to store as evidence',
      external_id: 'string (optional) - ID from the external system',
      related_control_id: 'uuid (optional) - Link directly to a GRC control',
      related_audit_request_id: 'uuid (optional) - Link to a specific audit request',
      metadata: 'object (optional) - Additional key-value pairs'
    }
  },

  webhook_verification: {
    description: 'How to verify outbound webhook signatures using HMAC-SHA256.',
    snippet: (_secret: string) => `// JavaScript example for signature verification
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expected = hmac.digest('hex');
  return signature === expected;
}

// signature is from X-Compliance-Signature header
// payload is the raw request body string`
  },

  events: [
    {
      name: 'policy.published',
      description: 'Triggered when a new policy is approved and published.',
      example: {
        id: 'evt_123',
        event: 'policy.published',
        created_at: '2026-03-07T12:00:00Z',
        data: {
          policy_id: 'uuid',
          title: 'Remote Work Policy v2',
          effective_date: '2026-04-01'
        }
      }
    },
    {
      name: 'audit.request.created',
      description: 'Triggered when a new audit evidence request is issued.',
      example: {
        id: 'evt_456',
        event: 'audit.request.created',
        created_at: '2026-03-07T13:00:00Z',
        data: {
          request_id: 'uuid',
          audit_name: 'SOC2 Type II - 2026',
          deadline: '2026-03-15'
        }
      }
    },
    {
      name: 'ai.incident.escalated',
      description: 'Triggered when an AI usage incident requires immediate human review.',
      example: {
        id: 'evt_789',
        event: 'ai.incident.escalated',
        created_at: '2026-03-07T14:30:00Z',
        data: {
          incident_id: 'uuid',
          severity: 'high',
          asset_name: 'Customer Support Bot'
        }
      }
    }
  ]
};
