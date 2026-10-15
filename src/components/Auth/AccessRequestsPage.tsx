import { useEffect, useState } from 'react';
import { RefreshCw, UserRoundPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AccessRequest {
  email: string;
  full_name: string | null;
  company: string | null;
  role: string | null;
  industry: string | null;
  notes: string | null;
  requested_at: string;
}

export default function AccessRequestsPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingEmail, setWorkingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    setError(null);
    const { data, error: callError } = await supabase.functions.invoke('approve-signup', {
      body: { action: 'list' },
    });
    setLoading(false);
    if (callError || data?.error) {
      setError('Could not load access requests. Confirm your account is an authorized approver.');
      return;
    }
    setRequests((data?.requests ?? []) as AccessRequest[]);
  }

  useEffect(() => { void loadRequests(); }, []);

  async function approve(email: string) {
    setWorkingEmail(email);
    setError(null);
    setNotice(null);
    const { data, error: callError } = await supabase.functions.invoke('approve-signup', {
      body: { action: 'approve', email },
    });
    setWorkingEmail(null);
    if (callError || data?.error) {
      setError(data?.error === 'invite_email_failed'
        ? 'The approval was saved, but Supabase could not send the setup email. Check Auth email settings, then retry approval.'
        : 'Could not approve this request. Please retry or check the Edge Function logs.');
      return;
    }
    setRequests((current) => current.filter((request) => request.email !== email));
    setNotice(`Setup email sent to ${email}.`);
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '36px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: 'var(--color-text-primary)' }}>Access requests</h1>
          <p style={{ margin: '8px 0 0', color: 'var(--color-text-secondary)' }}>Review requests before sending account setup links.</p>
        </div>
        <button type="button" onClick={() => void loadRequests()} disabled={loading}
          aria-label="Refresh access requests" title="Refresh access requests"
          style={iconButtonStyle}>
          <RefreshCw size={17} />
        </button>
      </header>

      {error && <p role="alert" style={messageStyle}>{error}</p>}
      {notice && <p role="status" style={{ ...messageStyle, borderColor: '#80b89a' }}>{notice}</p>}

      {loading ? <p style={{ color: 'var(--color-text-secondary)' }}>Loading requests…</p>
        : requests.length === 0 ? <p style={{ padding: '32px 0', color: 'var(--color-text-secondary)' }}>No pending requests.</p>
          : <div style={{ marginTop: 24, borderTop: '1px solid var(--color-border)' }}>
            {requests.map((request) => (
              <article key={request.email} style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 16, color: 'var(--color-text-primary)' }}>{request.full_name || request.email}</h2>
                  <p style={{ margin: '4px 0', fontSize: 14, color: 'var(--color-text-secondary)' }}>{request.email}</p>
                  <p style={{ margin: '4px 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {[request.company, request.role, request.industry].filter(Boolean).join(' · ') || 'Details not provided'}
                  </p>
                  {request.notes && <p style={{ margin: '8px 0 0', fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)' }}>{request.notes}</p>}
                  <time style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    Requested {new Date(request.requested_at).toLocaleDateString()}
                  </time>
                </div>
                <button type="button" onClick={() => void approve(request.email)} disabled={workingEmail !== null}
                  style={approveButtonStyle}>
                  {workingEmail === request.email ? <RefreshCw size={16} className="animate-spin" /> : <><UserRoundPlus size={16} /><span>Approve and email setup link</span></>}
                </button>
              </article>
            ))}
          </div>}
    </main>
  );
}

const iconButtonStyle = {
  width: 40, height: 40, display: 'grid', placeItems: 'center',
  border: '1px solid var(--color-border)', borderRadius: 6,
  background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer',
} as const;

const approveButtonStyle = {
  flexShrink: 0, minHeight: 40, padding: '0 12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  border: 0, borderRadius: 6, background: 'var(--color-accent)', color: '#fff', fontWeight: 600, cursor: 'pointer',
} as const;

const rowStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
  padding: '20px 0', borderBottom: '1px solid var(--color-border)',
} as const;

const messageStyle = {
  margin: '20px 0 0', padding: '12px 14px', border: '1px solid #d98f83', borderRadius: 6,
  color: 'var(--color-text-primary)', fontSize: 14,
} as const;