import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, FileText, ClipboardCheck, RefreshCw, Loader2, ChevronDown } from 'lucide-react';
import {
  NAFDAC_INSPECTION_CHECKLIST,
  EVIDENCE_LABELS,
  type ReadinessEvidence,
} from '../../lib/pharma/nafdacInspectionChecklist';
import { checkNafdacReadiness, type ReadinessCounts } from '../../lib/auditPrepService';

export default function NafdacReadinessChecklist({ companyId }: { companyId: string }) {
  const [counts, setCounts] = useState<ReadinessCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setCounts(await checkNafdacReadiness(companyId));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Present = app-held evidence exists; external = tracked but managed off-platform.
  const status = (evidence: ReadinessEvidence): 'present' | 'missing' | 'external' => {
    if (evidence === 'external') return 'external';
    const n = counts?.[evidence] ?? 0;
    return n > 0 ? 'present' : 'missing';
  };

  const appItems = NAFDAC_INSPECTION_CHECKLIST.flatMap(s => s.items).filter(i => i.evidence !== 'external');
  const presentCount = counts ? appItems.filter(i => status(i.evidence) === 'present').length : 0;
  const appTotal = appItems.length;

  return (
    <div className="bg-[var(--color-surface,#fff)] border border-[var(--color-border,#e5e7eb)] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#2943D6]/10 text-[#2943D6]"><ClipboardCheck className="w-4 h-4" /></div>
          <div>
            <h3 className="font-semibold text-sm text-[var(--color-text-primary,#111)]">NAFDAC Inspection Readiness</h3>
            <p className="text-xs text-[var(--color-text-secondary,#6b7280)]">
              Official document checklist — DER-GDL-005-02 & DER-GDL-008-02
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {counts && (
            <span className="text-xs font-semibold text-[var(--color-text-secondary,#6b7280)] whitespace-nowrap">
              {presentCount}/{appTotal} app-verifiable
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); load(); }}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Refresh"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-gray-400" />}
          </button>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--color-border,#e5e7eb)] divide-y divide-[var(--color-border,#e5e7eb)]">
          {NAFDAC_INSPECTION_CHECKLIST.map(section => (
            <div key={section.source} className="p-4">
              <div className="flex items-baseline justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary,#6b7280)]">{section.title}</h4>
                <span className="text-[10px] text-gray-400 font-mono">{section.source}</span>
              </div>
              <div className="space-y-1">
                {section.items.map(item => {
                  const s = status(item.evidence);
                  return (
                    <div key={item.ref} className="flex items-start gap-2.5 py-1">
                      {s === 'present' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      ) : s === 'missing' ? (
                        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[var(--color-text-primary,#111)] leading-snug">
                          <span className="text-gray-400 font-mono text-xs mr-1.5">{item.ref}</span>
                          {item.title}
                        </p>
                        {item.note && <p className="text-[11px] text-gray-400 mt-0.5">{item.note}</p>}
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                        s === 'present' ? 'bg-green-100 text-green-700'
                          : s === 'missing' ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {s === 'external' ? EVIDENCE_LABELS.external : `${EVIDENCE_LABELS[item.evidence]}${s === 'missing' ? ' — none' : ''}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="p-3 text-[11px] text-gray-400 bg-gray-50 dark:bg-gray-800/40">
            Green = evidence found in the platform. Amber = the relevant module is empty. Grey = document is managed outside the platform (upload / present manually on the day).
          </p>
        </div>
      )}
    </div>
  );
}
