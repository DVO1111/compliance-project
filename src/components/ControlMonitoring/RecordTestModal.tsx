import { useState } from 'react';
import { X, ClipboardCheck } from 'lucide-react';
import { recordTest } from '../../lib/controlMonitoringService';

interface Props {
  companyId: string;
  userId: string;
  controlId: string;
  controlCode: string;
  controlTitle: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function RecordTestModal({ companyId, userId, controlId, controlCode, controlTitle, onClose, onSaved }: Props) {
  const [status, setStatus] = useState<'pass' | 'fail' | 'partial' | 'not_applicable'>('pass');
  const [notes, setNotes] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const result = await recordTest(companyId, controlId, status, notes, nextDue || null, userId);
    setSaving(false);
    if (!result) { setError('Failed to save. Please try again.'); return; }
    onSaved();
    onClose();
  };

  const STATUS_OPTIONS = [
    { value: 'pass', label: 'Pass', desc: 'Control is operating effectively', color: 'text-green-700 bg-green-50 border-green-200' },
    { value: 'partial', label: 'Partial', desc: 'Control exists but has gaps', color: 'text-amber-700 bg-amber-50 border-amber-200' },
    { value: 'fail', label: 'Fail', desc: 'Control is not effective or missing', color: 'text-red-700 bg-red-50 border-red-200' },
    { value: 'not_applicable', label: 'N/A', desc: 'This control does not apply', color: 'text-gray-600 bg-gray-50 border-gray-200' },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-5 h-5 text-blue-600" />
            <div>
              <p className="font-semibold text-gray-900">Record Test Result</p>
              <p className="text-xs text-gray-500">{controlCode} — {controlTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assessment Result</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    status === opt.value ? opt.color + ' ring-2 ring-offset-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <p className="font-medium text-sm">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Evidence reviewed, gaps found, actions taken..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
          </div>

          {/* Next test due */}
          {status !== 'not_applicable' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Next Test Due <span className="text-gray-400">(optional — leave blank to use default interval)</span>
              </label>
              <input
                type="date"
                value={nextDue}
                onChange={e => setNextDue(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Result'}
          </button>
        </div>
      </div>
    </div>
  );
}
