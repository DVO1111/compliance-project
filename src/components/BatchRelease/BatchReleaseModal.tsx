import { useState } from 'react';
import { X, FlaskConical } from 'lucide-react';
import { createBatchRecord } from '../../lib/pharma/batchReleaseService';

interface Props {
  companyId: string;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BatchReleaseModal({ companyId, userId, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    batch_number: '',
    product_name: '',
    product_code: '',
    manufacturing_date: '',
    expiry_date: '',
    batch_size: '',
    unit: 'kg',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.batch_number || !form.product_name || !form.manufacturing_date || !form.expiry_date || !form.batch_size) {
      setError('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createBatchRecord(companyId, userId, {
        batch_number: form.batch_number,
        product_name: form.product_name,
        product_code: form.product_code || null,
        manufacturing_date: form.manufacturing_date,
        expiry_date: form.expiry_date,
        batch_size: parseFloat(form.batch_size),
        unit: form.unit,
        //  This modal does not yet offer a product picker, so batches
        //  created here are unlinked and the licence gate has nothing to
        //  check against — the same position as every batch that predates
        //  the product registry. Stated explicitly rather than left
        //  undefined so the omission is visible.
        product_id: null,
      });
      onSuccess();
    } catch (e: any) {
      setError(e.message || 'Failed to create batch record');
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
              <FlaskConical size={20} className="text-[var(--color-accent)]" />
            </div>
            <h2 className="text-lg font-bold dash-text">New Batch Record</h2>
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
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Batch Number *</label>
              <input
                value={form.batch_number}
                onChange={e => set('batch_number', e.target.value)}
                placeholder="e.g. BT-2024-001"
                required
                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Product Code</label>
              <input
                value={form.product_code}
                onChange={e => set('product_code', e.target.value)}
                placeholder="e.g. AMX-500"
                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Product Name *</label>
            <input
              value={form.product_name}
              onChange={e => set('product_name', e.target.value)}
              placeholder="e.g. Amoxicillin 500mg Capsules"
              required
              className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Manufacturing Date *</label>
              <input
                type="date"
                value={form.manufacturing_date}
                onChange={e => set('manufacturing_date', e.target.value)}
                required
                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Expiry Date *</label>
              <input
                type="date"
                value={form.expiry_date}
                onChange={e => set('expiry_date', e.target.value)}
                required
                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Batch Size *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.batch_size}
                onChange={e => set('batch_size', e.target.value)}
                required
                placeholder="e.g. 500"
                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Unit</label>
              <select
                value={form.unit}
                onChange={e => set('unit', e.target.value)}
                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                {['kg', 'g', 'L', 'mL', 'units', 'packs'].map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border dash-border dash-text font-semibold hover:dash-surface-alt transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-md"
              style={{ background: 'var(--color-accent)' }}
            >
              {loading ? 'Creating...' : 'Create Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
