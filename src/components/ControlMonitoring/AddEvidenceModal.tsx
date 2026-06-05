import { useState } from 'react';
import { X, FileText } from 'lucide-react';
import { addEvidence } from '../../lib/controlMonitoringService';

interface Props {
  companyId: string;
  userId: string;
  controlId: string;
  controlCode: string;
  controlTitle: string;
  onClose: () => void;
  onSaved: () => void;
}

const EVIDENCE_TYPES = [
  { value: 'document', label: 'Document' },
  { value: 'record', label: 'Record / Log' },
  { value: 'audit_report', label: 'Audit Report' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'policy', label: 'Policy' },
  { value: 'procedure', label: 'Procedure / SOP' },
  { value: 'test_result', label: 'Test / Lab Result' },
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'other', label: 'Other' },
];

export default function AddEvidenceModal({ companyId, userId, controlId, controlCode, controlTitle, onClose, onSaved }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceType, setEvidenceType] = useState('document');
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError('');
    const result = await addEvidence(companyId, controlId, {
      title: title.trim(),
      description: description.trim() || undefined,
      evidence_type: evidenceType,
      file_name: fileName.trim() || undefined,
      file_url: fileUrl.trim() || undefined,
      expires_at: expiresAt || undefined,
      uploaded_by: userId,
    });
    setSaving(false);
    if (!result) { setError('Failed to save. Please try again.'); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-semibold text-gray-900">Add Evidence</p>
              <p className="text-xs text-gray-500">{controlCode} — {controlTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. NAFDAC GMP Certificate 2025"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Evidence Type</label>
            <select
              value={evidenceType}
              onChange={e => setEvidenceType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {EVIDENCE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Reference number, document scope, what it demonstrates..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                File Name <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={fileName}
                onChange={e => setFileName(e.target.value)}
                placeholder="document.pdf"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expires <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              File URL / Link <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="url"
              value={fileUrl}
              onChange={e => setFileUrl(e.target.value)}
              placeholder="https://drive.company.com/..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add Evidence'}
          </button>
        </div>
      </div>
    </div>
  );
}
