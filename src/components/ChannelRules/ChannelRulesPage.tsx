import { useState } from 'react';
import {
    CHANNEL_RULES, getComplianceMatrix,
    type ChannelConfig,
} from '../../lib/channelRulesEngine';
import {
    Layers, Shield, CheckCircle2, Info,
    ChevronRight, X, Hash, Smartphone, Tv, Radio, Mail,
    Globe, Megaphone, Building, Users, Pen,
} from 'lucide-react';

const RISK_COLORS: Record<string, string> = {
    low: 'bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20',
    medium: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/20',
    high: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/20',
};

const SEVERITY_ICONS: Record<string, typeof Shield> = {
    required: Shield,
    recommended: Info,
    optional: CheckCircle2,
};

const CHANNEL_ICONS: Record<string, typeof Globe> = {
    social_media_paid: Megaphone,
    social_media_organic: Hash,
    hcp_detailing: Users,
    dtc_tv: Tv,
    dtc_print: Pen,
    medical_congress: Building,
    patient_app: Smartphone,
    influencer: Users,
    email_marketing: Mail,
    website: Globe,
    radio: Radio,
};

export default function ChannelRulesPage() {
    const [selectedChannel, setSelectedChannel] = useState<ChannelConfig | null>(null);
    const matrix = getComplianceMatrix();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                        <Layers className="w-5 h-5 dash-accent" />
                    </div>
                    <h2 className="text-2xl font-bold dash-text">Channel-Specific Rules</h2>
                </div>
                <p className="dash-text-secondary text-sm ml-12">
                    Compliance requirements vary by marketing channel — view rules per channel
                </p>
            </div>

            {/* Channel Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {CHANNEL_RULES.map(ch => {
                    const Icon = CHANNEL_ICONS[ch.id] || Globe;
                    const required = ch.rules.filter(r => r.severity === 'required').length;
                    return (
                        <button key={ch.id} onClick={() => setSelectedChannel(ch)}
                            className="dash-card rounded-xl p-4 border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:shadow-md transition-all text-left group">
                            <div className="flex items-start justify-between mb-3">
                                <div className={`p-2 rounded-lg bg-[var(--color-surface-alt)] ${ch.iconColor}`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${RISK_COLORS[ch.riskLevel]}`}>
                                    {ch.riskLevel} risk
                                </span>
                            </div>
                            <h3 className="font-semibold dash-text text-sm mb-1">{ch.label}</h3>
                            <p className="text-xs dash-text-tertiary line-clamp-2 mb-3">{ch.description}</p>
                            <div className="flex items-center justify-between">
                                <span className="text-xs dash-text-secondary">{required} required rules</span>
                                <ChevronRight className="w-4 h-4 dash-text-tertiary group-hover:dash-accent transition-colors" />
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Compliance Matrix */}
            <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)]">
                <h3 className="font-semibold dash-text mb-4 flex items-center gap-2">
                    <Shield className="w-4 h-4 dash-accent" />
                    Cross-Channel Compliance Matrix
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[var(--color-border)]">
                                <th className="text-left py-2 px-3 font-medium dash-text-secondary">Channel</th>
                                <th className="text-center py-2 px-3 font-medium dash-text-secondary">Required</th>
                                <th className="text-center py-2 px-3 font-medium dash-text-secondary">Total Rules</th>
                                <th className="text-center py-2 px-3 font-medium dash-text-secondary">Risk Level</th>
                            </tr>
                        </thead>
                        <tbody>
                            {matrix.map(m => (
                                <tr key={m.channel} className="border-b border-[var(--color-border)] last:border-0">
                                    <td className="py-2.5 px-3 dash-text font-medium">{m.channel}</td>
                                    <td className="py-2.5 px-3 text-center dash-text">{m.required}</td>
                                    <td className="py-2.5 px-3 text-center dash-text-secondary">{m.total}</td>
                                    <td className="py-2.5 px-3 text-center">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_COLORS[m.risk]}`}>{m.risk}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Channel Detail Modal */}
            {selectedChannel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={() => setSelectedChannel(null)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl">
                            <div>
                                <h3 className="font-bold dash-text text-lg">{selectedChannel.label}</h3>
                                <p className="text-xs dash-text-secondary">{selectedChannel.description}</p>
                            </div>
                            <button onClick={() => setSelectedChannel(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]">
                                <X className="w-5 h-5 dash-text-secondary" />
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                            {selectedChannel.rules.map(rule => {
                                const SevIcon = SEVERITY_ICONS[rule.severity] || Info;
                                return (
                                    <div key={rule.id} className="p-4 rounded-xl bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
                                        <div className="flex items-center gap-2 mb-1">
                                            <SevIcon className={`w-4 h-4 ${rule.severity === 'required' ? 'text-[var(--color-danger)]' : rule.severity === 'recommended' ? 'text-[var(--color-warning)]' : 'text-[var(--color-info)]'}`} />
                                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${rule.severity === 'required' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' :
                                                rule.severity === 'recommended' ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]' :
                                                    'bg-[var(--color-info-soft)] text-[var(--color-info)]'}`}>
                                                {rule.severity}
                                            </span>
                                            <span className="text-xs dash-text-tertiary capitalize">{rule.category.replace(/_/g, ' ')}</span>
                                        </div>
                                        <h4 className="font-semibold dash-text text-sm">{rule.rule}</h4>
                                        <p className="text-xs dash-text-secondary mt-1">{rule.description}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
