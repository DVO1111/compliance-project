import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Blocks, Plus, X, Lock, Unlock, Copy, Loader2, Search, Pencil, Trash2, CheckCircle, Eye } from 'lucide-react';
import { createBlock, updateBlock, lockBlock, unlockBlock, deleteBlock, getBlocks, getUsage, type ContentBlock, type BlockType, type BlockUsageRecord } from '../../lib/contentBlockService';

const BLOCK_TYPES: { value: BlockType; label: string; color: string }[] = [
    { value: 'disclaimer', label: 'Disclaimer', color: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' },
    { value: 'statistic', label: 'Statistic', color: 'bg-[var(--color-info-soft)] text-[var(--color-info)]' },
    { value: 'risk_statement', label: 'Risk Statement', color: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]' },
    { value: 'boilerplate', label: 'Boilerplate', color: 'bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)]' },
    { value: 'fair_balance', label: 'Fair Balance', color: 'bg-[var(--color-purple)]/10 text-[var(--color-purple)]' },
    { value: 'call_to_action', label: 'Call to Action', color: 'bg-[var(--color-success-soft)] text-[var(--color-success)]' },
    { value: 'custom', label: 'Custom', color: 'bg-teal-100 text-teal-700' },
];

export default function ContentBlocksPage() {
    const { user, profile } = useAuth();
    const companyId = (profile as any)?.company_id as string | undefined;
    const [tab, setTab] = useState<'library' | 'usage'>('library');
    const [blocks, setBlocks] = useState<ContentBlock[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<BlockType | ''>('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editBlock, setEditBlock] = useState<ContentBlock | null>(null);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState<BlockType>('disclaimer');
    const [newText, setNewText] = useState('');
    const [newJurisdiction, setNewJurisdiction] = useState('all');
    const [adding, setAdding] = useState(false);
    const [selectedBlock, setSelectedBlock] = useState<ContentBlock | null>(null);
    const [usageRecords, setUsageRecords] = useState<BlockUsageRecord[]>([]);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        setBlocks(await getBlocks(companyId, { blockType: filterType || undefined, search: search || undefined }));
        setLoading(false);
    }, [companyId, filterType, search]);
    useEffect(() => { load(); }, [load]);

    const handleAdd = async () => {
        if (!companyId || !user || !newName.trim() || !newText.trim()) return;
        setAdding(true);
        await createBlock(companyId, { blockName: newName, blockType: newType, contentText: newText, jurisdiction: newJurisdiction }, user.id);
        setShowAddModal(false); setNewName(''); setNewText('');
        await load(); setAdding(false);
    };

    const handleEdit = async () => {
        if (!editBlock) return;
        await updateBlock(editBlock.id, { blockName: newName, contentText: newText });
        setEditBlock(null); await load();
    };

    const handleLock = async (b: ContentBlock) => { if (!user) return; await lockBlock(b.id, user.id); await load(); };
    const handleUnlock = async (b: ContentBlock) => { await unlockBlock(b.id); await load(); };
    const handleDelete = async (id: string) => { if (!confirm('Delete this block?')) return; await deleteBlock(id); await load(); };

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleViewUsage = async (b: ContentBlock) => {
        setSelectedBlock(b);
        setUsageRecords(await getUsage(b.id));
        setTab('usage');
    };

    const openEdit = (b: ContentBlock) => { setEditBlock(b); setNewName(b.block_name); setNewText(b.content_text); };
    const getTypeConfig = (t: string) => BLOCK_TYPES.find(bt => bt.value === t) || BLOCK_TYPES[6];

    if (!companyId) return <div className="text-center py-16"><Blocks className="w-10 h-10 text-[var(--color-text-tertiary)] mx-auto mb-3" /><p className="text-sm text-[var(--color-text-secondary)]">Company not set.</p></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]"><Blocks className="w-5 h-5 dash-accent" /></div>
                        <h2 className="text-2xl font-bold dash-text">Content Blocks</h2>
                    </div>
                    <p className="dash-text-secondary text-sm ml-12">Pre-approved, compliance-locked modular content</p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[['Total', blocks.length, 'dash-text'], ['Locked', blocks.filter(b => b.is_locked).length, 'text-[var(--color-success)]'], ['Unlocked', blocks.filter(b => !b.is_locked).length, 'text-[var(--color-warning)]'], ['Types', new Set(blocks.map(b => b.block_type)).size, 'text-[var(--color-info)]']].map(([l, v, cl]) => (
                    <div key={String(l)} className="dash-card rounded-xl p-4 border border-[var(--color-border)]"><p className="text-[11px] dash-text-tertiary">{l as string}</p><p className={`text-xl font-bold mt-1 ${cl}`}>{String(v)}</p></div>
                ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setTab('library')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'library' ? 'bg-[var(--color-accent)] text-white' : 'dash-card border border-[var(--color-border)] dash-text-secondary'}`}>Block Library</button>
                <button onClick={() => setTab('usage')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'usage' ? 'bg-[var(--color-accent)] text-white' : 'dash-card border border-[var(--color-border)] dash-text-secondary'}`}>Usage Tracker</button>
            </div>

            {tab === 'library' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-[200px] relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 dash-text-tertiary" />
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search blocks..." className="w-full pl-9 pr-3 py-2 border border-[var(--color-border)] rounded-lg text-sm dash-surface dash-text" />
                        </div>
                        <select value={filterType} onChange={(e) => setFilterType(e.target.value as BlockType | '')} className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text">
                            <option value="">All Types</option>
                            {BLOCK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <button onClick={() => { setShowAddModal(true); setNewName(''); setNewText(''); setNewType('disclaimer'); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-white hover:opacity-90"><Plus className="w-4 h-4" />New Block</button>
                    </div>

                    {loading ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin dash-accent" /></div> : blocks.length === 0 ? (
                        <div className="text-center py-14 dash-card rounded-2xl border border-[var(--color-border)]"><Blocks className="w-8 h-8 dash-text-tertiary mx-auto mb-2" /><p className="text-sm dash-text-secondary">No content blocks yet.</p></div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {blocks.map((b) => {
                                const tc = getTypeConfig(b.block_type);
                                return (
                                    <div key={b.id} className="dash-card rounded-2xl border border-[var(--color-border)] overflow-hidden hover:shadow-md transition-shadow">
                                        <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tc.color}`}>{tc.label}</span>
                                            <h4 className="font-semibold dash-text text-sm flex-1 truncate">{b.block_name}</h4>
                                            {b.is_locked ? <Lock className="w-3.5 h-3.5 text-[var(--color-success)]" /> : <Unlock className="w-3.5 h-3.5 text-[var(--color-warning)]" />}
                                            <span className="text-[10px] dash-text-tertiary">v{b.version}</span>
                                        </div>
                                        <div className="px-5 py-3"><p className="text-sm dash-text-secondary line-clamp-3">{b.content_text}</p></div>
                                        <div className="px-5 py-2.5 border-t border-[var(--color-border)] flex items-center gap-1.5 flex-wrap">
                                            <button onClick={() => handleCopy(b.content_text, b.id)} className="px-2 py-1 rounded text-[11px] font-medium dash-text-secondary hover:dash-text transition flex items-center gap-1">
                                                {copiedId === b.id ? <><CheckCircle className="w-3 h-3 text-[var(--color-success)]" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
                                            </button>
                                            <button onClick={() => handleViewUsage(b)} className="px-2 py-1 rounded text-[11px] font-medium dash-text-secondary hover:dash-text transition flex items-center gap-1"><Eye className="w-3 h-3" />Usage</button>
                                            {!b.is_locked && <button onClick={() => openEdit(b)} className="px-2 py-1 rounded text-[11px] font-medium dash-text-secondary hover:dash-text transition flex items-center gap-1"><Pencil className="w-3 h-3" />Edit</button>}
                                            {b.is_locked ? <button onClick={() => handleUnlock(b)} className="px-2 py-1 rounded text-[11px] font-medium text-[var(--color-warning)] hover:bg-[var(--color-warning-soft)] transition flex items-center gap-1"><Unlock className="w-3 h-3" />Unlock</button>
                                                : <button onClick={() => handleLock(b)} className="px-2 py-1 rounded text-[11px] font-medium text-[var(--color-success)] hover:bg-[var(--color-success-soft)] transition flex items-center gap-1"><Lock className="w-3 h-3" />Lock</button>}
                                            {!b.is_locked && <button onClick={() => handleDelete(b.id)} className="px-2 py-1 rounded text-[11px] font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition flex items-center gap-1"><Trash2 className="w-3 h-3" /></button>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {tab === 'usage' && (
                <div className="dash-card rounded-2xl border border-[var(--color-border)] p-6">
                    {selectedBlock ? <>
                        <h3 className="font-semibold dash-text mb-2">Usage for: {selectedBlock.block_name}</h3>
                        {usageRecords.length === 0 ? <p className="text-sm dash-text-secondary">This block has not been used in any content yet.</p> : (
                            <div className="space-y-2">
                                {usageRecords.map(u => <div key={u.id} className="flex items-center gap-3 p-3 bg-[var(--color-surface-alt)] rounded-lg text-sm"><span className="dash-text font-mono text-xs">{u.content_id.slice(0, 8)}...</span><span className="dash-text-tertiary text-xs">{new Date(u.used_at).toLocaleString()}</span></div>)}
                            </div>
                        )}
                    </> : <p className="text-sm dash-text-secondary">Select a block from the library to view its usage.</p>}
                </div>
            )}

            {(showAddModal || editBlock) && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="dash-card rounded-2xl max-w-lg w-full overflow-hidden">
                        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                            <h3 className="font-bold dash-text">{editBlock ? 'Edit Block' : 'New Content Block'}</h3>
                            <button onClick={() => { setShowAddModal(false); setEditBlock(null); }}><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-6 space-y-3">
                            <div><label className="text-xs font-semibold block mb-1">Block Name *</label><input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text" /></div>
                            {!editBlock && <div><label className="text-xs font-semibold block mb-1">Type</label><select value={newType} onChange={(e) => setNewType(e.target.value as BlockType)} className="w-full border rounded-lg px-3 py-2 text-sm">{BLOCK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>}
                            <div><label className="text-xs font-semibold block mb-1">Content Text *</label><textarea value={newText} onChange={(e) => setNewText(e.target.value)} rows={4} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" /></div>
                            {!editBlock && <div><label className="text-xs font-semibold block mb-1">Jurisdiction</label><select value={newJurisdiction} onChange={(e) => setNewJurisdiction(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="all">All</option><option value="nigeria">Nigeria</option><option value="usa">USA</option><option value="europe">Europe</option></select></div>}
                            <button onClick={editBlock ? handleEdit : handleAdd} disabled={adding || !newName.trim() || !newText.trim()} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] disabled:opacity-50">{editBlock ? 'Save Changes' : adding ? 'Creating...' : 'Create Block'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
