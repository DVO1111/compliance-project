import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    predictContentRisk, getIndustryInsights, getHistoricalTrends,
    savePrediction, getSavedPredictions, type RiskPrediction,
} from '../../lib/predictiveRiskService';
import { BrainCircuit, Lightbulb, BarChart3, Save, Clock, History, CheckCircle2, Globe, Zap, Info } from 'lucide-react';
import PredictiveRiskHeatmapWidget from '../Dashboard/widgets/PredictiveRiskHeatmapWidget';
import EarlyWarningSystemWidget from '../Dashboard/widgets/EarlyWarningSystemWidget';
import { logger } from '../../lib/logger';

const GRADE_COLORS: Record<string, string> = { A: 'text-[var(--color-success)] bg-[var(--color-success-soft)] border-[var(--color-success)]/20', B: 'text-[var(--color-info)] bg-[var(--color-info-soft)] border-[var(--color-info)]/20', C: 'text-[var(--color-warning)] bg-[var(--color-warning-soft)] border-[var(--color-warning)]/20', D: 'text-[var(--color-warning)] bg-[var(--color-warning-soft)] border-[var(--color-warning)]/20', F: 'text-[var(--color-danger)] bg-[var(--color-danger-soft)] border-[var(--color-danger)]/20' };

type Tab = 'predictor' | 'saved' | 'insights' | 'analytics';

export default function PredictiveRiskPage() {
    const { user, profile } = useAuth();
    const companyId = profile?.company_id;
    const [tab, setTab] = useState<Tab>('predictor');
    const [platform, setPlatform] = useState('Instagram');
    const [area, setArea] = useState('Cardiovascular');
    const [market, setMarket] = useState('US');
    const [claims, setClaims] = useState(['efficacy']);
    const [prediction, setPrediction] = useState<RiskPrediction | null>(null);
    const [savedList, setSavedList] = useState<RiskPrediction[]>([]);
    const [saving, setSaving] = useState(false);
    const [loadingAI, setLoadingAI] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const insights = useMemo(() => getIndustryInsights(), []);
    const trends = useMemo(() => getHistoricalTrends(), []);

    const loadSaved = useCallback(async () => {
        if (!companyId) return;
        const data = await getSavedPredictions(companyId);
        setSavedList(data);
    }, [companyId]);

    useEffect(() => { loadSaved(); }, [loadSaved]);

    async function runPrediction() {
        setLoadingAI(true);
        setPrediction(null);
        try {
            const result = await predictContentRisk({ platform, therapeuticArea: area, claimTypes: claims, targetMarket: market, audienceType: 'general' });
            setPrediction(result);
            setSaveSuccess(false);
        } catch (err) {
            logger.error(err);
        } finally {
            setLoadingAI(false);
        }
    }

    async function handleSave() {
        if (!companyId || !user || !prediction) return;
        setSaving(true);
        const ok = await savePrediction(companyId, user.id, prediction);
        setSaving(false);
        if (ok) { setSaveSuccess(true); loadSaved(); }
    }

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-center gap-3 mb-1"><div className="p-2 rounded-xl bg-[var(--color-accent-soft)]"><BrainCircuit className="w-5 h-5 dash-accent" /></div><h2 className="text-2xl font-bold dash-text">Predictive Risk Modeling</h2></div>
                <p className="dash-text-secondary text-sm ml-12">Predict regulatory scrutiny before formal review</p>
            </div>

            <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface-alt)] w-fit">
                {([{ id: 'predictor' as Tab, label: 'Predictor', icon: BrainCircuit }, { id: 'analytics' as Tab, label: 'Global Analytics', icon: Globe }, { id: 'saved' as Tab, label: 'Saved', icon: History }, { id: 'insights' as Tab, label: 'Insights', icon: Lightbulb }]).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-[var(--color-surface)] dark:bg-[var(--color-surface)] shadow-sm dash-text' : 'dash-text-secondary hover:dash-text'}`}><t.icon className="w-4 h-4" />{t.label}</button>
                ))}
            </div>

            {tab === 'predictor' ? (<>
                <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)]">
                    <h3 className="font-semibold dash-text text-sm mb-4">Content Risk Predictor</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        <div><label className="text-xs font-medium dash-text-secondary block mb-1">Platform</label><select value={platform} onChange={e => setPlatform(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['Instagram', 'Facebook', 'LinkedIn', 'X', 'Website', 'TV', 'Print', 'Influencer'].map(p => <option key={p}>{p}</option>)}</select></div>
                        <div><label className="text-xs font-medium dash-text-secondary block mb-1">Therapeutic Area</label><select value={area} onChange={e => setArea(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['Oncology', 'Cardiovascular', 'Mental_Health', 'Pediatric', 'Dermatology', 'Diabetes', 'General'].map(a => <option key={a} value={a}>{a.replace('_', ' ')}</option>)}</select></div>
                        <div><label className="text-xs font-medium dash-text-secondary block mb-1">Target Market</label><select value={market} onChange={e => setMarket(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['US', 'EU', 'UK', 'Japan', 'Brazil', 'Nigeria'].map(m => <option key={m}>{m}</option>)}</select></div>
                        <div><label className="text-xs font-medium dash-text-secondary block mb-1">Claim Types</label><div className="flex flex-wrap gap-1">{['efficacy', 'superiority', 'safety', 'cure'].map(c => (<button key={c} onClick={() => setClaims(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])} className={`text-xs px-2 py-1 rounded-lg border font-medium transition-all ${claims.includes(c) ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] dash-accent' : 'border-[var(--color-border)] dash-text-secondary'}`}>{c}</button>))}</div></div>
                    </div>
                    <button onClick={runPrediction} disabled={loadingAI} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2">
                        {loadingAI ? <><Clock className="w-4 h-4 animate-spin" /> Analyzing Risk...</> : <><Zap className="w-4 h-4" /> Run AI Prediction</>}
                    </button>
                </div>

                {loadingAI && (
                    <div className="dash-card rounded-2xl p-12 text-center border border-[var(--color-accent)]/20 shadow-lg animate-pulse">
                        <BrainCircuit className="w-12 h-12 mx-auto mb-4 dash-accent animate-bounce" />
                        <h3 className="text-lg font-bold dash-text mb-2">Simulating Regulatory Scrutiny...</h3>
                        <p className="dash-text-secondary text-sm">Gemini is analyzing platform guidelines and historical rejections for {area} content.</p>
                    </div>
                )}

                {prediction && (
                    <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)]">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="text-center">
                                <p className="text-xs font-medium dash-text-secondary uppercase tracking-wider mb-3">Risk Score</p>
                                <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full border-4 ${GRADE_COLORS[prediction.risk_grade]} mb-2`}><span className="text-3xl font-black">{prediction.risk_grade}</span></div>
                                <p className="text-2xl font-bold dash-text">{prediction.predicted_risk}<span className="text-sm font-normal">/100</span></p>
                                <p className="text-xs dash-text-tertiary mt-1">Confidence: {prediction.confidence}%</p>
                                <button onClick={handleSave} disabled={saving || saveSuccess} className={`mt-3 flex items-center gap-2 mx-auto px-4 py-2 rounded-xl text-sm font-medium transition-all ${saveSuccess ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-surface-alt)] dash-text hover:bg-[var(--color-accent-soft)]'}`}>
                                    {saveSuccess ? <><CheckCircle2 className="w-4 h-4" /> Saved</> : saving ? <><Clock className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Prediction</>}
                                </button>
                            </div>
                            <div className="lg:col-span-2">
                                <h4 className="font-semibold dash-text text-sm mb-3">Risk Factors</h4>
                                <div className="space-y-2">{prediction.top_risk_factors.map(f => (
                                    <div key={f.factor} className="p-3 rounded-lg bg-[var(--color-surface-alt)]">
                                        <div className="flex items-center justify-between mb-1"><span className="text-sm font-medium dash-text">{f.factor}</span><span className="text-xs font-semibold dash-text">{f.impact}pt</span></div>
                                        <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden mb-1"><div className={`h-full rounded-full ${f.impact > 15 ? 'bg-[var(--color-danger)]' : f.impact > 8 ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-success)]'}`} style={{ width: `${Math.min(f.impact * 4, 100)}%` }} /></div>
                                        <p className="text-xs dash-text-secondary">{f.detail}</p>
                                    </div>
                                ))}</div>
                                <div className={`mt-4 p-4 rounded-xl border flex gap-3 ${prediction.predicted_risk > 50 ? 'bg-[var(--color-warning-soft)] border-[var(--color-warning)]/20' : 'bg-[var(--color-success-soft)] border-[var(--color-success)]/20'}`}>
                                    <Info className="w-5 h-5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold mb-1">Recommendation</p>
                                        <p className="text-sm leading-relaxed">{prediction.recommendation}</p>
                                    </div>
                                </div>
                                {prediction.ai_rationale && (
                                    <div className="mt-4 p-4 rounded-xl bg-[var(--color-accent-soft)]/30 border border-[var(--color-accent)]/10">
                                        <h5 className="text-[10px] font-black uppercase dash-accent tracking-widest mb-2 flex items-center gap-2"><Zap className="w-3 h-3" /> AI Rationale</h5>
                                        <p className="text-xs dash-text italic leading-relaxed">{prediction.ai_rationale}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </>) : tab === 'analytics' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {companyId && <PredictiveRiskHeatmapWidget companyId={companyId} />}
                    {companyId && <EarlyWarningSystemWidget companyId={companyId} />}
                </div>
            ) : tab === 'saved' ? (
                savedList.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><History className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No saved predictions yet. Run a prediction and save it.</p></div>
                    : <div className="space-y-3">{savedList.map(p => {
                        const gc = GRADE_COLORS[p.risk_grade]; return (
                            <div key={p.id} className="dash-card rounded-xl p-4 border border-[var(--color-border)] flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0 ${gc}`}><span className="text-lg font-black">{p.risk_grade}</span></div>
                                <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-0.5 flex-wrap"><span className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-alt)] dash-text-tertiary">{p.platform}</span><span className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-alt)] dash-text-tertiary">{p.therapeutic_area}</span><span className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-alt)] dash-text-tertiary">{p.target_market}</span></div>
                                    <p className="text-sm dash-text font-medium">{p.predicted_risk}/100 risk · {p.confidence}% confidence</p>
                                    <p className="text-xs dash-text-tertiary">{p.created_at ? new Date(p.created_at).toLocaleString() : ''}</p>
                                </div>
                            </div>);
                    })}</div>
            ) : (<>
                <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)]">
                    <h3 className="font-semibold dash-text mb-4 flex items-center gap-2"><Lightbulb className="w-4 h-4 dash-accent" />Industry Insights</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{insights.map(i => (
                        <div key={i.id} className="p-4 rounded-xl bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
                            <p className="text-sm dash-text font-medium mb-2">{i.insight}</p>
                            <div className="flex items-center gap-3 text-xs dash-text-tertiary"><span>{i.dataPoints.toLocaleString()} data points</span><span className={`px-1.5 py-0.5 rounded font-semibold ${i.rejectionRate > 50 ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'}`}>{i.rejectionRate}% rejection</span><span>{i.market}</span></div>
                        </div>))}</div>
                </div>
                <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)]">
                    <h3 className="font-semibold dash-text mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 dash-accent" />Historical Trends</h3>
                    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--color-border)]"><th className="text-left py-2 px-3 font-medium dash-text-secondary">Month</th><th className="text-center py-2 px-3 font-medium dash-text-secondary">Submissions</th><th className="text-center py-2 px-3 font-medium dash-text-secondary">Rejections</th><th className="text-center py-2 px-3 font-medium dash-text-secondary">Avg Risk</th></tr></thead>
                        <tbody>{trends.map(t => (<tr key={t.month} className="border-b border-[var(--color-border)] last:border-0"><td className="py-2.5 px-3 dash-text font-medium">{t.month}</td><td className="py-2.5 px-3 text-center dash-text">{t.submissions}</td><td className="py-2.5 px-3 text-center text-[var(--color-danger)]">{t.rejections}</td><td className="py-2.5 px-3 text-center"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${t.avgRisk > 40 ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]' : 'bg-[var(--color-success-soft)] text-[var(--color-success)]'}`}>{t.avgRisk}</span></td></tr>))}</tbody></table></div>
                </div>
            </>)}
        </div>
    );
}
