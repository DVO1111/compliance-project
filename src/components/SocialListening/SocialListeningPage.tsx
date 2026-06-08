import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getMentions, addMention, updateMentionStatus, getRules, addRule, toggleRule, runSocialAIAnalysis, PLATFORMS, FLAG_LABELS, type SocialMention, type MonitoringRule, type MentionStatus, type FlagType, type AuthorType, type SentimentType } from '../../lib/socialListeningService';
import { Radio, AlertTriangle, CheckCircle2, Clock, Search, ChevronRight, X, Plus, ToggleLeft, ToggleRight, Eye, Sparkles, Smile, Frown, MessageSquare, ShieldAlert } from 'lucide-react';

const SEV_BADGE: Record<string, { bg: string; text: string }> = { low: { bg: 'dash-surface-alt', text: 'dash-text' }, medium: { bg: 'bg-behance-amber-100', text: 'text-behance-amber-700' }, high: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' }, critical: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' } };
const STATUS_BADGE: Record<string, { bg: string; text: string }> = { new: { bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]' }, reviewing: { bg: 'bg-behance-amber-100', text: 'text-behance-amber-700' }, escalated: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' }, resolved: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' }, dismissed: { bg: 'dash-surface-alt', text: 'dash-text' } };
const SENTIMENT_ICON: Record<string, any> = { positive: Smile, negative: Frown, neutral: MessageSquare };
const SENTIMENT_COLOR: Record<string, string> = { positive: 'text-[var(--color-success)]', negative: 'text-[var(--color-danger)]', neutral: 'dash-text-tertiary' };

type Tab = 'mentions' | 'rules';

export default function SocialListeningPage() {
    const { profile, user } = useAuth();
    const companyId = profile?.company_id;
    const [tab, setTab] = useState<Tab>('mentions');
    const [mentions, setMentions] = useState<SocialMention[]>([]);
    const [rules, setRules] = useState<MonitoringRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showAddRule, setShowAddRule] = useState(false);
    const [showAddMention, setShowAddMention] = useState(false);
    const [saving, setSaving] = useState(false);
    const [analyzingId, setAnalyzingId] = useState<string | null>(null);
    const [rForm, setRForm] = useState({ platform: 'LinkedIn', keywords: '', product: '', rule_type: 'keyword' });
    const [mForm, setMForm] = useState({ platform: 'LinkedIn', author: '', author_type: 'unknown' as AuthorType, content: '', url: '', flag_type: '' as string, severity: 'low' });

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const [m, r] = await Promise.all([getMentions(companyId), getRules(companyId)]);
        setMentions(m); setRules(r); setLoading(false);
    }, [companyId]);
    useEffect(() => { load(); }, [load]);

    const filtered = mentions.filter(m => !search || m.content.toLowerCase().includes(search.toLowerCase()) || m.author.toLowerCase().includes(search.toLowerCase()));

    async function handleAddRule() {
        if (!companyId || !rForm.keywords) return;
        setSaving(true);
        await addRule(companyId, { platform: rForm.platform, keywords: rForm.keywords.split(',').map(k => k.trim()).filter(Boolean), product: rForm.product || undefined, rule_type: rForm.rule_type }, user?.id);
        setShowAddRule(false); setRForm({ platform: 'LinkedIn', keywords: '', product: '', rule_type: 'keyword' }); setSaving(false); load();
    }

    async function handleAddMention() {
        if (!companyId || !mForm.content || !mForm.author) return;
        setSaving(true);
        await addMention(companyId, { platform: mForm.platform, author: mForm.author, author_type: mForm.author_type, content: mForm.content, url: mForm.url || undefined, flag_type: (mForm.flag_type as FlagType) || undefined, severity: mForm.severity }, user?.id);
        setShowAddMention(false); setMForm({ platform: 'LinkedIn', author: '', author_type: 'unknown', content: '', url: '', flag_type: '', severity: 'low' }); setSaving(false); load();
    }

    async function handleStatus(id: string, status: MentionStatus) { await updateMentionStatus(id, status, companyId ?? undefined, user?.id); load(); }

    async function handleAIAnalysis(id: string) {
        setAnalyzingId(id);
        await runSocialAIAnalysis(id);
        setAnalyzingId(null);
        load();
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div><div className="flex items-center gap-3 mb-1"><div className="p-2 rounded-xl bg-[var(--color-accent-soft)]"><Radio className="w-5 h-5 dash-accent" /></div><h2 className="text-2xl font-bold dash-text">Social Media Listening</h2></div><p className="dash-text-secondary text-sm ml-12">Monitor social channels for compliance-relevant mentions</p></div>
                <div className="flex gap-2">
                    {tab === 'mentions' && <button onClick={() => setShowAddMention(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90"><Plus className="w-4 h-4" /> Log Mention</button>}
                    {tab === 'rules' && <button onClick={() => setShowAddRule(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90"><Plus className="w-4 h-4" /> Add Rule</button>}
                </div>
            </div>

            {mentions.filter(m => m.severity === 'critical' && m.status === 'new').length > 0 && <div className="p-3 rounded-xl bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 flex items-center gap-3"><AlertTriangle className="w-5 h-5 text-[var(--color-danger)]" /><p className="text-sm text-[var(--color-danger)] font-medium">{mentions.filter(m => m.severity === 'critical' && m.status === 'new').length} critical mention(s) require immediate review</p></div>}

            <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface-alt)] w-fit">
                {([{ id: 'mentions' as Tab, label: 'Mention Feed', icon: Eye }, { id: 'rules' as Tab, label: 'Monitoring Rules', icon: Radio }]).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'dash-card dark:dash-card shadow-sm dash-text' : 'dash-text-secondary hover:dash-text'}`}><t.icon className="w-4 h-4" />{t.label}</button>))}
            </div>

            {tab === 'mentions' ? (<>
                <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" /><input type="text" placeholder="Search mentions..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" /></div>
                {loading ? <div className="dash-card rounded-2xl p-8 text-center"><Clock className="w-8 h-8 mx-auto mb-2 dash-text-tertiary animate-spin" /></div>
                    : filtered.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><Radio className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No mentions detected. Add monitoring rules to start.</p></div>
                        : <div className="space-y-3">{filtered.map(m => {
                            const sb = STATUS_BADGE[m.status]; const sv = SEV_BADGE[m.severity]; return (
                                <div key={m.id} className={`dash-card rounded-xl p-4 border transition-all ${m.severity === 'critical' ? 'border-[var(--color-danger)]/20' : 'border-[var(--color-border)]'}`}>
                                    <div className="flex items-start gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-alt)] dash-text-tertiary">{m.platform}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sb.bg} ${sb.text}`}>{m.status}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sv.bg} ${sv.text}`}>{m.severity}</span>
                                                {m.flag_type && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)] font-medium">{FLAG_LABELS[m.flag_type] || m.flag_type}</span>}
                                                {m.sentiment && (() => {
                                                    const Icon = SENTIMENT_ICON[m.sentiment] || MessageSquare;
                                                    return <span className={`flex items-center gap-1 text-[10px] font-bold uppercase ${SENTIMENT_COLOR[m.sentiment]}`}><Icon className="w-3 h-3" /> {m.sentiment} Sentiment</span>;
                                                })()}
                                            </div>
                                            <p className="text-sm dash-text mb-1">{m.content}</p>
                                            <p className="text-xs dash-text-tertiary">@{m.author} · {m.author_type} · {new Date(m.detected_at).toLocaleString()}</p>

                                            {m.ai_analysis && (
                                                <div className="mt-3 p-3 rounded-lg bg-[var(--color-accent-soft)]/20 border border-[var(--color-accent)]/10 space-y-2">
                                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase dash-accent tracking-tighter">
                                                        <Sparkles className="w-3 h-3" /> AI Agentic Triage
                                                    </div>
                                                    <p className="text-xs dash-text italic leading-snug">"{m.ai_analysis}"</p>
                                                    {m.ai_recommendation && (
                                                        <div className="flex gap-2 p-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">
                                                            <ShieldAlert className="w-4 h-4 text-[var(--color-warning)] shrink-0" />
                                                            <div>
                                                                <p className="text-[10px] font-bold dash-text-secondary leading-none mb-1">Recommended Action</p>
                                                                <p className="text-[11px] dash-text leading-tight">{m.ai_recommendation}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1 shrink-0">
                                            {m.status === 'new' && <><button onClick={() => handleStatus(m.id, 'reviewing')} className="text-xs px-2 py-1 rounded-lg bg-behance-amber-100 text-behance-amber-700 hover:bg-behance-amber-200">Review</button><button onClick={() => handleStatus(m.id, 'dismissed')} className="text-xs px-2 py-1 rounded-lg dash-surface-alt dash-text-secondary hover:bg-[var(--color-surface-alt)]">Dismiss</button></>}
                                            {m.status === 'reviewing' && <><button onClick={() => handleStatus(m.id, 'escalated')} className="text-xs px-2 py-1 rounded-lg bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]">Escalate</button><button onClick={() => handleStatus(m.id, 'resolved')} className="text-xs px-2 py-1 rounded-lg bg-[var(--color-success-soft)] text-[var(--color-success)] hover:bg-[var(--color-success-soft)]">Resolve</button></>}
                                            <button
                                                onClick={() => handleAIAnalysis(m.id)}
                                                disabled={analyzingId === m.id}
                                                className="text-[10px] px-2 py-1 rounded-lg bg-[var(--color-surface-alt)] dash-text-tertiary hover:dash-accent flex items-center justify-center gap-1 border border-dashed border-[var(--color-border)] mt-1"
                                            >
                                                {analyzingId === m.id ? <Clock className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                                {analyzingId === m.id ? 'Analyzing...' : 'Re-run AI'}
                                            </button>
                                        </div>
                                    </div>
                                </div>);
                        })}</div>}
            </>) : (
                rules.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><Radio className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No monitoring rules. Add one to start.</p></div>
                    : <div className="space-y-3">{rules.map(r => (
                        <div key={r.id} className="dash-card rounded-xl p-4 border border-[var(--color-border)] flex items-center gap-4">
                            <button onClick={() => toggleRule(r.id, !r.active, companyId ?? undefined, user?.id).then(() => load())} className="shrink-0">{r.active ? <ToggleRight className="w-6 h-6 text-[var(--color-success)]" /> : <ToggleLeft className="w-6 h-6 dash-text-tertiary" />}</button>
                            <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-0.5"><span className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-alt)] dash-text-tertiary">{r.platform}</span><span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-surface-alt)] dash-text-tertiary capitalize">{r.rule_type}</span></div>
                                <p className="text-sm dash-text font-medium">{r.keywords.join(', ')}</p>
                                {r.product && <p className="text-xs dash-text-tertiary">Product: {r.product}</p>}
                            </div>
                        </div>))}</div>
            )}

            {/* Add Mention Modal */}
            {showAddMention && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowAddMention(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">Log Social Mention</h3><button onClick={() => setShowAddMention(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Platform *</label><select value={mForm.platform} onChange={e => setMForm({ ...mForm, platform: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">Author Type</label><select value={mForm.author_type} onChange={e => setMForm({ ...mForm, author_type: e.target.value as AuthorType })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['employee', 'agency', 'hcp', 'patient', 'influencer', 'unknown'].map(t => <option key={t} value={t}>{t}</option>)}</select></div></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Author *</label><input value={mForm.author} onChange={e => setMForm({ ...mForm, author: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="Username or handle" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Content *</label><textarea value={mForm.content} onChange={e => setMForm({ ...mForm, content: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" /></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Flag Type</label><select value={mForm.flag_type} onChange={e => setMForm({ ...mForm, flag_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm"><option value="">None</option>{Object.entries(FLAG_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">Severity</label><select value={mForm.severity} onChange={e => setMForm({ ...mForm, severity: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['low', 'medium', 'high', 'critical'].map(s => <option key={s}>{s}</option>)}</select></div></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">URL</label><input value={mForm.url} onChange={e => setMForm({ ...mForm, url: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="https://..." /></div>
                            <button onClick={handleAddMention} disabled={saving || !mForm.content || !mForm.author} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Logging...' : 'Log Mention'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Rule Modal */}
            {showAddRule && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowAddRule(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">Add Monitoring Rule</h3><button onClick={() => setShowAddRule(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Platform</label><select value={rForm.platform} onChange={e => setRForm({ ...rForm, platform: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">Rule Type</label><select value={rForm.rule_type} onChange={e => setRForm({ ...rForm, rule_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['keyword', 'hashtag', 'mention', 'influencer'].map(t => <option key={t}>{t}</option>)}</select></div></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Keywords (comma-separated) *</label><input value={rForm.keywords} onChange={e => setRForm({ ...rForm, keywords: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="e.g. CardioMax, heart health, #pharma" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Product</label><input value={rForm.product} onChange={e => setRForm({ ...rForm, product: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="Optional" /></div>
                            <button onClick={handleAddRule} disabled={saving || !rForm.keywords} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Adding...' : 'Add Rule'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

