import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    fetchCompanyRoles,
    fetchRoleUserCounts,
    createCustomRole,
    updateCustomRole,
    deleteCustomRole,
    type CustomRole,
} from '../../lib/roleService';
import { ALL_PERMISSION_KEYS, type Permissions } from '../../lib/permissions';
import {
    Shield,
    Plus,
    Pencil,
    Trash2,
    X,
    Check,
    Users,
    Lock,
    Loader2,
    ShieldCheck,
    ChevronDown,
    ChevronRight,
} from 'lucide-react';

/* ──────────────────────── helpers ──────────────────────── */

const EMPTY_FORM: { name: string; description: string; permissions: Record<string, boolean> } = {
    name: '',
    description: '',
    permissions: Object.fromEntries(ALL_PERMISSION_KEYS.map((pk) => [pk.key, false])),
};

/** Group permission keys by their group label */
function groupedPermissions() {
    const groups: Record<string, typeof ALL_PERMISSION_KEYS> = {};
    for (const pk of ALL_PERMISSION_KEYS) {
        if (!groups[pk.group]) groups[pk.group] = [];
        groups[pk.group].push(pk);
    }
    return Object.entries(groups);
}

/* ──────────────────────── component ──────────────────────── */

export default function RoleManagementPage() {
    const { user, profile } = useAuth();
    const companyId = (profile as any)?.company_id as string | undefined;

    const [roles, setRoles] = useState<CustomRole[]>([]);
    const [userCounts, setUserCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Expanded detail
    const [expandedId, setExpandedId] = useState<string | null>(null);

    /* ── load ── */
    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const [r, c] = await Promise.all([
            fetchCompanyRoles(companyId),
            fetchRoleUserCounts(companyId),
        ]);
        setRoles(r);
        setUserCounts(c);
        setLoading(false);
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    /* ── open create form ── */
    const openCreate = () => {
        setEditingRole(null);
        setForm({ ...EMPTY_FORM, permissions: { ...EMPTY_FORM.permissions } });
        setError('');
        setShowForm(true);
    };

    /* ── open edit form ── */
    const openEdit = (role: CustomRole) => {
        setEditingRole(role);
        const perms: Record<string, boolean> = {};
        for (const pk of ALL_PERMISSION_KEYS) {
            perms[pk.key] = (role.permissions as any)[pk.key] ?? false;
        }
        setForm({ name: role.name, description: role.description, permissions: perms });
        setError('');
        setShowForm(true);
    };

    /* ── save ── */
    const handleSave = async () => {
        if (!companyId || !user) return;
        if (!form.name.trim()) { setError('Role name is required'); return; }

        setSaving(true);
        setError('');

        try {
            if (editingRole) {
                await updateCustomRole(editingRole.id, {
                    name: editingRole.is_system ? undefined : form.name,
                    description: form.description,
                    permissions: form.permissions as Partial<Permissions>,
                });
            } else {
                await createCustomRole({
                    companyId,
                    name: form.name,
                    description: form.description,
                    permissions: form.permissions as Partial<Permissions>,
                    createdBy: user.id,
                });
            }
            setShowForm(false);
            await load();
        } catch (err: any) {
            setError(err?.message || 'Failed to save role');
        } finally {
            setSaving(false);
        }
    };

    /* ── delete ── */
    const handleDelete = async (role: CustomRole) => {
        if (role.is_system) return;
        const count = userCounts[role.id] ?? 0;
        const msg = count > 0
            ? `This role has ${count} user(s) assigned. They will lose their custom role. Delete "${role.name}"?`
            : `Delete "${role.name}"?`;
        if (!confirm(msg)) return;

        try {
            await deleteCustomRole(role.id);
            await load();
        } catch (err: any) {
            alert(err?.message || 'Failed to delete role');
        }
    };

    /* ── toggle permission ── */
    const togglePerm = (key: string) => {
        setForm((prev) => ({
            ...prev,
            permissions: { ...prev.permissions, [key]: !prev.permissions[key] },
        }));
    };

    const permGroups = groupedPermissions();

    /* ──────────── render ──────────── */
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-2xl font-bold dash-text flex items-center gap-2">
                        <Shield className="w-6 h-6 text-[var(--color-behance-blue)]" />
                        Role Management
                    </h2>
                    <p className="text-sm dash-text-secondary mt-1">
                        Configure roles and permissions for your team — custom roles override system defaults
                    </p>
                </div>

                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--color-behance-blue)] text-white
            text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Create Custom Role
                </button>
            </div>

            {/* Loading */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--color-behance-blue)]" />
                </div>
            ) : (
                <div className="dash-card rounded-xl border dash-border shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b dash-border dash-surface-alt">
                        <p className="text-xs font-semibold dash-text-secondary uppercase tracking-wider">
                            {roles.length} Role{roles.length !== 1 ? 's' : ''} Configured
                        </p>
                    </div>

                    <div className="divide-y dash-divide">
                        {roles.map((role) => {
                            const isExpanded = expandedId === role.id;
                            const count = userCounts[role.id] ?? 0;
                            const enabledPerms = ALL_PERMISSION_KEYS.filter(
                                (pk) => (role.permissions as any)[pk.key]
                            );

                            return (
                                <div key={role.id} className="group">
                                    {/* Summary row */}
                                    <button
                                        onClick={() => setExpandedId(isExpanded ? null : role.id)}
                                        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:dash-surface-alt/70 transition-colors"
                                    >
                                        <div className="flex-shrink-0">
                                            {isExpanded ? (
                                                <ChevronDown className="w-4 h-4 dash-text-tertiary" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4 dash-text-tertiary" />
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            {role.is_system ? (
                                                <ShieldCheck className="w-4 h-4 text-[var(--color-behance-blue)] flex-shrink-0" />
                                            ) : (
                                                <Shield className="w-4 h-4 dash-text-tertiary flex-shrink-0" />
                                            )}
                                            <span className="font-semibold dash-text">{role.name}</span>
                                            {role.is_system && (
                                                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-info-soft)] text-[var(--color-info)] border border-[var(--color-info)]/20">
                                                    System
                                                </span>
                                            )}
                                        </div>

                                        {/* Permission badges */}
                                        <div className="hidden md:flex items-center gap-1.5 flex-wrap max-w-[400px]">
                                            {enabledPerms.slice(0, 4).map((pk) => (
                                                <span
                                                    key={pk.key}
                                                    className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-success-soft)] text-[var(--color-success)] border border-emerald-100"
                                                >
                                                    {pk.label}
                                                </span>
                                            ))}
                                            {enabledPerms.length > 4 && (
                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full dash-surface-alt dash-text-secondary">
                                                    +{enabledPerms.length - 4} more
                                                </span>
                                            )}
                                        </div>

                                        {/* User count */}
                                        <span className="flex items-center gap-1 text-xs dash-text-tertiary whitespace-nowrap">
                                            <Users className="w-3 h-3" />
                                            {count}
                                        </span>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => openEdit(role)}
                                                className="p-1.5 rounded-lg hover:dash-surface-alt transition-colors"
                                                title="Edit role"
                                            >
                                                <Pencil className="w-3.5 h-3.5 dash-text-tertiary" />
                                            </button>
                                            {!role.is_system && (
                                                <button
                                                    onClick={() => handleDelete(role)}
                                                    className="p-1.5 rounded-lg hover:bg-[var(--color-danger-soft)] transition-colors"
                                                    title="Delete role"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 text-[var(--color-danger)]" />
                                                </button>
                                            )}
                                        </div>
                                    </button>

                                    {/* Expanded detail */}
                                    {isExpanded && (
                                        <div className="px-5 pb-5 pl-14 space-y-3 dash-surface-alt/30">
                                            {role.description && (
                                                <p className="text-sm dash-text-secondary">{role.description}</p>
                                            )}
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                                {ALL_PERMISSION_KEYS.map((pk) => {
                                                    const enabled = (role.permissions as any)[pk.key];
                                                    return (
                                                        <div
                                                            key={pk.key}
                                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${enabled
                                                                    ? 'bg-[var(--color-success-soft)] border-[var(--color-success)]/20 text-[var(--color-success)]'
                                                                    : 'dash-surface-alt dash-border dash-text-tertiary'
                                                                }`}
                                                        >
                                                            {enabled ? (
                                                                <Check className="w-3 h-3" />
                                                            ) : (
                                                                <X className="w-3 h-3" />
                                                            )}
                                                            {pk.label}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Create / Edit Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
                    <div className="dash-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b dash-border dash-surface-alt">
                            <div>
                                <h3 className="font-bold dash-text flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-[var(--color-behance-blue)]" />
                                    {editingRole ? `Edit "${editingRole.name}"` : 'Create Custom Role'}
                                </h3>
                                {editingRole?.is_system && (
                                    <p className="text-xs text-behance-amber-600 mt-0.5 flex items-center gap-1">
                                        <Lock className="w-3 h-3" />
                                        System roles can have their permissions edited but cannot be renamed or deleted
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => setShowForm(false)}
                                className="p-1.5 hover:bg-[var(--color-surface-alt)] rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 dash-text-tertiary" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto max-h-[70vh] space-y-5">
                            {error && (
                                <div className="p-3 rounded-lg bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 text-sm text-[var(--color-danger)]">
                                    {error}
                                </div>
                            )}

                            {/* Name & Description */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium dash-text mb-1">Role Name</label>
                                    <input
                                        value={form.name}
                                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                        disabled={editingRole?.is_system}
                                        placeholder="e.g. Content Manager"
                                        className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] focus:ring-2 focus:ring-[var(--color-behance-blue)]/30 focus:border-[var(--color-behance-blue)] outline-none disabled:dash-surface-alt disabled:dash-text-secondary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium dash-text mb-1">Description</label>
                                    <input
                                        value={form.description}
                                        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                                        placeholder="Optional description"
                                        className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] focus:ring-2 focus:ring-[var(--color-behance-blue)]/30 focus:border-[var(--color-behance-blue)] outline-none"
                                    />
                                </div>
                            </div>

                            {/* Permission Toggles — grouped */}
                            <div className="space-y-4">
                                <p className="text-sm font-semibold dash-text">Permissions</p>

                                {permGroups.map(([group, keys]) => (
                                    <div key={group}>
                                        <p className="text-xs font-bold dash-text-secondary uppercase tracking-wider mb-2">{group}</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {keys.map((pk) => {
                                                const enabled = form.permissions[pk.key] ?? false;
                                                return (
                                                    <button
                                                        key={pk.key}
                                                        type="button"
                                                        onClick={() => togglePerm(pk.key)}
                                                        className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${enabled
                                                                ? 'bg-[var(--color-success-soft)] border-emerald-300 text-[var(--color-success)]'
                                                                : 'dash-card dash-border dash-text-secondary hover:dash-surface-alt'
                                                            }`}
                                                    >
                                                        <span>{pk.label}</span>
                                                        <div
                                                            className={`w-8 h-4.5 rounded-full transition-colors relative ${enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'
                                                                }`}
                                                        >
                                                            <div
                                                                className={`absolute top-0.5 w-3.5 h-3.5 dash-card rounded-full shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'
                                                                    }`}
                                                            />
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t dash-border dash-surface-alt flex items-center justify-end gap-3">
                            <button
                                onClick={() => setShowForm(false)}
                                className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-medium dash-text hover:dash-surface-alt transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-5 py-2 rounded-lg bg-[var(--color-behance-blue)] text-white text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-60 flex items-center gap-2"
                            >
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                {editingRole ? 'Save Changes' : 'Create Role'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

