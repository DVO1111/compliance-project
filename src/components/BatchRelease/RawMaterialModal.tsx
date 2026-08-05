import { useState } from 'react';
import { X, PackageCheck } from 'lucide-react';
import { addRawMaterialReceipt, RawMaterialStatus } from '../../lib/pharma/batchReleaseService';

interface Props {
  companyId: string;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RawMaterialModal({ companyId, userId, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    material_name: '',
    material_code: '',
    lot_number: '',
    supplier_name: '',
    quantity: '',
    unit: 'kg',
    received_date: new Date().toISOString().slice(0, 10),
    test_status: 'pending' as RawMaterialStatus,
    test_result: '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const inputCls =
    'w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.material_name || !form.lot_number) { setError('Material name and lot number are required.'); return; }
    setLoading(true); setError(null);
    try {
      await addRawMaterialReceipt(companyId, userId, {
        material_name: form.material_name,
        material_code: form.material_code || null,
        lot_number: form.lot_number,
        supplier_name: form.supplier_name || null,
        quantity: form.quantity ? parseFloat(form.quantity) : null,
        unit: form.unit,
        received_date: form.received_date,
        test_status: form.test_status,
        test_result: form.test_result || null,
      });
      onSuccess();
    } catch (e: any) {
      setError(e.message || 'Failed to log receipt');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="dash-card border dash-border rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b dash-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
              <PackageCheck size={20} className="text-[var(--color-accent)]" />
            </div>
            <h2 className="text-lg font-bold dash-text">Log Raw Material Receipt</h2>
          </div>
          <button onClick={onClose} className="dash-text-tertiary hover:dash-text-primary transition-colors">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-[var(--color-danger-soft)] text-[var(--color-danger)] text-sm border border-[var(--color-danger-border)]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Material Name *</label>
              <input className={inputCls} value={form.material_name} onChange={e => set('material_name', e.target.value)} placeholder="e.g. Microcrystalline Cellulose" required />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Material Code</label>
              <input className={inputCls} value={form.material_code} onChange={e => set('material_code', e.target.value)} placeholder="e.g. MCC-101" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Lot Number *</label>
              <input className={inputCls} value={form.lot_number} onChange={e => set('lot_number', e.target.value)} placeholder="e.g. LOT-9931" required />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Supplier</label>
              <input className={inputCls} value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)} placeholder="e.g. Acme Excipients" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Quantity</label>
              <input type="number" min="0" step="0.01" className={inputCls} value={form.quantity} onChange={e => set('quantity', e.target.value)} placeholder="e.g. 250" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Unit</label>
              <select className={inputCls} value={form.unit} onChange={e => set('unit', e.target.value)}>
                {['kg', 'g', 'L', 'mL', 'units', 'drums'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Received Date</label>
              <input type="date" className={inputCls} value={form.received_date} onChange={e => set('received_date', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Test Status</label>
              <select className={inputCls} value={form.test_status} onChange={e => set('test_status', e.target.value)}>
                {(['pending', 'passed', 'failed', 'quarantined'] as RawMaterialStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Test Result / Notes</label>
            <input className={inputCls} value={form.test_result} onChange={e => set('test_result', e.target.value)} placeholder="e.g. Identity confirmed, within spec" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border dash-border dash-text font-semibold hover:dash-surface-alt transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-md" style={{ background: 'var(--color-accent)' }}>
              {loading ? 'Saving…' : 'Log Receipt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
