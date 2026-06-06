import { useState } from 'react';
import { X, FileText } from 'lucide-react';
import {
  createSubmission, ProductCategory, SubmissionType, RegulatoryBody,
  PRODUCT_CATEGORY_LABELS,
} from '../../lib/regulatoryAffairsService';

interface Props {
  companyId: string;
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewSubmissionModal({ companyId, userId, onClose, onCreated }: Props) {
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState<ProductCategory>('food');
  const [submissionType, setSubmissionType] = useState<SubmissionType>('local_manufacture');
  const [regulatoryBody, setRegulatoryBody] = useState<RegulatoryBody>('nafdac');
  const [napamsRef, setNapamsRef] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!productName.trim()) { setError('Product name is required.'); return; }
    setSaving(true); setError('');
    const result = await createSubmission(companyId, {
      product_name: productName.trim(),
      product_category: category,
      submission_type: submissionType,
      regulatory_body: regulatoryBody,
      napams_reference: napamsRef.trim() || undefined,
      notes: notes.trim() || undefined,
      created_by: userId,
    });
    setSaving(false);
    if (!result) { setError('Failed to create. Please try again.'); return; }
    onCreated(); onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-600" />
            <p className="font-semibold text-gray-900">New Regulatory Application</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name <span className="text-red-500">*</span></label>
            <input type="text" value={productName} onChange={e => setProductName(e.target.value)}
              placeholder="e.g. NASCO Cornflakes 500g"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as ProductCategory)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                {Object.entries(PRODUCT_CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Submission Type</label>
              <select value={submissionType} onChange={e => setSubmissionType(e.target.value as SubmissionType)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="local_manufacture">Local Manufacture</option>
                <option value="importation">Importation</option>
                <option value="export">Export</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Regulatory Body</label>
              <select value={regulatoryBody} onChange={e => setRegulatoryBody(e.target.value as RegulatoryBody)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="nafdac">NAFDAC</option>
                <option value="son">SON</option>
                <option value="nafdac_son">NAFDAC + SON</option>
                <option value="ministry_of_health">Ministry of Health</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NAPAMS Reference <span className="text-gray-400">(if known)</span></label>
              <input type="text" value={napamsRef} onChange={e => setNapamsRef(e.target.value)}
                placeholder="e.g. FD-12345-2025"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Additional context..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Application'}
          </button>
        </div>
      </div>
    </div>
  );
}
