export interface DocSection {
  title: string;
  id: string;
  description: string;
  content: string;
  code?: string;
}

export const DEVELOPER_DOCS: DocSection[] = [
  {
    id: 'auth',
    title: 'Authentication',
    description: 'Learn how to authenticate your requests using Bearer tokens.',
    content: `
All API requests must include your API key in the \`Authorization\` header as a Bearer token.
We recommend using **Service Accounts** for server-to-server integrations to ensure persistent access and better auditability.

### Header Format
\`Authorization: Bearer <your_api_key>\`

### Security Best Practices
- Never share your API keys in client-side code (browsers, mobile apps).
- Use Service Accounts for automated systems.
- Rotate keys immediately if compromised.
    `,
    code: `curl -H "Authorization: Bearer sk_live_..." https://api.yoursite.com/api/v1/...`
  },
  {
    id: 'ingestion',
    title: 'Evidence Ingestion',
    description: 'Push compliance evidence from third-party tools directly into the Governance OS.',
    content: `
The Evidence Ingestion API allows you to programmatically submit documents, screenshots, or data logs as evidence.
Evidence is automatically linked to the appropriate controls or audit requests if IDs are provided.

### Endpoint
\`POST /api/v1/evidence/ingest\`

### Required Scopes
- \`evidence:write\`
    `,
    code: `
{
  "title": "Weekly Firewall Audit",
  "source_name": "CloudWatch",
  "source_type": "log_archive",
  "content_text": "Firewall rules verified at...",
  "related_control_id": "uuid-of-control"
}`
  },
  {
    id: 'webhooks',
    title: 'Webhooks & Events',
    description: 'Subscribe to platform events to trigger external workflows.',
    content: `
Webhooks allow your system to receive real-time notifications when important events occur in the Governance OS.

### Signature Verification
All webhook payloads are signed with an HMAC-SHA256 signature passed in the \`x-governance-signature\` header.
You should verify this signature using your endpoint's signing secret.

### Retries
If your server returns a non-2xx status, we will retry the delivery up to 5 times with exponential backoff.
    `,
    code: `
// Signature header format
// x-governance-signature: v1=hash_hex
    `
  }
];
