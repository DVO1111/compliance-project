import React, { useEffect, useState } from 'react';
import {
    Share2,
    Plus,
    Trash2,
    CheckCircle2,
    AlertCircle,
    ExternalLink,
    EyeOff,
    RefreshCcw,
    Settings,
    Activity,
    Copy,
    Bell
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    webhookService,
    WebhookEndpoint,
    WebhookDelivery
} from '../../lib/platform/webhookService';
import { WEBHOOK_EVENT_DEFINITIONS } from '../../lib/platform/webhookEvents';

/* ─── Helpers ────────────────────────────────────────────── */

function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
    window.dispatchEvent(new CustomEvent('global-toast', {
        detail: { message, type }
    }));
}

/* ─── Components ────────────────────────────────────────────── */

const WebhooksPage: React.FC = () => {
    const { profile } = useAuth();
    const companyId = profile?.company_id;
    const userId = profile?.id;

    const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
    const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // New Endpoint Form
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [createdSecret, setCreatedSecret] = useState<string | null>(null);

    const fetchData = async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const [epData, delData] = await Promise.all([
                webhookService.listEndpoints(companyId),
                (supabase.from('webhook_deliveries') as any)
                    .select('*')
                    .eq('company_id', companyId)
                    .order('created_at', { ascending: false })
                    .limit(50)
            ]);
            setEndpoints(epData);
            setDeliveries(delData.data || []);
        } catch (err) {
            showToast('Failed to load webhook data', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [companyId]);

    const handleCreate = async () => {
        if (!companyId || !userId || !newName || !newUrl) return;
        try {
            const { endpoint, rawSecret } = await webhookService.createEndpoint(companyId, newName, newUrl, userId);
            setEndpoints([endpoint, ...endpoints]);
            setCreatedSecret(rawSecret);
            showToast('Webhook endpoint created successfully');
            // Auto-subscribe to all events for convenience in MVP
            for (const def of WEBHOOK_EVENT_DEFINITIONS) {
                await webhookService.addSubscription(companyId, endpoint.id, def.name, userId);
            }
        } catch (err) {
            showToast('Failed to create endpoint', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this endpoint? All delivery history will be lost.')) return;
        try {
            const { error } = await (supabase.from('webhook_endpoints') as any).delete().eq('id', id);
            if (error) throw error;
            setEndpoints(endpoints.filter(e => e.id !== id));
            showToast('Endpoint deleted');
        } catch (err) {
            showToast('Failed to delete endpoint', 'error');
        }
    };

    const handleRetry = async (deliveryId: string) => {
        if (!companyId || !userId) return;
        try {
            await webhookService.retryDelivery(deliveryId, companyId, userId);
            showToast('Retry enqueued');
            fetchData();
        } catch (err) {
            showToast('Failed to enqueue retry', 'error');
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard');
    };

    return (
        <div className="p-8 max-w-[1400px] mx-auto flex flex-col gap-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold dash-text flex items-center gap-3">
                        <Share2 className="text-[var(--color-accent)]" size={32} />
                        Outbound Webhooks
                    </h1>
                    <p className="dash-text-tertiary mt-1">Receive real-time governance and compliance events in your external systems.</p>
                </div>
                <button
                    onClick={() => {
                        setShowCreateModal(true);
                        setCreatedSecret(null);
                        setNewName('');
                        setNewUrl('');
                    }}
                    className="premium-button flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--color-accent)] text-white font-bold hover:opacity-90 transition-all shadow-lg shadow-[var(--color-accent)]/20"
                >
                    <Plus size={20} />
                    Add Endpoint
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Endpoints List */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <h2 className="text-xl font-bold dash-text flex items-center gap-2">
                        <Settings size={20} className="text-[var(--color-accent)]" />
                        Registered Endpoints
                    </h2>

                    {endpoints.length === 0 && !loading ? (
                        <div className="dash-card border dash-border rounded-2xl p-12 text-center flex flex-col items-center gap-4 bg-[var(--color-surface-alt)]/30">
                            <div className="p-4 rounded-full bg-[var(--color-surface)] border dash-border">
                                <Share2 className="text-dash-text-tertiary opacity-30" size={48} />
                            </div>
                            <div className="max-w-xs">
                                <h3 className="font-bold dash-text">No endpoints configured</h3>
                                <p className="text-sm dash-text-tertiary mt-1">Start by adding a URL where you want to receive platform events.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {endpoints.map(ep => (
                                <div key={ep.id} className="dash-card border dash-border rounded-2xl p-6 bg-[var(--color-surface)] hover:border-[var(--color-accent)]/30 transition-all group">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-xl bg-[var(--color-surface-alt)]">
                                                <Share2 size={20} className="text-[var(--color-accent)]" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold dash-text">{ep.name}</h3>
                                                <p className="text-xs dash-text-tertiary flex items-center gap-1 mt-0.5">
                                                    <ExternalLink size={12} />
                                                    {ep.target_url}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleDelete(ep.id)}
                                                className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4">
                                        <div className="flex items-center gap-2 bg-[var(--color-surface-alt)] px-3 py-1.5 rounded-lg border dash-border">
                                            <span className="text-[10px] font-bold dash-text-tertiary uppercase tracking-wider">Secret Prefix:</span>
                                            <code className="text-xs font-mono text-[var(--color-accent)]">{ep.secret_prefix}...</code>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 uppercase tracking-tighter">
                                            <CheckCircle2 size={10} />
                                            Active
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Delivery History */}
                    <div className="mt-4">
                        <h2 className="text-xl font-bold dash-text flex items-center gap-2 mb-6">
                            <Activity size={20} className="text-[var(--color-accent)]" />
                            Delivery History
                        </h2>
                        <div className="dash-card border dash-border rounded-2xl overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-[var(--color-surface-alt)] border-b dash-border">
                                    <tr>
                                        <th className="px-6 py-4 text-[10px] font-bold dash-text-tertiary uppercase">Event</th>
                                        <th className="px-6 py-4 text-[10px] font-bold dash-text-tertiary uppercase">Status</th>
                                        <th className="px-6 py-4 text-[10px] font-bold dash-text-tertiary uppercase">Attempts</th>
                                        <th className="px-6 py-4 text-[10px] font-bold dash-text-tertiary uppercase">Time</th>
                                        <th className="px-6 py-4 text-[10px] font-bold dash-text-tertiary uppercase text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y dash-border">
                                    {deliveries.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-8 text-center dash-text-tertiary italic text-sm">
                                                No delivery events recorded yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        deliveries.map(del => (
                                            <tr key={del.id} className="hover:bg-[var(--color-surface-alt)]/40 transition-colors">
                                                <td className="px-6 py-4">
                                                    <span className="text-sm font-bold dash-text">{del.event_name}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${del.status === 'delivered' ? 'text-green-500 bg-green-500/10' :
                                                            del.status === 'pending' ? 'text-blue-500 bg-blue-500/10' :
                                                                'text-red-500 bg-red-500/10'
                                                        }`}>
                                                        {del.status === 'delivered' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                                                        {del.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-xs dash-text-tertiary">{del.attempt_count} / 5</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-xs dash-text-tertiary">{fmtDate(del.created_at)}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {(del.status === 'failed' || del.status === 'dead_letter') && (
                                                        <button
                                                            onClick={() => handleRetry(del.id)}
                                                            className="p-1.5 rounded-lg text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-all"
                                                            title="Retry Delivery"
                                                        >
                                                            <RefreshCcw size={14} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right: Event Catalogue */}
                <div className="flex flex-col gap-6">
                    <div className="dash-card border dash-border rounded-2xl p-6 bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-alt)]">
                        <h2 className="text-lg font-bold dash-text flex items-center gap-2 mb-4">
                            <Bell size={20} className="text-[var(--color-accent)]" />
                            Event Catalog
                        </h2>
                        <div className="space-y-4">
                            {WEBHOOK_EVENT_DEFINITIONS.map(def => (
                                <div key={def.name} className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <code className="text-[11px] font-bold text-[var(--color-accent)]">{def.name}</code>
                                    </div>
                                    <p className="text-[11px] dash-text-tertiary leading-relaxed mt-0.5">{def.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="dash-card border border-amber-500/20 bg-amber-500/5 rounded-2xl p-6">
                        <h3 className="text-sm font-bold text-amber-500 flex items-center gap-2 mb-2">
                            <AlertCircle size={16} />
                            Security Notice
                        </h3>
                        <p className="text-[11px] text-amber-500/80 leading-relaxed">
                            Every request is signed with the endpoint's secret using HMAC-SHA256.
                            Verify the signature in the <code className="bg-amber-500/10 px-1 rounded">X-Compliance-Signature</code> header
                            against a hash of <code className="bg-amber-500/10 px-1 rounded">timestamp.payload</code>.
                        </p>
                    </div>
                </div>
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0F19]/80 backdrop-blur-sm">
                    <div className="bg-[var(--color-surface)] border dash-border rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="p-8">
                            <h2 className="text-2xl font-bold dash-text mb-2">New Webhook Endpoint</h2>
                            <p className="dash-text-tertiary text-sm mb-6">Deliver governance events to your internal systems.</p>

                            {!createdSecret ? (
                                <div className="space-y-6">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-bold dash-text-tertiary uppercase tracking-wider">Friendly Name</label>
                                        <input
                                            type="text"
                                            value={newName}
                                            onChange={e => setNewName(e.target.value)}
                                            placeholder="e.g. Production SIEM / Zapier Automation"
                                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl py-3 px-4 text-sm dash-text focus:outline-none focus:ring-2 ring-[var(--color-accent)]/20"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-bold dash-text-tertiary uppercase tracking-wider">Payload URL</label>
                                        <input
                                            type="url"
                                            value={newUrl}
                                            onChange={e => setNewUrl(e.target.value)}
                                            placeholder="https://hooks.zapier.com/..."
                                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl py-3 px-4 text-sm dash-text focus:outline-none focus:ring-2 ring-[var(--color-accent)]/20"
                                        />
                                    </div>
                                    <div className="flex items-center gap-4 pt-4">
                                        <button
                                            onClick={() => setShowCreateModal(false)}
                                            className="flex-1 py-3 px-4 rounded-xl border dash-border dash-text hover:bg-[var(--color-surface-alt)] transition-all font-bold"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleCreate}
                                            className="flex-1 py-3 px-4 rounded-xl bg-[var(--color-accent)] text-white font-bold hover:opacity-90 transition-all shadow-lg shadow-[var(--color-accent)]/20"
                                        >
                                            Create Endpoint
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="p-6 rounded-2xl bg-green-500/10 border border-green-500/20 text-center">
                                        <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
                                        <h3 className="font-bold text-green-500">Endpoint Created Successfully</h3>
                                        <p className="text-xs text-green-500/80 mt-1">Make sure to save your signing secret now.</p>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-bold dash-text-tertiary uppercase tracking-wider">Signing Secret</label>
                                        <div className="relative group">
                                            <input
                                                type="text"
                                                readOnly
                                                value={createdSecret}
                                                className="w-full bg-[var(--color-surface-alt)] border border-[var(--color-accent)]/30 rounded-xl py-4 px-4 text-sm font-mono text-[var(--color-accent)]"
                                            />
                                            <button
                                                onClick={() => copyToClipboard(createdSecret)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-lg transition-all"
                                            >
                                                <Copy size={16} />
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-red-500 font-bold mt-2 flex items-center gap-1">
                                            <AlertCircle size={10} />
                                            We will never show this full secret again.
                                        </p>
                                    </div>

                                    <button
                                        onClick={() => setShowCreateModal(false)}
                                        className="w-full py-4 px-4 rounded-xl bg-[var(--color-surface-alt)] dash-text font-bold hover:bg-[var(--color-surface-high)] transition-all"
                                    >
                                        I've saved my secret
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WebhooksPage;
