import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { getPermissions } from '../../../lib/permissions';
import {
    listIdentityProviders,
    registerIdentityProvider,
    updateIdentityProvider,
    disableIdentityProvider,
    listRoleMappings,
    mapSSORole,
    removeRoleMapping,
    listRecentIdentitySessions,
    type IdentityProvider,
    type IdentityRoleMapping,
    type IdentitySession,
} from '../../../lib/identity/identityService';
import {
    Fingerprint,
    Plus,
    Shield,
    ToggleLeft,
    ToggleRight,
    Trash2,
    Users,
    Activity,
    X,
    Check,
    Globe,
    Key,
} from 'lucide-react';
import { logger } from '../../../lib/logger';

/* ── Tab type ────────────────────────────────────────────────── */
type Tab = 'providers' | 'mappings' | 'activity';

const PROVIDER_TYPES = [
    { value: 'saml', label: 'SAML 2.0' },
    { value: 'oidc', label: 'OpenID Connect' },
    { value: 'google', label: 'Google Workspace' },
    { value: 'azure', label: 'Azure AD' },
    { value: 'okta', label: 'Okta' },
] as const;

const ROLE_OPTIONS = [
    { value: 'marketing', label: 'Marketing' },
    { value: 'compliance', label: 'Compliance' },
    { value: 'executive', label: 'Executive / Admin' },
    { value: 'agency', label: 'Agency' },
    { value: 'auditor', label: 'Auditor' },
];

/* ═══════════════════════════════════════════════════════════════ */

export default function IdentityProvidersPage() {
    const { user, profile } = useAuth();
    const perms = getPermissions({ profileRole: profile?.role, customPermissions: (profile as any)?.customPermissions });
    const companyId = (profile as any)?.company_id as string;
    const canManage = perms.canManageIdentity;

    const [activeTab, setActiveTab] = useState<Tab>('providers');
    const [providers, setProviders] = useState<IdentityProvider[]>([]);
    const [mappings, setMappings] = useState<IdentityRoleMapping[]>([]);
    const [sessions, setSessions] = useState<IdentitySession[]>([]);
    const [loading, setLoading] = useState(true);

    // Modals
    const [showAddProvider, setShowAddProvider] = useState(false);
    const [showAddMapping, setShowAddMapping] = useState(false);
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

    /* ── Data fetching ──────────────────────────────── */
    const refresh = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const p = await listIdentityProviders(companyId);
            setProviders(p);

            if (p.length > 0) {
                const firstId = selectedProviderId ?? p[0].id;
                setSelectedProviderId(firstId);
                const m = await listRoleMappings(firstId);
                setMappings(m);
            }

            const s = await listRecentIdentitySessions({ companyId, limit: 50 });
            setSessions(s);
        } catch (err) {
            logger.error('[IdentityPage] fetch error', err);
        } finally {
            setLoading(false);
        }
    }, [companyId, selectedProviderId]);

    useEffect(() => { refresh(); }, [refresh]);

    /* ── Provider toggle ───────────────────────────── */
    const handleToggle = async (prov: IdentityProvider) => {
        if (!canManage || !user) return;
        await updateIdentityProvider({
            providerId: prov.id,
            companyId,
            userId: user.id,
            updates: { enabled: !prov.enabled },
        });
        refresh();
    };

    /* ── Delete provider ───────────────────────────── */
    const handleDelete = async (prov: IdentityProvider) => {
        if (!canManage || !user) return;
        if (!window.confirm(`Disable provider "${prov.name}"?`)) return;
        await disableIdentityProvider({ providerId: prov.id, companyId, userId: user.id });
        refresh();
    };

    /* ── Tab content ───────────────────────────────── */
    const tabs: { id: Tab; label: string; icon: typeof Fingerprint }[] = [
        { id: 'providers', label: 'SSO Providers', icon: Shield },
        { id: 'mappings', label: 'Role Mappings', icon: Users },
        { id: 'activity', label: 'Login Activity', icon: Activity },
    ];

    /* ═══════════════════════════════════════════════════════════ */
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl shadow-md" style={{ background: 'var(--color-accent)' }}>
                        <Fingerprint size={22} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold dash-text">Identity &amp; SSO</h1>
                        <p className="text-sm dash-text-tertiary">Manage enterprise identity providers, domain mapping, and role synchronization</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b dash-border pb-0">
                {tabs.map(t => {
                    const Icon = t.icon;
                    const active = activeTab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${active
                                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                                    : 'border-transparent dash-text-secondary hover:text-[var(--color-text-primary)]'
                                }`}
                        >
                            <Icon size={16} />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--color-accent)' }} />
                </div>
            ) : (
                <>
                    {activeTab === 'providers' && (
                        <ProvidersTab
                            providers={providers}
                            canManage={canManage}
                            onToggle={handleToggle}
                            onDelete={handleDelete}
                            onAdd={() => setShowAddProvider(true)}
                        />
                    )}

                    {activeTab === 'mappings' && (
                        <MappingsTab
                            providers={providers}
                            mappings={mappings}
                            selectedProviderId={selectedProviderId}
                            canManage={canManage}
                            onSelectProvider={async (id) => {
                                setSelectedProviderId(id);
                                const m = await listRoleMappings(id);
                                setMappings(m);
                            }}
                            onAdd={() => setShowAddMapping(true)}
                            onRemove={async (id) => {
                                if (!user) return;
                                await removeRoleMapping({ mappingId: id, companyId, userId: user.id });
                                if (selectedProviderId) {
                                    const m = await listRoleMappings(selectedProviderId);
                                    setMappings(m);
                                }
                            }}
                        />
                    )}

                    {activeTab === 'activity' && (
                        <ActivityTab sessions={sessions} providers={providers} />
                    )}
                </>
            )}

            {/* Add Provider Modal */}
            {showAddProvider && (
                <AddProviderModal
                    companyId={companyId}
                    userId={user?.id ?? ''}
                    onClose={() => setShowAddProvider(false)}
                    onDone={() => { setShowAddProvider(false); refresh(); }}
                />
            )}

            {/* Add Mapping Modal */}
            {showAddMapping && selectedProviderId && (
                <AddMappingModal
                    providerId={selectedProviderId}
                    companyId={companyId}
                    userId={user?.id ?? ''}
                    onClose={() => setShowAddMapping(false)}
                    onDone={async () => {
                        setShowAddMapping(false);
                        if (selectedProviderId) {
                            const m = await listRoleMappings(selectedProviderId);
                            setMappings(m);
                        }
                    }}
                />
            )}
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   Sub-components
   ════════════════════════════════════════════════════════════════ */

function ProvidersTab({ providers, canManage, onToggle, onDelete, onAdd }: {
    providers: IdentityProvider[];
    canManage: boolean;
    onToggle: (p: IdentityProvider) => void;
    onDelete: (p: IdentityProvider) => void;
    onAdd: () => void;
}) {
    const typeColor: Record<string, string> = {
        saml: '#6366f1',
        oidc: '#8b5cf6',
        google: '#ea4335',
        azure: '#0078d4',
        okta: '#007dc1',
    };

    return (
        <div className="space-y-4">
            {canManage && (
                <button
                    onClick={onAdd}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all hover:brightness-110"
                    style={{ background: 'var(--color-accent)' }}
                >
                    <Plus size={16} /> Add Provider
                </button>
            )}

            {providers.length === 0 ? (
                <div className="dash-card border dash-border rounded-2xl p-12 text-center">
                    <Shield size={48} className="mx-auto mb-4 dash-text-tertiary" />
                    <h3 className="text-lg font-semibold dash-text mb-1">No Identity Providers Configured</h3>
                    <p className="text-sm dash-text-tertiary">Add an SSO provider to enable enterprise authentication.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {providers.map(p => (
                        <div key={p.id} className="dash-card border dash-border rounded-2xl p-5 space-y-4 transition-shadow hover:shadow-lg">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-sm"
                                        style={{ background: typeColor[p.provider_type] ?? 'var(--color-accent)' }}
                                    >
                                        {p.provider_type.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h4 className="font-semibold dash-text">{p.name}</h4>
                                        <span className="text-xs dash-text-tertiary uppercase tracking-wider font-medium">
                                            {PROVIDER_TYPES.find(t => t.value === p.provider_type)?.label ?? p.provider_type}
                                        </span>
                                    </div>
                                </div>
                                {canManage && (
                                    <button onClick={() => onToggle(p)} title={p.enabled ? 'Disable' : 'Enable'}>
                                        {p.enabled
                                            ? <ToggleRight size={28} className="text-emerald-500" />
                                            : <ToggleLeft size={28} className="dash-text-tertiary" />
                                        }
                                    </button>
                                )}
                            </div>

                            {p.domain && (
                                <div className="flex items-center gap-2 text-sm dash-text-secondary">
                                    <Globe size={14} className="dash-text-tertiary" />
                                    <span className="font-mono">{p.domain}</span>
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-2 border-t dash-border">
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${p.enabled ? 'bg-emerald-500/15 text-emerald-500' : 'bg-gray-500/15 text-gray-400'}`}>
                                    {p.enabled ? 'Active' : 'Disabled'}
                                </span>
                                {canManage && (
                                    <button onClick={() => onDelete(p)} className="text-[var(--color-danger)] hover:text-red-300 transition-colors" title="Delete">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ── Mappings Tab ───────────────────────────────── */

function MappingsTab({ providers, mappings, selectedProviderId, canManage, onSelectProvider, onAdd, onRemove }: {
    providers: IdentityProvider[];
    mappings: IdentityRoleMapping[];
    selectedProviderId: string | null;
    canManage: boolean;
    onSelectProvider: (id: string) => void;
    onAdd: () => void;
    onRemove: (id: string) => void;
}) {
    if (providers.length === 0) {
        return (
            <div className="dash-card border dash-border rounded-2xl p-12 text-center">
                <Users size={48} className="mx-auto mb-4 dash-text-tertiary" />
                <h3 className="text-lg font-semibold dash-text mb-1">No Providers Configured</h3>
                <p className="text-sm dash-text-tertiary">Add an identity provider first to configure role mappings.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
                <select
                    value={selectedProviderId ?? ''}
                    onChange={e => onSelectProvider(e.target.value)}
                    className="px-3 py-2 rounded-xl text-sm bg-[var(--color-surface)] border dash-border dash-text focus:outline-none"
                >
                    {providers.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>

                {canManage && (
                    <button
                        onClick={onAdd}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md hover:brightness-110 transition-all"
                        style={{ background: 'var(--color-accent)' }}
                    >
                        <Plus size={16} /> Add Mapping
                    </button>
                )}
            </div>

            <div className="dash-card border dash-border rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b dash-border bg-[var(--color-surface-alt)]">
                            <th className="text-left px-5 py-3 font-semibold dash-text-secondary text-xs uppercase tracking-wider">External Group</th>
                            <th className="text-left px-5 py-3 font-semibold dash-text-secondary text-xs uppercase tracking-wider">Platform Role</th>
                            <th className="text-right px-5 py-3 font-semibold dash-text-secondary text-xs uppercase tracking-wider">Created</th>
                            {canManage && <th className="w-12" />}
                        </tr>
                    </thead>
                    <tbody>
                        {mappings.length === 0 ? (
                            <tr>
                                <td colSpan={canManage ? 4 : 3} className="px-5 py-8 text-center dash-text-tertiary">
                                    No role mappings yet
                                </td>
                            </tr>
                        ) : mappings.map(m => (
                            <tr key={m.id} className="border-b dash-border last:border-0 hover:bg-[var(--color-surface-alt)] transition-colors">
                                <td className="px-5 py-3 font-mono dash-text">{m.external_group}</td>
                                <td className="px-5 py-3 dash-text">
                                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
                                        {m.role ?? 'Custom Role'}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-right dash-text-tertiary text-xs">
                                    {new Date(m.created_at).toLocaleDateString()}
                                </td>
                                {canManage && (
                                    <td className="px-3 py-3">
                                        <button onClick={() => onRemove(m.id)} className="text-[var(--color-danger)] hover:text-red-300 transition-colors">
                                            <Trash2 size={15} />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ── Activity Tab ──────────────────────────────── */

function ActivityTab({ sessions, providers }: {
    sessions: IdentitySession[];
    providers: IdentityProvider[];
}) {
    const providerMap = Object.fromEntries(providers.map(p => [p.id, p]));

    return (
        <div className="dash-card border dash-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b dash-border bg-[var(--color-surface-alt)]">
                        <th className="text-left px-5 py-3 font-semibold dash-text-secondary text-xs uppercase tracking-wider">Time</th>
                        <th className="text-left px-5 py-3 font-semibold dash-text-secondary text-xs uppercase tracking-wider">Method</th>
                        <th className="text-left px-5 py-3 font-semibold dash-text-secondary text-xs uppercase tracking-wider">Provider</th>
                        <th className="text-left px-5 py-3 font-semibold dash-text-secondary text-xs uppercase tracking-wider">IP Address</th>
                    </tr>
                </thead>
                <tbody>
                    {sessions.length === 0 ? (
                        <tr>
                            <td colSpan={4} className="px-5 py-12 text-center dash-text-tertiary">
                                <Activity size={32} className="mx-auto mb-3 opacity-40" />
                                No login activity recorded yet
                            </td>
                        </tr>
                    ) : sessions.map(s => (
                        <tr key={s.id} className="border-b dash-border last:border-0 hover:bg-[var(--color-surface-alt)] transition-colors">
                            <td className="px-5 py-3 dash-text-secondary text-xs">
                                {new Date(s.created_at).toLocaleString()}
                            </td>
                            <td className="px-5 py-3">
                                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-400">
                                    {s.login_method ?? 'N/A'}
                                </span>
                            </td>
                            <td className="px-5 py-3 dash-text">
                                {s.provider_id && providerMap[s.provider_id]
                                    ? providerMap[s.provider_id].name
                                    : '—'}
                            </td>
                            <td className="px-5 py-3 font-mono text-xs dash-text-tertiary">{s.ip_address ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   Modals
   ═══════════════════════════════════════════════════════════════ */

function AddProviderModal({ companyId, userId, onClose, onDone }: {
    companyId: string; userId: string; onClose: () => void; onDone: () => void;
}) {
    const [name, setName] = useState('');
    const [providerType, setProviderType] = useState<IdentityProvider['provider_type']>('saml');
    const [domain, setDomain] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            await registerIdentityProvider({
                companyId,
                userId,
                providerType,
                name: name.trim(),
                domain: domain.trim() || undefined,
            });
            onDone();
        } catch (err) {
            logger.error(err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 border dash-border" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl" style={{ background: 'var(--color-accent)' }}>
                            <Key size={18} className="text-white" />
                        </div>
                        <h2 className="text-lg font-bold dash-text">Add Identity Provider</h2>
                    </div>
                    <button onClick={onClose} className="dash-text-tertiary hover:dash-text transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">Provider Name</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Okta Production"
                            className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface-alt)] border dash-border text-sm dash-text focus:outline-none focus:ring-1"
                            style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">Provider Type</label>
                        <select
                            value={providerType}
                            onChange={e => setProviderType(e.target.value as IdentityProvider['provider_type'])}
                            className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface-alt)] border dash-border text-sm dash-text focus:outline-none"
                        >
                            {PROVIDER_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">Domain (for auto-provisioning)</label>
                        <input
                            value={domain}
                            onChange={e => setDomain(e.target.value)}
                            placeholder="e.g. acme.com"
                            className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface-alt)] border dash-border text-sm dash-text focus:outline-none focus:ring-1"
                            style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary hover:dash-surface-alt transition-colors border dash-border">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!name.trim() || saving}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white shadow-md hover:brightness-110 transition-all disabled:opacity-50"
                        style={{ background: 'var(--color-accent)' }}
                    >
                        {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Check size={16} />}
                        Save Provider
                    </button>
                </div>
            </div>
        </div>
    );
}

function AddMappingModal({ providerId, companyId, userId, onClose, onDone }: {
    providerId: string; companyId: string; userId: string; onClose: () => void; onDone: () => void;
}) {
    const [externalGroup, setExternalGroup] = useState('');
    const [role, setRole] = useState('compliance');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!externalGroup.trim()) return;
        setSaving(true);
        try {
            await mapSSORole({
                providerId,
                companyId,
                userId,
                externalGroup: externalGroup.trim(),
                role,
            });
            onDone();
        } catch (err) {
            logger.error(err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 border dash-border" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl" style={{ background: 'var(--color-accent)' }}>
                            <Users size={18} className="text-white" />
                        </div>
                        <h2 className="text-lg font-bold dash-text">Add Role Mapping</h2>
                    </div>
                    <button onClick={onClose} className="dash-text-tertiary hover:dash-text transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">SSO Group Name</label>
                        <input
                            value={externalGroup}
                            onChange={e => setExternalGroup(e.target.value)}
                            placeholder='e.g. "Compliance Team" from Okta / Azure AD'
                            className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface-alt)] border dash-border text-sm dash-text focus:outline-none focus:ring-1"
                            style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">Map to Platform Role</label>
                        <select
                            value={role}
                            onChange={e => setRole(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface-alt)] border dash-border text-sm dash-text focus:outline-none"
                        >
                            {ROLE_OPTIONS.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary hover:dash-surface-alt transition-colors border dash-border">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!externalGroup.trim() || saving}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white shadow-md hover:brightness-110 transition-all disabled:opacity-50"
                        style={{ background: 'var(--color-accent)' }}
                    >
                        {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Check size={16} />}
                        Save Mapping
                    </button>
                </div>
            </div>
        </div>
    );
}
