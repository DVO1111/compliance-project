import { useState, useEffect } from 'react';
import { X, FlaskConical, Plus, CheckCircle2, XCircle, FileText, Download, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  BatchRecord,
  BatchInProcessQc,
  BatchQcResult,
  listInProcessQc,
  addInProcessQc,
  listQcResults,
  addQcResult,
  STATUS_LABELS,
  STATUS_COLORS,
} from '../../lib/pharma/batchReleaseService';
import {
  CoaRecord,
  listCoasForBatch,
  generateCoaForBatch,
  approveCoa,
  exportCoaPdf,
} from '../../lib/pharma/coaService';
import { isQaAuthority } from '../../lib/pharma/qaAuthority';

interface Props {
  batch: BatchRecord;
  companyId: string;
  userId: string;
  onClose: () => void;
  onChanged?: () => void;
}

const emptyInProcess = { stage_name: '', parameter: '', specification: '', result: '', pass: true };
const emptyFinal = { test_name: '', test_method: '', specification: '', result: '', pass: true };

export default function BatchDetailModal({ batch, companyId, userId, onClose, onChanged }: Props) {
  const { profile } = useAuth();
  const approverName = (profile?.full_name ?? profile?.email ?? 'QA') as string;
  const canApprove = isQaAuthority((profile as any)?.company_role);
  const [tab, setTab] = useState<'inprocess' | 'final' | 'coa'>('inprocess');
  const [inProcess, setInProcess] = useState<BatchInProcessQc[]>([]);
  const [finalQc, setFinalQc] = useState<BatchQcResult[]>([]);
  const [coas, setCoas] = useState<CoaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coaBusy, setCoaBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ipForm, setIpForm] = useState(emptyInProcess);
  const [finForm, setFinForm] = useState(emptyFinal);

  const load = async () => {
    setLoading(true);
    const [ip, fin, coa] = await Promise.all([listInProcessQc(batch.id), listQcResults(batch.id), listCoasForBatch(batch.id)]);
    setInProcess(ip);
    setFinalQc(fin);
    setCoas(coa);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [batch.id]);

  const handleGenerateCoa = async () => {
    setCoaBusy(true); setError(null);
    try {
      await generateCoaForBatch(batch.id, companyId, userId);
      await load();
      onChanged?.();
    } catch (e: any) { setError(e.message || 'Failed to generate CoA'); }
    finally { setCoaBusy(false); }
  };

  const handleApproveCoa = async (coaId: string) => {
    setCoaBusy(true); setError(null);
    try {
      await approveCoa(coaId, companyId, userId, approverName);
      await load();
      onChanged?.();
    } catch (e: any) { setError(e.message || 'Failed to approve CoA'); }
    finally { setCoaBusy(false); }
  };

  const submitInProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ipForm.stage_name || !ipForm.parameter || !ipForm.result) { setError('Stage, parameter and result are required.'); return; }
    setSaving(true); setError(null);
    try {
      await addInProcessQc(companyId, batch.id, userId, {
        stage_name: ipForm.stage_name,
        parameter: ipForm.parameter,
        specification: ipForm.specification || null,
        result: ipForm.result,
        pass: ipForm.pass,
      });
      setIpForm(emptyInProcess);
      await load();
      onChanged?.();
    } catch (e: any) { setError(e.message || 'Failed to log in-process QC'); }
    finally { setSaving(false); }
  };

  const submitFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finForm.test_name || !finForm.result) { setError('Test name and result are required.'); return; }
    setSaving(true); setError(null);
    try {
      await addQcResult(batch.id, userId, {
        test_name: finForm.test_name,
        test_method: finForm.test_method || null,
        specification: finForm.specification || null,
        result: finForm.result,
        pass: finForm.pass,
      });
      setFinForm(emptyFinal);
      await load();
      onChanged?.();
    } catch (e: any) { setError(e.message || 'Failed to log QC result'); }
    finally { setSaving(false); }
  };

  const inputCls =
    'w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="dash-card border dash-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b dash-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
              <FlaskConical size={20} className="text-[var(--color-accent)]" />
            </div>
            <div>
              <h2 className="text-lg font-bold dash-text">{batch.batch_number}</h2>
              <p className="text-xs dash-text-secondary">
                {batch.product_name}
                <span className={`ml-2 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${STATUS_COLORS[batch.status]}`}>
                  {STATUS_LABELS[batch.status]}
                </span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="dash-text-tertiary hover:dash-text-primary transition-colors">
            <X size={22} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-6 pt-4">
          {([['inprocess', 'In-Process QC'], ['final', 'Final Release QC'], ['coa', 'Certificate of Analysis']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                tab === id ? 'text-white border-transparent' : 'dash-text-secondary dash-border hover:dash-surface-alt'
              }`}
              style={tab === id ? { background: 'var(--color-accent)' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-[var(--color-danger-soft)] text-[var(--color-danger)] text-sm border border-[var(--color-danger-border)]">
              {error}
            </div>
          )}

          {/* Add form */}
          {tab === 'inprocess' && (
            <form onSubmit={submitInProcess} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Stage (e.g. Blending) *" value={ipForm.stage_name} onChange={e => setIpForm(f => ({ ...f, stage_name: e.target.value }))} />
                <input className={inputCls} placeholder="Parameter (e.g. Moisture %) *" value={ipForm.parameter} onChange={e => setIpForm(f => ({ ...f, parameter: e.target.value }))} />
                <input className={inputCls} placeholder="Specification (e.g. <= 2.0%)" value={ipForm.specification} onChange={e => setIpForm(f => ({ ...f, specification: e.target.value }))} />
                <input className={inputCls} placeholder="Result *" value={ipForm.result} onChange={e => setIpForm(f => ({ ...f, result: e.target.value }))} />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm dash-text">
                  <input type="checkbox" checked={ipForm.pass} onChange={e => setIpForm(f => ({ ...f, pass: e.target.checked }))} />
                  Meets specification
                </label>
                <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--color-accent)' }}>
                  <Plus size={14} /> {saving ? 'Saving…' : 'Log Stage'}
                </button>
              </div>
            </form>
          )}
          {tab === 'final' && (
            <form onSubmit={submitFinal} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Test name (e.g. Assay) *" value={finForm.test_name} onChange={e => setFinForm(f => ({ ...f, test_name: e.target.value }))} />
                <input className={inputCls} placeholder="Method (e.g. HPLC)" value={finForm.test_method} onChange={e => setFinForm(f => ({ ...f, test_method: e.target.value }))} />
                <input className={inputCls} placeholder="Specification (e.g. 95-105%)" value={finForm.specification} onChange={e => setFinForm(f => ({ ...f, specification: e.target.value }))} />
                <input className={inputCls} placeholder="Result *" value={finForm.result} onChange={e => setFinForm(f => ({ ...f, result: e.target.value }))} />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm dash-text">
                  <input type="checkbox" checked={finForm.pass} onChange={e => setFinForm(f => ({ ...f, pass: e.target.checked }))} />
                  Pass
                </label>
                <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--color-accent)' }}>
                  <Plus size={14} /> {saving ? 'Saving…' : 'Log Result'}
                </button>
              </div>
            </form>
          )}

          {/* Certificate of Analysis */}
          {tab === 'coa' && (
            <div className="space-y-3">
              {batch.status !== 'released' ? (
                <div className="p-4 rounded-xl border dash-border bg-[var(--color-surface)] text-sm dash-text-secondary flex items-start gap-2">
                  <FileText size={16} className="mt-0.5 shrink-0" />
                  A Certificate of Analysis can be generated once this batch is <strong className="mx-1">Released</strong>.
                </div>
              ) : (
                <button
                  onClick={handleGenerateCoa}
                  disabled={coaBusy}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--color-accent)' }}
                >
                  <Sparkles size={14} /> {coaBusy ? 'Working…' : 'Generate CoA'}
                </button>
              )}

              {!loading && coas.length === 0 && batch.status === 'released' && (
                <p className="text-sm dash-text-tertiary text-center py-4">No certificate generated yet.</p>
              )}

              {coas.map(coa => (
                <div key={coa.id} className="p-4 rounded-xl border dash-border bg-[var(--color-surface)] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold dash-text text-sm">{coa.coa_number}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                      coa.status === 'qa_approved'
                        ? 'text-green-600 bg-green-50 border-green-200'
                        : 'text-amber-600 bg-amber-50 border-amber-200'
                    }`}>
                      {coa.status === 'qa_approved' ? 'QA Approved' : 'Draft'}
                    </span>
                  </div>
                  {coa.conformance_statement && (
                    <p className="text-xs dash-text-secondary leading-relaxed">{coa.conformance_statement}</p>
                  )}
                  {coa.status === 'qa_approved' && coa.qa_approved_by_name && (
                    <p className="text-[11px] dash-text-tertiary">
                      Approved by {coa.qa_approved_by_name}
                      {coa.qa_approved_at ? ` · ${new Date(coa.qa_approved_at).toLocaleString()}` : ''}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1 items-center">
                    {coa.status === 'draft' && canApprove && (
                      <button
                        onClick={() => handleApproveCoa(coa.id)}
                        disabled={coaBusy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                        style={{ background: 'var(--color-accent)' }}
                      >
                        <ShieldCheck size={13} /> Approve (QA e-sign)
                      </button>
                    )}
                    {coa.status === 'draft' && !canApprove && (
                      <span className="text-[11px] dash-text-tertiary italic">QA/admin approval required</span>
                    )}
                    <button
                      onClick={() => exportCoaPdf(coa)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border dash-border dash-text hover:dash-surface-alt"
                    >
                      <Download size={13} /> Export PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* List */}
          {tab !== 'coa' && (loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {tab === 'inprocess' && inProcess.length === 0 && (
                <p className="text-sm dash-text-tertiary text-center py-6">No in-process QC logged yet.</p>
              )}
              {tab === 'final' && finalQc.length === 0 && (
                <p className="text-sm dash-text-tertiary text-center py-6">No release QC results logged yet.</p>
              )}
              {tab === 'inprocess' && inProcess.map(r => (
                <QcRow key={r.id} pass={r.pass} title={`${r.stage_name} — ${r.parameter}`} spec={r.specification} result={r.result} at={r.tested_at} />
              ))}
              {tab === 'final' && finalQc.map(r => (
                <QcRow key={r.id} pass={r.pass} title={`${r.test_name}${r.test_method ? ` (${r.test_method})` : ''}`} spec={r.specification} result={r.result} at={r.tested_at} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QcRow({ pass, title, spec, result, at }: { pass: boolean; title: string; spec: string | null; result: string; at: string }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border dash-border bg-[var(--color-surface)]">
      <div className="min-w-0">
        <p className="text-sm font-semibold dash-text truncate">{title}</p>
        <p className="text-xs dash-text-tertiary">
          {spec ? `Spec: ${spec} · ` : ''}Result: {result} · {new Date(at).toLocaleDateString()}
        </p>
      </div>
      {pass ? (
        <span className="flex items-center gap-1 text-xs font-bold text-green-600"><CheckCircle2 size={14} /> Pass</span>
      ) : (
        <span className="flex items-center gap-1 text-xs font-bold text-red-600"><XCircle size={14} /> Fail</span>
      )}
    </div>
  );
}
