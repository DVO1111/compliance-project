import { useState, useEffect, useCallback } from 'react';
import {
  PackageX, ShieldAlert, Plus, AlertTriangle, CheckCircle2,
  Clock, ChevronDown, X, UserX, Flag,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  ContrabandRejection, CustomerFlag,
  REJECTION_REASONS,
  listRejections, createRejection, updateRejectionStatus,
  listCustomerFlags, flagCustomer, clearCustomerFlag,
} from '../../lib/contrabandService';

/* ── Helpers ─────────────────────────────────────────────────── */

function fmt(dt: string) {
  return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_BADGE: Record<string, string> = {
  rejected:   'bg-red-500/20 text-red-300 border border-red-500/30',
  pending:    'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  escalated:  'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  active:     'bg-red-500/20 text-red-300 border border-red-500/30',
  cleared:    'bg-green-500/20 text-green-300 border border-green-500/30',
};

/* ── Log Rejection Modal ─────────────────────────────────────── */

interface LogRejectionModalProps {
  onClose: () => void;
  onSave: (payload: Parameters<typeof createRejection>[2]) => Promise<void>;
}

function LogRejectionModal({ onClose, onSave }: LogRejectionModalProps) {
  const [shipmentRef, setShipmentRef] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [itemsRaw, setItemsRaw] = useState('');
  const [description, setDescription] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [status, setStatus] = useState<'rejected' | 'pending' | 'escalated'>('rejected');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!shipmentRef.trim()) { setError('Shipment reference is required.'); return; }
    if (!rejectionReason) { setError('Please select a rejection reason.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        shipment_ref: shipmentRef.trim(),
        rejection_reason: rejectionReason,
        items_found: itemsRaw.split('\n').map(s => s.trim()).filter(Boolean),
        description: description.trim() || undefined,
        customer_name: customerName.trim() || undefined,
        customer_email: customerEmail.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        status,
      });
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-lg bg-[#0a1628] border border-white/15 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <PackageX className="w-5 h-5 text-red-400" />
            <h2 className="text-white font-semibold">Log Contraband Rejection</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/15 border border-red-500/30 rounded-lg text-red-300 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">Shipment Reference <span className="text-red-400">*</span></label>
            <input
              value={shipmentRef}
              onChange={e => setShipmentRef(e.target.value)}
              placeholder="e.g. RX-2026-00421"
              className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-success)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">Rejection Reason <span className="text-red-400">*</span></label>
            <select
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              className="w-full px-3 py-2 bg-[#0a1628] border border-white/15 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-success)]"
            >
              <option value="">Select reason…</option>
              {REJECTION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">Items Found</label>
            <textarea
              value={itemsRaw}
              onChange={e => setItemsRaw(e.target.value)}
              placeholder="One item per line, e.g.&#10;Suspected cannabis (approx 200g)&#10;Unlabelled pills"
              rows={3}
              className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-success)] resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">Additional Details</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional — describe circumstances, actions taken, etc."
              rows={2}
              className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-success)] resize-none"
            />
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Sender / Customer</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-white/60 mb-1">Name</label>
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Full name" className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-success)]" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Email</label>
                <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="email@example.com" className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-success)]" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Phone</label>
                <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+44..." className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-success)]" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">Status</label>
            <div className="flex gap-2">
              {(['rejected', 'pending', 'escalated'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                    status === s ? STATUS_BADGE[s] : 'bg-white/5 border border-white/10 text-white/40'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-white/10">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-white/15 rounded-lg text-white/70 text-sm hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-[var(--color-success)] text-white rounded-lg text-sm font-medium hover:bg-[var(--color-success)]/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Log Rejection'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Flag Customer Modal ─────────────────────────────────────── */

interface FlagCustomerModalProps {
  rejection: ContrabandRejection;
  onClose: () => void;
  onSave: (payload: Parameters<typeof flagCustomer>[2]) => Promise<void>;
}

function FlagCustomerModal({ rejection, onClose, onSave }: FlagCustomerModalProps) {
  const [identifierType, setIdentifierType] = useState<CustomerFlag['identifier_type']>('email');
  const [identifierValue, setIdentifierValue] = useState(rejection.customer_email ?? rejection.customer_phone ?? '');
  const [flagType, setFlagType] = useState<CustomerFlag['flag_type']>('contraband');
  const [flagReason, setFlagReason] = useState(`Contraband found in shipment ${rejection.shipment_ref}: ${rejection.rejection_reason}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!identifierValue.trim()) { setError('Identifier value is required.'); return; }
    if (!flagReason.trim()) { setError('Flag reason is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        customer_name: rejection.customer_name ?? 'Unknown',
        identifier_type: identifierType,
        identifier_value: identifierValue.trim(),
        flag_type: flagType,
        flag_reason: flagReason.trim(),
        related_rejection_id: rejection.id,
      });
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-[#0a1628] border border-white/15 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <UserX className="w-5 h-5 text-red-400" />
            <h2 className="text-white font-semibold">Flag Sender</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/15 border border-red-500/30 rounded-lg text-red-300 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/25 rounded-lg text-amber-300 text-xs">
            Flagging sender from shipment <strong>{rejection.shipment_ref}</strong>. Future intake involving this sender will surface a warning.
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">Identifier Type</label>
            <select value={identifierType} onChange={e => setIdentifierType(e.target.value as CustomerFlag['identifier_type'])} className="w-full px-3 py-2 bg-[#0a1628] border border-white/15 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-success)]">
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="name">Name</option>
              <option value="id_number">ID Number</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">Identifier Value <span className="text-red-400">*</span></label>
            <input value={identifierValue} onChange={e => setIdentifierValue(e.target.value)} placeholder="e.g. sender@email.com" className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-success)]" />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">Flag Type</label>
            <select value={flagType} onChange={e => setFlagType(e.target.value as CustomerFlag['flag_type'])} className="w-full px-3 py-2 bg-[#0a1628] border border-white/15 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-success)]">
              <option value="contraband">Contraband</option>
              <option value="fraud">Fraud / Misdeclaration</option>
              <option value="repeat_offender">Repeat Offender</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">Flag Reason <span className="text-red-400">*</span></label>
            <textarea value={flagReason} onChange={e => setFlagReason(e.target.value)} rows={3} className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-success)] resize-none" />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-white/10">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-white/15 rounded-lg text-white/70 text-sm hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors">
            {saving ? 'Flagging…' : 'Flag Sender'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────── */

type Tab = 'rejections' | 'flagged';

export default function ContrabandRejectionPage() {
  const { profile, user } = useAuth();
  const companyId = profile?.company_id ?? '';
  const userId = user?.id ?? '';

  const [tab, setTab] = useState<Tab>('rejections');
  const [rejections, setRejections] = useState<ContrabandRejection[]>([]);
  const [flags, setFlags] = useState<CustomerFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showLogModal, setShowLogModal] = useState(false);
  const [flagTarget, setFlagTarget] = useState<ContrabandRejection | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const [r, f] = await Promise.all([listRejections(companyId), listCustomerFlags(companyId)]);
      setRejections(r);
      setFlags(f);
    } catch (e: any) {
      setError(e.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleCreateRejection = async (payload: Parameters<typeof createRejection>[2]) => {
    const r = await createRejection(companyId, userId, payload);
    setRejections(prev => [r, ...prev]);
  };

  const handleFlagCustomer = async (payload: Parameters<typeof flagCustomer>[2]) => {
    const f = await flagCustomer(companyId, userId, payload);
    setFlags(prev => {
      const idx = prev.findIndex(x => x.id === f.id);
      return idx >= 0 ? prev.map((x, i) => i === idx ? f : x) : [f, ...prev];
    });
    if (flagTarget) {
      setRejections(prev => prev.map(r =>
        r.id === flagTarget.id ? { ...r, customer_flagged: true } : r
      ));
    }
  };

  const handleClearFlag = async (flagId: string) => {
    await clearCustomerFlag(companyId, userId, flagId);
    setFlags(prev => prev.map(f => f.id === flagId ? { ...f, status: 'cleared' } : f));
  };

  const activeFlags = flags.filter(f => f.status === 'active').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/25">
            <PackageX className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Contraband Rejection</h1>
            <p className="text-white/50 text-sm mt-0.5">Intake-to-rejection workflow with immutable audit trail</p>
          </div>
        </div>
        <button
          onClick={() => setShowLogModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-success)] text-white rounded-xl text-sm font-medium hover:bg-[var(--color-success)]/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Log Rejection
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Rejections', value: rejections.length, icon: PackageX, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
          { label: 'Escalated', value: rejections.filter(r => r.status === 'escalated').length, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
          { label: 'Flagged Senders', value: activeFlags, icon: ShieldAlert, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`p-4 rounded-xl border ${bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-white/50 text-xs">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        {(['rejections', 'flagged'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              tab === t ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {t === 'rejections' ? `Rejection Log (${rejections.length})` : `Flagged Senders (${activeFlags})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Rejection Log Tab */}
      {tab === 'rejections' && (
        <div className="bg-white/3 border border-white/10 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-white/40 text-sm">Loading…</div>
          ) : rejections.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <PackageX className="w-10 h-10 text-white/20 mx-auto" />
              <p className="text-white/40 text-sm">No rejection records yet.</p>
              <p className="text-white/25 text-xs">Click "Log Rejection" to create your first record.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['Shipment Ref', 'Date', 'Reason', 'Items', 'Customer', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-white/40 text-xs font-medium uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rejections.map(r => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3 text-white font-mono text-xs">{r.shipment_ref}</td>
                    <td className="px-4 py-3 text-white/60 whitespace-nowrap">{fmt(r.rejection_date)}</td>
                    <td className="px-4 py-3 text-white/80 max-w-[200px]">
                      <span className="truncate block">{r.rejection_reason}</span>
                    </td>
                    <td className="px-4 py-3 text-white/50 text-xs">
                      {r.items_found.length > 0
                        ? r.items_found.slice(0, 2).join(', ') + (r.items_found.length > 2 ? ` +${r.items_found.length - 2}` : '')
                        : <span className="text-white/25">—</span>}
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs">
                      {r.customer_name || <span className="text-white/25">—</span>}
                      {r.customer_flagged && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-red-400 text-xs">
                          <Flag className="w-3 h-3" />Flagged
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[r.status] ?? ''}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!r.customer_flagged && (r.customer_email || r.customer_phone || r.customer_name) && (
                        <button
                          onClick={() => setFlagTarget(r)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors whitespace-nowrap"
                        >
                          <UserX className="w-3 h-3" />
                          Flag Sender
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Flagged Senders Tab */}
      {tab === 'flagged' && (
        <div className="bg-white/3 border border-white/10 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-white/40 text-sm">Loading…</div>
          ) : flags.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <ShieldAlert className="w-10 h-10 text-white/20 mx-auto" />
              <p className="text-white/40 text-sm">No senders flagged yet.</p>
              <p className="text-white/25 text-xs">Flag a sender from the Rejection Log to track repeat offenders.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['Sender', 'Identifier', 'Flag Type', 'Reason', 'Date', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-white/40 text-xs font-medium uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flags.map(f => (
                  <tr key={f.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{f.customer_name}</td>
                    <td className="px-4 py-3 text-white/60 text-xs">
                      <span className="text-white/40 capitalize">{f.identifier_type}:</span>{' '}
                      {f.identifier_value}
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs capitalize">{f.flag_type.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-white/60 text-xs max-w-[200px]">
                      <span className="truncate block">{f.flag_reason}</span>
                    </td>
                    <td className="px-4 py-3 text-white/50 whitespace-nowrap text-xs">{fmt(f.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[f.status] ?? ''}`}>
                        {f.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {f.status === 'active' && (
                        <button
                          onClick={() => handleClearFlag(f.id)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/10 transition-colors whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Clear
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modals */}
      {showLogModal && (
        <LogRejectionModal
          onClose={() => setShowLogModal(false)}
          onSave={handleCreateRejection}
        />
      )}
      {flagTarget && (
        <FlagCustomerModal
          rejection={flagTarget}
          onClose={() => setFlagTarget(null)}
          onSave={handleFlagCustomer}
        />
      )}
    </div>
  );
}
