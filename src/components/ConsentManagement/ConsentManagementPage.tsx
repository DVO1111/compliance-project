import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, Plus, X, Link2, Loader2, AlertTriangle, CheckCircle, XCircle, Calendar, Clock, Lock, Scan, UserCheck } from 'lucide-react';
import { createConsent, revokeConsent, getConsents, linkConsentToContent, scanTextForPHI, getPHIRiskLevel, savePHIScan, type PatientConsent, type ConsentType, type PHIFinding } from '../../lib/consentService';
import { supabase } from '../../lib/supabase';

const CONSENT_TYPES: { value: ConsentType; label: string }[] = [
    { value: 'testimonial', label: 'Testimonial' }, { value: 'case_study', label: 'Case Study' },
    { value: 'ugc', label: 'User-Generated Content' }, { value: 'imagery', label: 'Imagery / Photos' },
    { value: 'video', label: 'Video' }, { value: 'general', label: 'General' },
];
const STATUS_COLORS: Record<string, string> = { active: 'bg-[var(--color-success-soft)] text-[var(--color-success)]', expired: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]', revoked: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' };
const RISK_COLORS: Record<string, string> = { none: 'bg-[var(--color-success-soft)] text-[var(--color-success)]', low: 'bg-[var(--color-info-soft)] text-[var(--color-info)]', medium: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]', high: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]', critical: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' };

export default function ConsentManagementPage() {
    const { user, profile } = useAuth();
    const companyId = (profile as any)?.company_id as string | undefined;
    const [tab, setTab] = useState<'vault' | 'phi'>('vault');
    const [consents, setConsents] = useState<PatientConsent[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newPatientName, setNewPatientName] = useState('');
    const [newType, setNewType] = useState<ConsentType>('testimonial');
    const [newSignedAt, setNewSignedAt] = useState('');
    const [newExpiresAt, setNewExpiresAt] = useState('');
    const [newDocUrl, setNewDocUrl] = useState('');
    const [newNotes, setNewNotes] = useState('');
    const [adding, setAdding] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState<PatientConsent | null>(null);
    const [linkContentId, setLinkContentId] = useState('');
    const [linking, setLinking] = useState(false);
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [phiText, setPhiText] = useState('');
    const [phiFindings, setPhiFindings] = useState<PHIFinding[]>([]);
    const [phiRisk, setPhiRisk] = useState('');
    const [phiScanned, setPhiScanned] = useState(false);

    const load = useCallback(async () => { if (!companyId) return; setLoading(true); setConsents(await getConsents(companyId)); setLoading(false); }, [companyId]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { if (!companyId) return; supabase.from('content_submissions').select('id, title').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50).then(({ data }) => setSubmissions(data ?? [])); }, [companyId]);

    const handleAdd = async () => { if (!companyId || !user || !newPatientName.trim()) return; setAdding(true); await createConsent(companyId, { patientName: newPatientName, consentType: newType, signedAt: newSignedAt || undefined, expiresAt: newExpiresAt || undefined, documentUrl: newDocUrl || undefined, notes: newNotes || undefined }, user.id); setShowAddModal(false); setNewPatientName(''); await load(); setAdding(false); };
    const handleRevoke = async (id: string) => { if (!confirm('Revoke this consent?')) return; await revokeConsent(id); await load(); };
    const handleLink = async () => { if (!showLinkModal || !linkContentId || !companyId || !user) return; setLinking(true); await linkConsentToContent(showLinkModal.id, linkContentId, companyId, user.id); setShowLinkModal(null); setLinkContentId(''); setLinking(false); };
    const handlePHIScan = () => { const f = scanTextForPHI(phiText); setPhiFindings(f); setPhiRisk(getPHIRiskLevel(f)); setPhiScanned(true); if (companyId && user) savePHIScan(companyId, null, f, user.id).catch(() => { }); };
    const isExpiringSoon = (c: PatientConsent) => c.expires_at && c.consent_status === 'active' && (new Date(c.expires_at).getTime() - Date.now()) / 86400000 <= 30 && (new Date(c.expires_at).getTime() - Date.now()) > 0;

    if (!companyId) return <div className="text-center py-16"><ShieldCheck className="w-10 h-10 text-[var(--color-text-tertiary)] mx-auto mb-3" /><p className="text-sm text-[var(--color-text-secondary)]">Company not set.</p></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]"><UserCheck className="w-5 h-5 dash-accent" /></div>
                        <h2 className="text-2xl font-bold dash-text">Consent Management</h2>
                    </div>
                    <p className="dash-text-secondary text-sm ml-12">Patient consent vault, content linking & PHI scanning</p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[['Total', consents.length, 'dash-text'], ['Active', consents.filter(c => c.consent_status === 'active').length, 'text-[var(--color-success)]'], ['Expiring', consents.filter(c => isExpiringSoon(c)).length, 'text-[var(--color-warning)]'], ['Revoked', consents.filter(c => c.consent_status === 'revoked').length, 'text-[var(--color-danger)]']].map(([l, v, cl]) => (
                    <div key={String(l)} className="dash-card rounded-xl p-4 border border-[var(--color-border)]"><p className="text-[11px] dash-text-tertiary">{l as string}</p><p className={`text-xl font-bold mt-1 ${cl}`}>{String(v)}</p></div>
                ))}
            </div>

            <div className="flex items-center gap-2">
                {([['vault', 'Consent Vault'], ['phi', 'PHI Scanner']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? 'bg-[var(--color-accent)] text-white' : 'dash-card border border-[var(--color-border)] dash-text-secondary'}`}>{l}</button>
                ))}
            </div>

            {loading ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin dash-accent" /></div> : <>
                {tab === 'vault' && (
                    <div className="dash-card rounded-2xl border border-[var(--color-border)] overflow-hidden">
                        <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                            <h3 className="font-semibold dash-text flex items-center gap-2"><Lock className="w-4 h-4 dash-accent" />Consent Records</h3>
                            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-white hover:opacity-90"><Plus className="w-4 h-4" />Add Consent</button>
                        </div>
                        {consents.length === 0 ? <div className="text-center py-14"><ShieldCheck className="w-8 h-8 dash-text-tertiary mx-auto mb-2" /><p className="text-sm dash-text-secondary">No consent records yet.</p></div> : (
                            <div className="divide-y divide-[var(--color-border)]">{consents.map((c) => (
                                <div key={c.id} className="px-5 py-4 flex items-center gap-4">
                                    <div className="p-2 rounded-lg bg-[var(--color-surface-alt)]"><UserCheck className="w-4 h-4 dash-accent" /></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold dash-text text-sm">{c.patient_name}</p>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[c.consent_status]}`}>{c.consent_status}</span>
                                            {isExpiringSoon(c) && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-warning-soft)] text-[var(--color-warning)]">⚠ Expiring</span>}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs dash-text-tertiary mt-0.5">
                                            <span>{c.consent_type}</span>
                                            {c.signed_at && <span><Calendar className="w-3 h-3 inline" /> {new Date(c.signed_at).toLocaleDateString()}</span>}
                                            {c.expires_at && <span><Clock className="w-3 h-3 inline" /> {new Date(c.expires_at).toLocaleDateString()}</span>}
                                        </div>
                                    </div>
                                    <button onClick={() => setShowLinkModal(c)} className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-[var(--color-border)] dash-text-secondary"><Link2 className="w-3 h-3 inline" /> Link</button>
                                    {c.consent_status === 'active' && <button onClick={() => handleRevoke(c.id)} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"><XCircle className="w-3 h-3 inline" /> Revoke</button>}
                                </div>
                            ))}</div>
                        )}
                    </div>
                )}

                {tab === 'phi' && (
                    <div className="space-y-4">
                        <div className="dash-card rounded-2xl border border-[var(--color-border)] p-5">
                            <h3 className="font-semibold dash-text flex items-center gap-2 mb-3"><Scan className="w-4 h-4 dash-accent" />PHI Anonymization Scanner</h3>
                            <p className="text-xs dash-text-tertiary mb-3">Scan text for SSNs, phone numbers, emails, DOBs, MRNs, and addresses.</p>
                            <textarea value={phiText} onChange={(e) => setPhiText(e.target.value)} rows={5} placeholder="Paste content to scan..."
                                className="w-full border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm dash-surface dash-text resize-none focus:ring-2 focus:ring-[var(--color-accent)]" />
                            <button onClick={handlePHIScan} disabled={!phiText.trim()} className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50"><Scan className="w-4 h-4" />Scan</button>
                        </div>
                        {phiScanned && (
                            <div className="dash-card rounded-2xl border border-[var(--color-border)] overflow-hidden">
                                <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                                    <h3 className="font-semibold dash-text">Results</h3>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${RISK_COLORS[phiRisk] || RISK_COLORS.none}`}>{phiRisk === 'none' ? '✓ Clean' : `${phiRisk.toUpperCase()} RISK`}</span>
                                </div>
                                {phiFindings.length === 0 ? <div className="p-6 text-center"><CheckCircle className="w-8 h-8 text-[var(--color-success)] mx-auto mb-2" /><p className="text-sm dash-text font-medium">No PHI detected</p></div> : (
                                    <div className="divide-y divide-[var(--color-border)]">{phiFindings.map((f, i) => (
                                        <div key={i} className="px-5 py-3 flex items-start gap-3">
                                            <AlertTriangle className="w-4 h-4 text-[var(--color-danger)] mt-0.5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-semibold dash-text">{f.type}</span>
                                                <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-danger-soft)] text-[var(--color-danger)]">DETECTED</span>
                                                <p className="text-xs font-mono text-[var(--color-danger)] mt-1">"{f.value}"</p>
                                                <p className="text-xs dash-text-tertiary mt-0.5 italic">{f.context}</p>
                                            </div>
                                        </div>
                                    ))}</div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </>}

            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="dash-card rounded-2xl max-w-lg w-full overflow-hidden">
                        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between"><h3 className="font-bold dash-text">Add Consent Record</h3><button onClick={() => setShowAddModal(false)}><X className="w-4 h-4" /></button></div>
                        <div className="p-6 space-y-3">
                            <div><label className="text-xs font-semibold dash-text-secondary block mb-1">Patient Name *</label><input value={newPatientName} onChange={(e) => setNewPatientName(e.target.value)} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text" /></div>
                            <div><label className="text-xs font-semibold dash-text-secondary block mb-1">Type</label><select value={newType} onChange={(e) => setNewType(e.target.value as ConsentType)} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text">{CONSENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold block mb-1">Signed</label><input type="date" value={newSignedAt} onChange={(e) => setNewSignedAt(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div><div><label className="text-xs font-semibold block mb-1">Expires</label><input type="date" value={newExpiresAt} onChange={(e) => setNewExpiresAt(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div></div>
                            <div><label className="text-xs font-semibold block mb-1">Document URL</label><input value={newDocUrl} onChange={(e) => setNewDocUrl(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                            <div><label className="text-xs font-semibold block mb-1">Notes</label><textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" /></div>
                            <button onClick={handleAdd} disabled={adding || !newPatientName.trim()} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] disabled:opacity-50">{adding ? 'Adding...' : 'Add Consent'}</button>
                        </div>
                    </div>
                </div>
            )}

            {showLinkModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="dash-card rounded-2xl max-w-lg w-full overflow-hidden">
                        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between"><h3 className="font-bold dash-text">Link to Content</h3><button onClick={() => setShowLinkModal(null)}><X className="w-4 h-4" /></button></div>
                        <div className="p-6 space-y-4">
                            <div className="bg-[var(--color-surface-alt)] rounded-lg p-3 text-sm"><p className="font-semibold dash-text">{showLinkModal.patient_name}</p></div>
                            <select value={linkContentId} onChange={(e) => setLinkContentId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Select content...</option>{submissions.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
                            <button onClick={handleLink} disabled={linking || !linkContentId} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] disabled:opacity-50">{linking ? 'Linking...' : 'Link Consent'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
