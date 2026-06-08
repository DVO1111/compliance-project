import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getScenarios, createScenario, submitAttempt, getMyAttempts, SCENARIO_TYPES, type TrainingScenario, type ScenarioAttempt, type ScenarioType, type Difficulty } from '../../lib/complianceTrainingSimService';
import { GraduationCap, CheckCircle2, XCircle, Clock, X, Plus, Play, Award, BarChart3 } from 'lucide-react';

const DIFF_BADGE: Record<string, { bg: string; text: string }> = { beginner: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' }, intermediate: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' }, advanced: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' } };

type Tab = 'scenarios' | 'results';

export default function TrainingSimulationPage() {
    const { user, profile } = useAuth();
    const companyId = profile?.company_id;
    const [tab, setTab] = useState<Tab>('scenarios');
    const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
    const [attempts, setAttempts] = useState<ScenarioAttempt[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [activeScenario, setActiveScenario] = useState<TrainingScenario | null>(null);
    const [response, setResponse] = useState('');
    const [result, setResult] = useState<ScenarioAttempt | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ title: '', description: '', scenario_type: 'off_label_question' as ScenarioType, difficulty: 'intermediate' as Difficulty, scenario_text: '', correct_response: '', explanation: '' });

    const load = useCallback(async () => {
        if (!companyId || !user) return;
        setLoading(true);
        const [s, a] = await Promise.all([getScenarios(companyId), getMyAttempts(user.id)]);
        setScenarios(s); setAttempts(a); setLoading(false);
    }, [companyId, user]);
    useEffect(() => { load(); }, [load]);

    async function handleCreate() {
        if (!companyId || !form.title || !form.scenario_text || !form.correct_response || !form.explanation) return;
        setSaving(true);
        await createScenario(companyId, form, user?.id);
        setShowCreate(false); setForm({ title: '', description: '', scenario_type: 'off_label_question', difficulty: 'intermediate', scenario_text: '', correct_response: '', explanation: '' }); setSaving(false); load();
    }

    async function handleSubmit() {
        if (!user || !activeScenario || !response) return;
        setSaving(true);
        const r = await submitAttempt(activeScenario.id, user.id, response, activeScenario.correct_response, companyId);
        setResult(r); setSaving(false); load();
    }

    const passRate = attempts.length > 0 ? Math.round((attempts.filter(a => a.passed).length / attempts.length) * 100) : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div><div className="flex items-center gap-3 mb-1"><div className="p-2 rounded-xl bg-[var(--color-accent-soft)]"><GraduationCap className="w-5 h-5 dash-accent" /></div><h2 className="text-2xl font-bold dash-text">Compliance Training</h2></div><p className="dash-text-secondary text-sm ml-12">Scenario-based simulation training with competency tracking</p></div>
                <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90"><Plus className="w-4 h-4" /> Create Scenario</button>
            </div>

            <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface-alt)] w-fit">
                {([{ id: 'scenarios' as Tab, label: 'Scenarios', icon: Play }, { id: 'results' as Tab, label: 'My Results', icon: Award }]).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-[var(--color-surface)] dark:bg-[var(--color-surface)] shadow-sm dash-text' : 'dash-text-secondary hover:dash-text'}`}><t.icon className="w-4 h-4" />{t.label}</button>))}
            </div>

            {tab === 'scenarios' ? (<>
                {loading ? <div className="dash-card rounded-2xl p-8 text-center"><Clock className="w-8 h-8 mx-auto mb-2 dash-text-tertiary animate-spin" /></div>
                    : scenarios.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><GraduationCap className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No scenarios yet. Create your first one.</p></div>
                        : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{scenarios.map(s => {
                            const db = DIFF_BADGE[s.difficulty]; const typeLabel = SCENARIO_TYPES.find(t => t.id === s.scenario_type)?.label || s.scenario_type; return (
                                <div key={s.id} className="dash-card rounded-xl p-5 border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-all">
                                    <div className="flex items-center gap-2 mb-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${db.bg} ${db.text}`}>{s.difficulty}</span><span className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-alt)] dash-text-tertiary">{typeLabel}</span></div>
                                    <h4 className="font-semibold dash-text text-sm mb-1">{s.title}</h4>
                                    <p className="text-xs dash-text-secondary mb-3 line-clamp-2">{s.description}</p>
                                    <button onClick={() => { setActiveScenario(s); setResponse(''); setResult(null); }} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-accent-soft)] dash-accent text-xs font-medium hover:opacity-80"><Play className="w-3.5 h-3.5" /> Start Scenario</button>
                                </div>);
                        })}</div>}
            </>) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        {[{ l: 'Attempts', v: attempts.length, I: BarChart3 }, { l: 'Passed', v: attempts.filter(a => a.passed).length, I: CheckCircle2 }, { l: 'Pass Rate', v: `${passRate}%`, I: Award }].map(m => (
                            <div key={m.l} className="dash-card rounded-xl p-4 border border-[var(--color-border)]"><m.I className="w-4 h-4 dash-text-secondary mb-2" /><p className="text-2xl font-bold dash-text">{m.v}</p><p className="text-xs dash-text-tertiary">{m.l}</p></div>))}
                    </div>
                    {attempts.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><p className="dash-text-secondary text-sm">No attempts yet. Complete a scenario to see results.</p></div>
                        : <div className="space-y-2">{attempts.map(a => (
                            <div key={a.id} className={`dash-card rounded-xl p-4 border ${a.passed ? 'border-[var(--color-success)]/20' : 'border-[var(--color-danger)]/20'}`}>
                                <div className="flex items-center justify-between"><div className="flex items-center gap-2">{a.passed ? <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" /> : <XCircle className="w-4 h-4 text-[var(--color-danger)]" />}<span className="text-sm font-medium dash-text">{a.passed ? 'Passed' : 'Failed'}</span><span className={`text-xs px-2 py-0.5 rounded-full font-bold ${a.score >= 60 ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'}`}>{a.score}/100</span></div><span className="text-xs dash-text-tertiary">{new Date(a.attempted_at).toLocaleString()}</span></div>
                                {a.feedback && <p className="text-xs dash-text-secondary mt-1">{a.feedback}</p>}
                            </div>))}</div>}
                </div>
            )}

            {/* Active Scenario Modal */}
            {activeScenario && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => { setActiveScenario(null); setResult(null); }}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5 flex items-start justify-between rounded-t-2xl">
                            <div><div className="flex items-center gap-2 mb-1"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFF_BADGE[activeScenario.difficulty].bg} ${DIFF_BADGE[activeScenario.difficulty].text}`}>{activeScenario.difficulty}</span></div><h3 className="font-bold dash-text text-lg">{activeScenario.title}</h3></div>
                            <button onClick={() => { setActiveScenario(null); setResult(null); }} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="p-4 rounded-xl bg-[var(--color-surface-alt)] border border-[var(--color-border)]"><h4 className="font-semibold dash-text text-sm mb-2">📋 Scenario</h4><p className="text-sm dash-text leading-relaxed">{activeScenario.scenario_text}</p></div>
                            {!result ? (<>
                                <div><label className="text-xs font-medium dash-text-secondary block mb-1">Your Response *</label><textarea value={response} onChange={e => setResponse(e.target.value)} rows={5} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" placeholder="How would you handle this situation? Be specific about the compliance principles you would apply..." /></div>
                                <button onClick={handleSubmit} disabled={saving || !response} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Evaluating...' : 'Submit Response'}</button>
                            </>) : (
                                <div className="space-y-3">
                                    <div className={`p-4 rounded-xl border-2 ${result.passed ? 'bg-[var(--color-success-soft)] border-emerald-300' : 'bg-[var(--color-danger-soft)] border-[var(--color-danger)]/30'}`}>
                                        <div className="flex items-center gap-3 mb-2">{result.passed ? <CheckCircle2 className="w-6 h-6 text-[var(--color-success)]" /> : <XCircle className="w-6 h-6 text-[var(--color-danger)]" />}<span className={`text-lg font-bold ${result.passed ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>{result.passed ? 'Passed' : 'Needs Improvement'}</span><span className={`text-sm px-3 py-1 rounded-full font-bold ${result.score >= 60 ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'}`}>{result.score}/100</span></div>
                                        <p className="text-sm">{result.feedback}</p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-[var(--color-info-soft)] border border-[var(--color-info)]/20"><h4 className="font-semibold text-[var(--color-info)] text-sm mb-1">📘 Expected Response</h4><p className="text-sm text-[var(--color-info)]">{activeScenario.correct_response}</p></div>
                                    <div className="p-4 rounded-xl bg-[var(--color-purple)]/10 border border-[var(--color-purple)]/20"><h4 className="font-semibold text-[var(--color-purple)] text-sm mb-1">💡 Explanation</h4><p className="text-sm text-[var(--color-purple)]">{activeScenario.explanation}</p></div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Scenario */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowCreate(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">Create Scenario</h3><button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Title *</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Type</label><select value={form.scenario_type} onChange={e => setForm({ ...form, scenario_type: e.target.value as ScenarioType })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{SCENARIO_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">Difficulty</label><select value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value as Difficulty })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['beginner', 'intermediate', 'advanced'].map(d => <option key={d}>{d}</option>)}</select></div></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Scenario Text *</label><textarea value={form.scenario_text} onChange={e => setForm({ ...form, scenario_text: e.target.value })} rows={4} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" placeholder="Describe the scenario the trainee will face..." /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Correct Response *</label><textarea value={form.correct_response} onChange={e => setForm({ ...form, correct_response: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" placeholder="The ideal response..." /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Explanation *</label><textarea value={form.explanation} onChange={e => setForm({ ...form, explanation: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" placeholder="Why this is the correct approach..." /></div>
                            <button onClick={handleCreate} disabled={saving || !form.title || !form.scenario_text || !form.correct_response || !form.explanation} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Creating...' : 'Create Scenario'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
