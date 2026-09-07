import { useCallback, useEffect, useState } from 'react';
import { PenLine, RefreshCw, Clock, FileText, User, Hash } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ElectronicSignature, getElectronicSignatures } from '../../lib/electronicSignatureService';

export default function ElectronicSignaturesPage() {
  const { profile } = useAuth();
  const companyId = (profile as any)?.company_id as string | undefined;
  const [signatures, setSignatures] = useState<ElectronicSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      setSignatures(await getElectronicSignatures(companyId));
    } catch (err: any) {
      setError(err?.message ?? 'Unable to load signatures.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const filtered = signatures.filter((s) => {
    const q = search.toLowerCase().trim();
    return !q || [s.action, s.meaning, s.reason ?? '', s.entity_type, s.entity_id, s.signer_name, s.signer_email]
      .join(' ').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="dash-text flex items-center gap-2 text-2xl font-bold">
            <PenLine className="dash-accent h-6 w-6" />Electronic signatures
          </h2>
          <p className="dash-text-secondary mt-1 text-sm">
            Each signature records who signed, what it meant, and the exact state of the record at
            the time. Signatures cannot be edited or removed.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="dash-border dash-text flex items-center gap-2 rounded-lg border px-4 py-2 text-sm">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      <div className="dash-card rounded-xl p-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by signer, action, meaning or record…"
          className="dash-input w-full rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="dash-card rounded-xl">
        {loading ? (
          <div className="dash-text-secondary p-8 text-center text-sm">Loading signatures…</div>
        ) : error ? (
          <div className="dash-danger p-8 text-center text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="dash-text-secondary p-8 text-center text-sm">No electronic signatures yet.</div>
        ) : (
          <div className="dash-border divide-y">
            {filtered.map((s) => (
              <div key={s.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="dash-text font-semibold">{s.action.replace(/_/g, ' ')}</div>
                    {/* the §11.50 manifestation: printed name, meaning, time */}
                    <div className="dash-text-secondary mt-1 text-sm">
                      <span className="font-medium">{s.signer_name}</span> — {s.meaning}
                    </div>
                  </div>
                  <div className="dash-text-tertiary flex items-center gap-1 text-xs">
                    <Clock className="h-3.5 w-3.5" />{new Date(s.signed_at).toLocaleString()}
                  </div>
                </div>

                <div className="dash-text-tertiary mt-4 grid gap-3 text-xs md:grid-cols-3">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 shrink-0" />
                    <span className="truncate">{s.signer_email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{s.entity_type} · {s.signed_state}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 shrink-0" />
                    <span className="truncate font-mono" title={s.record_hash}>
                      {s.record_hash.slice(0, 16)}…
                    </span>
                  </div>
                </div>

                {s.reason && (
                  <div className="dash-surface-alt dash-text-secondary mt-3 rounded-lg p-3 text-sm">{s.reason}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
