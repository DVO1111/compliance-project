// src/components/Enterprise/OrgManagementPanel.tsx
// Admin panel for managing the org hierarchy: BUs, brands, seats, user assignments
import { useState, useEffect, useCallback } from 'react';
import {
    Building2, Plus, Trash2, Edit3, Save, X, Users, Globe,
    ChevronDown, ChevronRight, Settings, MapPin,
} from 'lucide-react';
import {
    getOrgTree, createBusinessUnit, createBrand, updateBusinessUnit,
    deleteBusinessUnit, deleteBrand, assignUserToHierarchy,
    type OrgTreeNode,
} from '../../lib/hierarchyService';
import { getSeatAllocation, updateSeatAllocation, type SeatSummary } from '../../lib/seatManagementService';
import { supabase } from '../../lib/supabase';

interface OrgManagementPanelProps {
    organizationId: string;
    currentUserId: string;
}

interface UserRow { id: string; full_name: string | null; email: string; brand_id: string | null; business_unit_id: string | null; }

export default function OrgManagementPanel({ organizationId, currentUserId: _currentUserId }: OrgManagementPanelProps) {
    const [tree, setTree] = useState<OrgTreeNode | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedBU, setExpandedBU] = useState<Record<string, boolean>>({});
    const [seatData, setSeatData] = useState<Record<string, SeatSummary>>({});

    // Forms
    const [addingBU, setAddingBU] = useState(false);
    const [newBU, setNewBU] = useState({ name: '', slug: '', region: '' });
    const [addingBrand, setAddingBrand] = useState<string | null>(null);
    const [newBrand, setNewBrand] = useState({ name: '', slug: '', jurisdictions: '' });

    // Edit forms
    const [editingBU, setEditingBU] = useState<string | null>(null);
    const [editBUData, setEditBUData] = useState({ name: '', region: '' });
    const [editingSeats, setEditingSeats] = useState<string | null>(null);
    const [seatCount, setSeatCount] = useState(0);

    // User assignment
    const [assignTab, setAssignTab] = useState<string | null>(null);
    const [orgUsers, setOrgUsers] = useState<UserRow[]>([]);

    const reload = useCallback(async () => {
        setLoading(true);
        const t = await getOrgTree(organizationId);
        setTree(t);
        // Load seat data for each BU
        if (t) {
            const seats: Record<string, SeatSummary> = {};
            await Promise.all(
                t.businessUnits.map(async (bu) => {
                    seats[bu.id] = await getSeatAllocation(bu.id);
                })
            );
            setSeatData(seats);
        }
        setLoading(false);
    }, [organizationId]);

    useEffect(() => { reload(); }, [reload]);

    const loadUsers = useCallback(async () => {
        const { data } = await supabase
            .from('profiles')
            .select('id, full_name, email, brand_id, business_unit_id')
            .eq('organization_id', organizationId);
        setOrgUsers((data || []) as any as UserRow[]);
    }, [organizationId]);

    const handleAddBU = async () => {
        if (!newBU.name.trim()) return;
        await createBusinessUnit({
            organizationId,
            name: newBU.name.trim(),
            slug: newBU.slug.trim() || newBU.name.trim().toLowerCase().replace(/\s+/g, '-'),
            region: newBU.region.trim() || undefined,
        });
        setAddingBU(false);
        setNewBU({ name: '', slug: '', region: '' });
        reload();
    };

    const handleAddBrand = async (buId: string) => {
        if (!newBrand.name.trim()) return;
        await createBrand({
            businessUnitId: buId,
            organizationId,
            name: newBrand.name.trim(),
            slug: newBrand.slug.trim() || newBrand.name.trim().toLowerCase().replace(/\s+/g, '-'),
            jurisdictions: newBrand.jurisdictions.split(',').map(s => s.trim()).filter(Boolean),
        });
        setAddingBrand(null);
        setNewBrand({ name: '', slug: '', jurisdictions: '' });
        reload();
    };

    const handleUpdateBU = async (buId: string) => {
        await updateBusinessUnit(buId, { name: editBUData.name, region: editBUData.region || undefined });
        setEditingBU(null);
        reload();
    };

    const handleDeleteBU = async (buId: string) => {
        if (!confirm('Delete this business unit and all its brands? This cannot be undone.')) return;
        await deleteBusinessUnit(buId);
        reload();
    };

    const handleDeleteBrand = async (brandId: string) => {
        if (!confirm('Delete this brand? This cannot be undone.')) return;
        await deleteBrand(brandId);
        reload();
    };

    const handleSaveSeats = async (buId: string) => {
        await updateSeatAllocation(buId, seatCount);
        setEditingSeats(null);
        reload();
    };

    const handleAssignUser = async (userId: string, buId: string, brandId: string | null) => {
        await assignUserToHierarchy(userId, { organizationId, businessUnitId: buId, brandId: brandId || undefined });
        loadUsers();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!tree) return <p className="text-[var(--color-text-secondary)] text-center py-10">No organization found.</p>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                        <Settings className="w-5 h-5 text-[var(--color-purple)]" />
                        Organization Management
                    </h2>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{tree.organization.name}</p>
                </div>
                <button
                    onClick={() => setAddingBU(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-purple)] text-white text-sm font-medium
                     hover:bg-[var(--color-purple)] transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" /> Add Business Unit
                </button>
            </div>

            {/* Add BU form */}
            {addingBU && (
                <div className="bg-[var(--color-purple)]/10 border border-[var(--color-purple)]/20 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-semibold text-[var(--color-purple)]">New Business Unit</p>
                    <div className="grid grid-cols-3 gap-3">
                        <input
                            placeholder="Name *"
                            value={newBU.name}
                            onChange={(e) => setNewBU({ ...newBU, name: e.target.value })}
                            className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                        />
                        <input
                            placeholder="Slug (auto)"
                            value={newBU.slug}
                            onChange={(e) => setNewBU({ ...newBU, slug: e.target.value })}
                            className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                        />
                        <input
                            placeholder="Region (e.g. EMEA)"
                            value={newBU.region}
                            onChange={(e) => setNewBU({ ...newBU, region: e.target.value })}
                            className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleAddBU}
                            className="px-3 py-1.5 rounded-lg bg-[var(--color-purple)] text-white text-sm font-medium hover:bg-[var(--color-purple)]"
                        >
                            Create
                        </button>
                        <button onClick={() => setAddingBU(false)} className="px-3 py-1.5 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]">
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* BU List */}
            {tree.businessUnits.length === 0 && !addingBU && (
                <div className="text-center py-12 text-[var(--color-text-tertiary)]">
                    <Building2 className="w-10 h-10 mx-auto mb-2 text-[var(--color-text-tertiary)]" />
                    <p className="text-sm">No business units yet. Create your first one.</p>
                </div>
            )}

            {tree.businessUnits.map((bu) => {
                const isExpanded = expandedBU[bu.id] ?? true;
                const seats = seatData[bu.id] || { allocated: 0, used: 0, remaining: 0 };

                return (
                    <div key={bu.id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden">
                        {/* BU Header */}
                        <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white flex items-center gap-2">
                            <button onClick={() => setExpandedBU({ ...expandedBU, [bu.id]: !isExpanded })}>
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--color-text-tertiary)]" /> : <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)]" />}
                            </button>

                            {editingBU === bu.id ? (
                                <div className="flex items-center gap-2 flex-1">
                                    <input
                                        value={editBUData.name}
                                        onChange={(e) => setEditBUData({ ...editBUData, name: e.target.value })}
                                        className="px-2 py-1 rounded border border-[var(--color-border)] text-sm w-40"
                                    />
                                    <input
                                        value={editBUData.region}
                                        onChange={(e) => setEditBUData({ ...editBUData, region: e.target.value })}
                                        className="px-2 py-1 rounded border border-[var(--color-border)] text-sm w-24"
                                        placeholder="Region"
                                    />
                                    <button onClick={() => handleUpdateBU(bu.id)} className="p-1 text-[var(--color-success)] hover:bg-[var(--color-success-soft)] rounded">
                                        <Save className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setEditingBU(null)} className="p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-alt)] rounded">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <Building2 className="w-4 h-4 text-[var(--color-purple)]" />
                                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">{bu.name}</span>
                                    {bu.region && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-purple)]/10 text-[var(--color-purple)] font-medium flex items-center gap-0.5">
                                            <MapPin className="w-2.5 h-2.5" /> {bu.region}
                                        </span>
                                    )}
                                </>
                            )}

                            <div className="ml-auto flex items-center gap-1.5">
                                {/* Seat indicator */}
                                <span className="text-[10px] text-[var(--color-text-tertiary)] font-medium flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    {seats.allocated === 0 ? '∞' : `${seats.used}/${seats.allocated}`} seats
                                </span>

                                {editingSeats === bu.id ? (
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            value={seatCount}
                                            onChange={(e) => setSeatCount(parseInt(e.target.value) || 0)}
                                            className="w-16 px-2 py-0.5 rounded border border-[var(--color-border)] text-xs"
                                            min={0}
                                        />
                                        <button onClick={() => handleSaveSeats(bu.id)} className="p-0.5 text-[var(--color-success)]"><Save className="w-3 h-3" /></button>
                                        <button onClick={() => setEditingSeats(null)} className="p-0.5 text-[var(--color-text-tertiary)]"><X className="w-3 h-3" /></button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => { setEditingSeats(bu.id); setSeatCount(seats.allocated); }}
                                        className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-purple)] hover:bg-[var(--color-surface-alt)] rounded"
                                        title="Edit seat allocation"
                                    >
                                        <Users className="w-3.5 h-3.5" />
                                    </button>
                                )}

                                {editingBU !== bu.id && (
                                    <>
                                        <button
                                            onClick={() => { setEditingBU(bu.id); setEditBUData({ name: bu.name, region: bu.region || '' }); }}
                                            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-purple)] hover:bg-[var(--color-surface-alt)] rounded"
                                        >
                                            <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteBU(bu.id)}
                                            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] rounded"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Brands list */}
                        {isExpanded && (
                            <div className="divide-y divide-[var(--color-border)]">
                                {bu.brands.map((brand) => (
                                    <div key={brand.id} className="px-4 py-2.5 pl-10 flex items-center gap-2 hover:bg-[var(--color-surface-alt)] transition-colors">
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-[9px] text-white font-bold shrink-0">
                                            {brand.name.charAt(0)}
                                        </div>
                                        <span className="text-sm text-[var(--color-text-primary)] font-medium">{brand.name}</span>

                                        <div className="flex items-center gap-1 ml-2">
                                            {brand.jurisdictions.map((j) => (
                                                <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] font-medium flex items-center gap-0.5">
                                                    <Globe className="w-2.5 h-2.5" /> {j}
                                                </span>
                                            ))}
                                        </div>

                                        {!brand.is_active && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-surface-alt)] text-[var(--color-text-tertiary)]">Inactive</span>
                                        )}

                                        <div className="ml-auto flex items-center gap-1">
                                            <button
                                                onClick={() => {
                                                    setAssignTab(assignTab === brand.id ? null : brand.id);
                                                    if (assignTab !== brand.id) loadUsers();
                                                }}
                                                className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-purple)] hover:bg-[var(--color-surface-alt)] rounded"
                                                title="Assign users"
                                            >
                                                <Users className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteBrand(brand.id)}
                                                className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] rounded"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Inline user assignment */}
                                {bu.brands.some((b) => assignTab === b.id) && (
                                    <div className="px-4 py-3 pl-10 bg-[var(--color-purple)]/10/50">
                                        <p className="text-[11px] font-semibold text-[var(--color-purple)] mb-2">Assign users to {bu.brands.find(b => b.id === assignTab)?.name}</p>
                                        {orgUsers.length === 0 ? (
                                            <p className="text-xs text-[var(--color-text-tertiary)]">No users found in this organization.</p>
                                        ) : (
                                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                                {orgUsers.map((u) => (
                                                    <div key={u.id} className="flex items-center justify-between text-xs">
                                                        <span className="text-[var(--color-text-secondary)]">{u.full_name || u.email}</span>
                                                        <button
                                                            onClick={() => handleAssignUser(u.id, bu.id, assignTab)}
                                                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${u.brand_id === assignTab
                                                                ? 'bg-[var(--color-purple)]/10 text-[var(--color-purple)]'
                                                                : 'bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] hover:bg-[var(--color-purple)]/10 hover:text-[var(--color-purple)]'
                                                                }`}
                                                        >
                                                            {u.brand_id === assignTab ? 'Assigned ✓' : 'Assign'}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Add brand inline */}
                                {addingBrand === bu.id ? (
                                    <div className="px-4 py-3 pl-10 bg-[var(--color-purple)]/10/50 space-y-2">
                                        <div className="grid grid-cols-3 gap-2">
                                            <input
                                                placeholder="Brand name *"
                                                value={newBrand.name}
                                                onChange={(e) => setNewBrand({ ...newBrand, name: e.target.value })}
                                                className="px-2 py-1.5 rounded-lg border border-[var(--color-border)] text-sm focus:ring-2 focus:ring-purple-300 outline-none"
                                            />
                                            <input
                                                placeholder="Slug (auto)"
                                                value={newBrand.slug}
                                                onChange={(e) => setNewBrand({ ...newBrand, slug: e.target.value })}
                                                className="px-2 py-1.5 rounded-lg border border-[var(--color-border)] text-sm focus:ring-2 focus:ring-purple-300 outline-none"
                                            />
                                            <input
                                                placeholder="Jurisdictions (NG,GH,KE)"
                                                value={newBrand.jurisdictions}
                                                onChange={(e) => setNewBrand({ ...newBrand, jurisdictions: e.target.value })}
                                                className="px-2 py-1.5 rounded-lg border border-[var(--color-border)] text-sm focus:ring-2 focus:ring-purple-300 outline-none"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleAddBrand(bu.id)}
                                                className="px-3 py-1 rounded-lg bg-[var(--color-purple)] text-white text-sm font-medium hover:bg-[var(--color-purple)]"
                                            >
                                                Create Brand
                                            </button>
                                            <button onClick={() => setAddingBrand(null)} className="px-3 py-1 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]">Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setAddingBrand(bu.id)}
                                        className="w-full px-4 py-2.5 pl-10 text-sm text-[var(--color-purple)] hover:bg-[var(--color-purple)]/10 flex items-center gap-1.5 transition-colors"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Add brand
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
