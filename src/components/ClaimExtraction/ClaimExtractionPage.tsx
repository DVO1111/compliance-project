import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { extractClaimsFromText, saveExtractedClaims, getClaims, updateClaimStatus, linkEvidence, CLAIM_TYPE_LABELS, EVIDENCE_TYPES, type ExtractedClaim, type ClaimStatus, type EvidenceType } from '../../lib/claimExtractionService';
import { FileSearch, CheckCircle2, AlertTriangle, Clock, X, Link2, Upload } from 'lucide-react';

const TYPE_BADGE: Record<string, { bg: string; text: string }> = { efficacy: { bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]' }, safety: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' }, comparative: { bg: 'bg-[var(--color-purple)]/10', text: 'text-[var(--color-purple)]' }, economic: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' }, mechanism: { bg: 'bg-[var(--color-purple)]/10', text: 'text-[var(--color-purple)]' }, general: { bg: 'bg-[var(--color-surface-alt)]', text: 'text-[var(--color-text-secondary)]' } };
const STATUS_BADGE: Record<string, { bg: string; text: string }> = { unreviewed: { bg: 'bg-[var(--color-surface-alt)]', text: 'text-[var(--color-text-secondary)]' }, approved: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' }, rejected: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' }, needs_evidence: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' } };

type Tab = 'extract' | 'library';

export default function ClaimExtractionPage() {
    const { user, profile } = useAuth();
    const companyId = profile?.company_id;
    const [tab, setTab] = useState<Tab>('extract');
    const [inputText, setInputText] = useState('');
    const [docTitle, setDocTitle] = useState('');
    const [extractedClaims, setExtractedClaims] = useState<ReturnType<typeof extractClaimsFromText>>([]);
    const [savedClaims, setSavedClaims] = useState<ExtractedClaim[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showEvidence, setShowEvidence] = useState<string | null>(null);
    const [eForm, setEForm] = useState({ evidence_type: 'clinical_trial' as EvidenceType, reference_title: '', reference_url: '', strength: 'moderate' });

    const loadClaims = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const data = await getClaims(companyId);
        setSavedClaims(data); setLoading(false);
    }, [companyId]);
    useEffect(() => { loadClaims(); }, [loadClaims]);

    function handleExtract() {
        if (!inputText || !docTitle) return;
        const claims = extractClaimsFromText(inputText, docTitle);
        setExtractedClaims(claims);
    }

    async function handleSave() {
        if (!companyId || !user || extractedClaims.length === 0) return;
        setSaving(true);
        await saveExtractedClaims(companyId, user.id, extractedClaims);
        setExtractedClaims([]); setInputText(''); setDocTitle(''); setSaving(false);
        loadClaims(); setTab('library');
    }

    async function handleStatus(id: string, status: ClaimStatus) { await updateClaimStatus(id, status); loadClaims(); }

    async function handleLinkEvidence() {
        if (!showEvidence || !eForm.reference_title) return;
        setSaving(true);
        await linkEvidence(showEvidence, eForm);
        setShowEvidence(null); setEForm({ evidence_type: 'clinical_trial', reference_title: '', reference_url: '', strength: 'moderate' }); setSaving(false); loadClaims();
    }

    const unreviewed = savedClaims.filter(c => c.status === 'unreviewed').length;
    const noEvidence = savedClaims.filter(c => !c.has_evidence && c.status !== 'rejected').length;

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div><div className="flex items-center gap-3 mb-1"><div className="p-2 rounded-xl bg-[var(--color-accent-soft)]"><FileSearch className="w-5 h-5 dash-accent" /></div><h2 className="text-2xl font-bold dash-text">NLP Claim Extraction</h2></div><p className="dash-text-secondary text-sm ml-12">Automatically extract and classify claims from content using NLP</p></div>
            </div>

            {(unreviewed > 0 || noEvidence > 0) && <div className="p-3 rounded-xl bg-[var(--color-warning-soft)] border border-[var(--color-warning)]/20 flex items-center gap-3"><AlertTriangle className="w-5 h-5 text-[var(--color-warning)]" /><p className="text-sm text-[var(--color-warning)]">{unreviewed > 0 && `${unreviewed} unreviewed claim(s). `}{noEvidence > 0 && `${noEvidence} claim(s) without evidence.`}</p></div>}

            <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface-alt)] w-fit">
                {([{ id: 'extract' as Tab, label: 'Extract Claims', icon: Upload }, { id: 'library' as Tab, label: 'Claim Library', icon: FileSearch }]).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-[var(--color-surface)] dark:bg-[var(--color-surface)] shadow-sm dash-text' : 'dash-text-secondary hover:dash-text'}`}><t.icon className="w-4 h-4" />{t.label}{t.id === 'library' && savedClaims.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--color-accent-soft)] dash-accent">{savedClaims.length}</span>}</button>))}
            </div>

            {tab === 'extract' ? (<>
                <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)]">
                    <h3 className="font-semibold dash-text text-sm mb-4">Paste Content for Analysis</h3>
                    <div className="space-y-4">
                        <div><label className="text-xs font-medium dash-text-secondary block mb-1">Document Title *</label><input value={docTitle} onChange={e => setDocTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="e.g. CardioMax Detail Aid v3" /></div>
                        <div><label className="text-xs font-medium dash-text-secondary block mb-1">Content *</label><textarea value={inputText} onChange={e => setInputText(e.target.value)} rows={8} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none font-mono" placeholder="Paste the content to analyze for claims..." /></div>
                        <button onClick={handleExtract} disabled={!inputText || !docTitle} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">Extract Claims</button>
                    </div>
                </div>

                {extractedClaims.length > 0 && (
                    <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)]">
                        <div className="flex items-center justify-between mb-4"><h3 className="font-semibold dash-text text-sm">{extractedClaims.length} Claim(s) Extracted</h3><button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--color-success)] hover:bg-[var(--color-success)] disabled:opacity-50">{saving ? 'Saving...' : <><CheckCircle2 className="w-4 h-4" /> Save All to Library</>}</button></div>
                        <div className="space-y-3">{extractedClaims.map((c, i) => {
                            const tb = TYPE_BADGE[c.claim_type]; return (
                                <div key={i} className="p-4 rounded-xl bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
                                    <div className="flex items-center gap-2 mb-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tb.bg} ${tb.text}`}>{CLAIM_TYPE_LABELS[c.claim_type]}</span><span className="text-xs dash-text-tertiary">{Math.round(c.confidence * 100)}% confidence</span></div>
                                    <p className="text-sm dash-text">{c.claim_text}</p>
                                </div>);
                        })}</div>
                    </div>
                )}
            </>) : (
                loading ? <div className="dash-card rounded-2xl p-8 text-center"><Clock className="w-8 h-8 mx-auto mb-2 dash-text-tertiary animate-spin" /></div>
                    : savedClaims.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><FileSearch className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No claims in library. Extract claims from content first.</p></div>
                        : <div className="space-y-3">{savedClaims.map(c => {
                            const tb = TYPE_BADGE[c.claim_type]; const sb = STATUS_BADGE[c.status]; return (
                                <div key={c.id} className="dash-card rounded-xl p-4 border border-[var(--color-border)]">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tb.bg} ${tb.text}`}>{CLAIM_TYPE_LABELS[c.claim_type]}</span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sb.bg} ${sb.text}`}>{c.status.replace(/_/g, ' ')}</span>{c.has_evidence ? <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-success-soft)] text-[var(--color-success)] flex items-center gap-1"><Link2 className="w-3 h-3" />Evidence</span> : <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-danger-soft)] text-[var(--color-danger)]">No Evidence</span>}</div>
                                            <p className="text-sm dash-text mb-1">{c.claim_text}</p>
                                            <p className="text-xs dash-text-tertiary">{c.source_document} · {Math.round(c.confidence * 100)}%</p>
                                            {(c.evidence || []).length > 0 && <div className="mt-2 space-y-1">{(c.evidence || []).map(e => (<div key={e.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-[var(--color-success-soft)] border border-emerald-100"><Link2 className="w-3 h-3 text-[var(--color-success)]" /><span className="dash-text">{e.reference_title}</span><span className="text-xs px-1 rounded bg-[var(--color-surface)] dash-text-tertiary">{e.strength}</span></div>))}</div>}
                                        </div>
                                        <div className="flex flex-col gap-1 shrink-0">
                                            {c.status === 'unreviewed' && <><button onClick={() => handleStatus(c.id, 'approved')} className="text-xs px-2 py-1 rounded-lg bg-[var(--color-success-soft)] text-[var(--color-success)] hover:bg-[var(--color-success-soft)]">Approve</button><button onClick={() => handleStatus(c.id, 'rejected')} className="text-xs px-2 py-1 rounded-lg bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]">Reject</button><button onClick={() => handleStatus(c.id, 'needs_evidence')} className="text-xs px-2 py-1 rounded-lg bg-[var(--color-warning-soft)] text-[var(--color-warning)] hover:bg-[var(--color-warning-soft)]">Need Evid.</button></>}
                                            <button onClick={() => setShowEvidence(c.id)} className="text-xs px-2 py-1 rounded-lg bg-[var(--color-info-soft)] text-[var(--color-info)] hover:bg-[var(--color-info-soft)]"><Link2 className="w-3 h-3 inline" /> Link</button>
                                        </div>
                                    </div>
                                </div>);
                        })}</div>
            )}

            {/* Link Evidence Modal */}
            {showEvidence && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowEvidence(null)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">Link Evidence</h3><button onClick={() => setShowEvidence(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Evidence Type</label><select value={eForm.evidence_type} onChange={e => setEForm({ ...eForm, evidence_type: e.target.value as EvidenceType })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{EVIDENCE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Reference Title *</label><input value={eForm.reference_title} onChange={e => setEForm({ ...eForm, reference_title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="e.g. CARDIO-001 Phase III Trial" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Reference URL</label><input value={eForm.reference_url} onChange={e => setEForm({ ...eForm, reference_url: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="https://..." /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Evidence Strength</label><select value={eForm.strength} onChange={e => setEForm({ ...eForm, strength: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm"><option value="strong">Strong</option><option value="moderate">Moderate</option><option value="weak">Weak</option></select></div>
                            <button onClick={handleLinkEvidence} disabled={saving || !eForm.reference_title} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Linking...' : 'Link Evidence'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
