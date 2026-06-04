import { useEffect, useState } from 'react';
import { FlaskConical, ClipboardList, GitMerge, BookMarked, Activity } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface WorkflowCount {
  label: string;
  count: number;
  icon: typeof FlaskConical;
  color: string;
  page: string;
}

interface Props {
  companyId: string;
  onNavigate?: (page: string) => void;
}

export default function ActiveWorkflowsWidget({ companyId, onNavigate }: Props) {
  const [counts, setCounts] = useState<WorkflowCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    (async () => {
      setLoading(true);
      const [batches, capas, changes, sops] = await Promise.allSettled([
        (supabase as any).from('batch_records').select('*', { count: 'exact', head: true })
          .eq('company_id', companyId).in('status', ['qc_pending', 'qc_in_progress', 'hold']),
        (supabase as any).from('capa_records').select('*', { count: 'exact', head: true })
          .eq('company_id', companyId).not('status', 'in', '(closed,cancelled)'),
        (supabase as any).from('change_controls').select('*', { count: 'exact', head: true })
          .eq('company_id', companyId).not('status', 'in', '(closed,rejected)'),
        (supabase as any).from('sop_documents').select('*', { count: 'exact', head: true })
          .eq('company_id', companyId).in('status', ['in_review', 'draft']),
      ]);

      const get = (r: PromiseSettledResult<any>) =>
        r.status === 'fulfilled' ? (r.value.count ?? 0) : 0;

      setCounts([
        { label: 'Batches in QC', count: get(batches), icon: FlaskConical, color: 'text-blue-600', page: 'batch-release' },
        { label: 'Open CAPAs', count: get(capas), icon: ClipboardList, color: 'text-orange-600', page: 'capa-management' },
        { label: 'Change Controls', count: get(changes), icon: GitMerge, color: 'text-purple-600', page: 'change-control' },
        { label: 'SOPs in Review', count: get(sops), icon: BookMarked, color: 'text-teal-600', page: 'sop-library' },
      ]);
      setLoading(false);
    })();
  }, [companyId]);

  const total = counts.reduce((s, c) => s + c.count, 0);

  return (
    <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} className="text-[var(--color-accent)]" />
        <h3 className="text-sm font-bold dash-text">Active Workflows</h3>
        {!loading && (
          <span className="ml-auto text-xs font-bold text-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-0.5 rounded-full">
            {total} open
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-[var(--color-surface-alt)] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {counts.map(c => {
            const Icon = c.icon;
            return (
              <button
                key={c.label}
                onClick={() => onNavigate && window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: c.page } }))}
                className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface-alt)] hover:bg-[var(--color-border)] transition-colors text-left group"
              >
                <Icon size={18} className={`flex-shrink-0 ${c.color}`} />
                <div>
                  <p className={`text-lg font-bold ${c.color}`}>{c.count}</p>
                  <p className="text-[10px] dash-text-tertiary font-semibold leading-tight">{c.label}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
