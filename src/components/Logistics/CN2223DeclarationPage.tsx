import { useState, useEffect, useCallback } from 'react';
import { ScrollText, Plus, AlertTriangle, CheckCircle2, X, Loader2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import {
  CnDeclaration, DeclarationItem, DeclarationType, ReasonForExport,
  REASON_LABELS, CN22_VALUE_THRESHOLD_GBP,
  listDeclarations, createDeclaration, resolveDeclarationFlag,
} from '../../lib/customsDeclarationService';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const REASONS: ReasonForExport[] = [
  'gift', 'sale', 'commercial_sample', 'documents', 'returned_goods', 'other',
];

const BLANK_ITEM = (): DeclarationItem => ({
  description: '',
  quantity: 1,
  weight_kg: 0,
  value_gbp: 0,
});

// ── Log Declaration Modal ─────────────────────────────────────────────

interface LogModalProps {
  companyId: string;
  userId: string;
  onClose: () => void;
  onSaved: (d: CnDeclaration) => void;
}

function LogDeclarationModal({ companyId, userId, onClose, onSaved }: LogModalProps) {
  const [shipmentRef, setShipmentRef] = useState('');
  const [declarationType, setDeclarationType] = useState<DeclarationType>('CN22');
  const [senderName, setSenderName] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [reason, setReason] = useState<ReasonForExport>('gift');
  const [items, setItems] = useState<DeclarationItem[]>([BLANK_ITEM()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const totalValue  = items.reduce((s, i) => s + (i.value_gbp  || 0) * (i.quantity || 1), 0);
  const totalWeight = items.reduce((s, i) => s + (i.weight_kg  || 0) * (i.quantity || 1), 0);
  const contentsDescription = items.map(i => i.description).filter(Boolean).join(', ') || '';

  const cn22Warning = declarationType === 'CN22' && totalValue > CN22_VALUE_THRESHOLD_GBP;

  const updateItem = (idx: number, field: keyof DeclarationItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async () => {
    if (!shipmentRef.trim())     { setError('Shipment reference is required.'); return; }
    if (!senderName.trim())      { setError('Sender name is required.'); return; }
    if (!recipientName.trim())   { setError('Recipient name is required.'); return; }
    if (!contentsDescription)    { setError('At least one item description is required.'); return; }
    setSaving(true); setError('');
    try {
      const d = await createDeclaration(companyId, userId, {
        shipment_ref: shipmentRef.trim(),
        declaration_type: declarationType,
        sender_name: senderName.trim(),
        sender_address: senderAddress.trim() || undefined,
        recipient_name: recipientName.trim(),
        recipient_address: recipientAddress.trim() || undefined,
        reason_for_export: reason,
        items,
        total_value_gbp: parseFloat(totalValue.toFixed(2)),
        total_weight_kg: parseFloat(totalWeight.toFixed(3)),
        contents_description: contentsDescription,
      });
      onSaved(d);
    } catch (e: any) {
      setError(e.message || 'Failed to save declaration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-2xl dash-card border dash-border rounded-2xl p-6 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Log Customs Declaration</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-sm">{error}</div>
        )}

        {cn22Warning && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-300 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Total value £{totalValue.toFixed(2)} exceeds the CN22 threshold of £{CN22_VALUE_THRESHOLD_GBP}. Consider switching to CN23 or this declaration will be auto-flagged.</span>
          </div>
        )}

        <div className="space-y-5">
          {/* Form type + reference */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Declaration Type</label>
              <div className="flex rounded-lg border border-white/10 overflow-hidden">
                {(['CN22', 'CN23'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setDeclarationType(t)}
                    className={`flex-1 py-2 text-sm font-medium transition ${
                      declarationType === t
                        ? 'bg-[var(--color-success)]/20 text-[var(--color-success)]'
                        : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-xs text-white/30 mt-1">
                {declarationType === 'CN22' ? 'Low-value items (≤ £270)' : 'Higher-value items (> £270)'}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Shipment Reference *</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                placeholder="e.g. RX-2026-00142"
                value={shipmentRef}
                onChange={e => setShipmentRef(e.target.value)}
              />
            </div>
          </div>

          {/* Sender / Recipient */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-white/60">Sender</p>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                placeholder="Sender name *"
                value={senderName}
                onChange={e => setSenderName(e.target.value)}
              />
              <textarea
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30 resize-none"
                rows={2}
                placeholder="Sender address"
                value={senderAddress}
                onChange={e => setSenderAddress(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-white/60">Recipient</p>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                placeholder="Recipient name *"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
              />
              <textarea
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30 resize-none"
                rows={2}
                placeholder="Recipient address"
                value={recipientAddress}
                onChange={e => setRecipientAddress(e.target.value)}
              />
            </div>
          </div>

          {/* Reason for export */}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1">Reason for Export</label>
            <select
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
              value={reason}
              onChange={e => setReason(e.target.value as ReasonForExport)}
            >
              {REASONS.map(r => (
                <option key={r} value={r} className="bg-gray-900">{REASON_LABELS[r]}</option>
              ))}
            </select>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-white/60">Items *</label>
              <button
                onClick={() => setItems(prev => [...prev, BLANK_ITEM()])}
                className="flex items-center gap-1 text-xs text-[var(--color-success)] hover:opacity-80 transition"
              >
                <Plus className="w-3 h-3" /> Add Item
              </button>
            </div>
            <div className="space-y-2">
              {/* Column headers */}
              <div className="grid gap-2 text-xs text-white/40 font-medium" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr auto' }}>
                <span className="px-1">Description</span>
                <span className="px-1">Qty</span>
                <span className="px-1">Weight (kg)</span>
                <span className="px-1">Value (£)</span>
                <span />
              </div>
              {items.map((item, idx) => (
                <div key={idx} className="grid gap-2 items-center" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr auto' }}>
                  <input
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                    placeholder="Item description"
                    value={item.description}
                    onChange={e => updateItem(idx, 'description', e.target.value)}
                  />
                  <input
                    type="number" min="1"
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/30"
                    value={item.quantity}
                    onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                  />
                  <input
                    type="number" min="0" step="0.001"
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/30"
                    value={item.weight_kg}
                    onChange={e => updateItem(idx, 'weight_kg', parseFloat(e.target.value) || 0)}
                  />
                  <input
                    type="number" min="0" step="0.01"
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/30"
                    value={item.value_gbp}
                    onChange={e => updateItem(idx, 'value_gbp', parseFloat(e.target.value) || 0)}
                  />
                  <button
                    onClick={() => items.length > 1 && setItems(prev => prev.filter((_, i) => i !== idx))}
                    disabled={items.length === 1}
                    className="text-white/30 hover:text-red-400 disabled:opacity-20 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-3 flex gap-6 text-xs text-white/60">
              <span>Total weight: <strong className="text-white">{totalWeight.toFixed(3)} kg</strong></span>
              <span>Total value: <strong className={cn22Warning ? 'text-orange-300' : 'text-white'}>£{totalValue.toFixed(2)}</strong></span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-white/30 text-sm transition">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-success)]/20 border border-[var(--color-success)]/40 text-[var(--color-success)] hover:bg-[var(--color-success)]/30 text-sm font-medium transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Declaration'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

type Tab = 'all' | 'CN22' | 'CN23' | 'flagged';

export default function CN2223DeclarationPage() {
  const { profile, user } = useAuth();
  const companyId = (profile as any)?.company_id ?? '';
  const userId = user?.id ?? '';

  const [declarations, setDeclarations] = useState<CnDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [showLogModal, setShowLogModal] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError('');
    try { setDeclarations(await listDeclarations(companyId)); }
    catch (e: any) { setError(e.message || 'Failed to load declarations.'); }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleResolveFlag = async (d: CnDeclaration) => {
    setResolvingId(d.id);
    try {
      await resolveDeclarationFlag(companyId, userId, d.id);
      setDeclarations(prev => prev.map(x => x.id === d.id ? { ...x, is_flagged: false, flag_reason: null } : x));
    } catch {
      // silently leave — user can retry
    } finally {
      setResolvingId(null);
    }
  };

  const cn22Count   = declarations.filter(d => d.declaration_type === 'CN22').length;
  const cn23Count   = declarations.filter(d => d.declaration_type === 'CN23').length;
  const flagged     = declarations.filter(d => d.is_flagged).length;

  const visible = tab === 'all'    ? declarations
    : tab === 'flagged'            ? declarations.filter(d => d.is_flagged)
    : declarations.filter(d => d.declaration_type === tab);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <motion.div variants={fadeUp} initial="hidden" animate="visible"
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">CN22 / CN23 Declaration Logger</h1>
            <p className="text-xs text-white/50">Record and audit customs declarations for international postal items</p>
          </div>
        </div>
        <button
          onClick={() => setShowLogModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 hover:bg-blue-500/30 text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" /> Log Declaration
        </button>
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="visible"
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        {[
          { label: 'Total Declarations', value: declarations.length, cls: 'text-white' },
          { label: 'CN22 Forms',         value: cn22Count,           cls: 'text-blue-300' },
          { label: 'CN23 Forms',         value: cn23Count,           cls: 'text-purple-300' },
          { label: 'Flagged',            value: flagged,             cls: flagged > 0 ? 'text-orange-300' : 'text-white' },
        ].map(kpi => (
          <div key={kpi.label} className="dash-card border dash-border rounded-xl p-4">
            <p className="text-xs text-white/50 mb-1">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.cls}`}>{kpi.value}</p>
          </div>
        ))}
      </motion.div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-sm">{error}</div>
      )}

      <motion.div variants={fadeUp} initial="hidden" animate="visible"
        className="dash-card border dash-border rounded-2xl overflow-hidden"
      >
        <div className="flex items-center gap-1 border-b border-white/10 px-4 pt-4">
          {(['all', 'CN22', 'CN23', 'flagged'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition ${
                tab === t ? 'text-white border-b-2 border-blue-400' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {t === 'all' ? 'All' : t === 'flagged' ? `Flagged ${flagged > 0 ? `(${flagged})` : ''}` : t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-white/40" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16">
            <ScrollText className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/50">No declarations {tab !== 'all' ? `in this filter` : 'logged'} yet.</p>
            <p className="text-xs text-white/30 mt-1">Click "Log Declaration" to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['Reference', 'Type', 'Sender → Recipient', 'Contents', 'Value', 'Weight', 'Status', 'Date', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-white/40 text-xs font-medium uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(d => (
                  <tr key={d.id} className="border-b border-white/5 hover:bg-white/3 transition">
                    <td className="px-4 py-3 font-mono text-xs text-white/90">{d.shipment_ref}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        d.declaration_type === 'CN22'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      }`}>
                        {d.declaration_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/70 text-xs">
                      {d.sender_name} → {d.recipient_name}
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs max-w-[140px] truncate">
                      {d.contents_description}
                    </td>
                    <td className="px-4 py-3 text-white/70 text-xs">£{Number(d.total_value_gbp).toFixed(2)}</td>
                    <td className="px-4 py-3 text-white/60 text-xs">{Number(d.total_weight_kg).toFixed(3)} kg</td>
                    <td className="px-4 py-3">
                      {d.is_flagged ? (
                        <span className="inline-flex items-center gap-1 text-xs text-orange-300">
                          <AlertTriangle className="w-3.5 h-3.5" /> Flagged
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Clear
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">
                      {new Date(d.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      {d.is_flagged && (
                        <button
                          onClick={() => handleResolveFlag(d)}
                          disabled={resolvingId === d.id}
                          title={d.flag_reason ?? 'Flagged'}
                          className="text-xs text-orange-300 hover:text-orange-200 transition disabled:opacity-50"
                        >
                          {resolvingId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Resolve'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showLogModal && (
          <LogDeclarationModal
            companyId={companyId}
            userId={userId}
            onClose={() => setShowLogModal(false)}
            onSaved={d => {
              setDeclarations(prev => [d, ...prev]);
              setShowLogModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
