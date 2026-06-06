import { useState } from 'react';
import { X, Award } from 'lucide-react';
import { createLicence, LicenceType, LICENCE_TYPE_LABELS } from '../../lib/regulatoryAffairsService';

interface Props {
  companyId: string;
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewLicenceModal({ companyId, userId, onClose, onCreated }: Props) {
  const [licenceType, setLicenceType] = useState<LicenceType>('nafdac_product_registration');
  const [name, setName] = useState('');
  const [productName, setProductName] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [regulatoryBody, setRegulatoryBody] = useState('nafdac');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [renewalLeadDays, setRenewalLeadDays] = useState(90);
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    const result = await createLicence(companyId, {
      licence_type: licenceType,
      name: name.trim(),
      product_name: productName.trim() || null,
      registration_number: regNumber.trim() || null,
      regulatory_body: regulatoryBody,
      issue_date: issueDate || null,
      expiry_date: expiryDate || null,
      renewal_lead_days: renewalLeadDays,
      file_name: fileName.trim() || null,
      file_url: fileUrl.trim() || null,
      submission_id: null,
      notes: notes.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (!result) { setError('Failed to save. Please try again.'); return; }
    onCreated(); onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <Award className="w-5 h-5 text-green-600" />
            <p className="font-semibold text-gray-900">Add Licence / Certificate</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Licence Type</label>
            <select value={licenceType} onChange={e => setLicenceType(e.target.value as LicenceType)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              {Object.entries(LICENCE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name / Description <span className="text-red-500">*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. NAFDAC Product Registration — NASCO Cornflakes 500g"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
              <input type="text" value={productName} onChange={e => setProductName(e.target.value)}
                placeholder="e.g. Cornflakes 500g"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
              <input type="text" value={regNumber} onChange={e => setRegNumber(e.target.value)}
                placeholder="NAFDAC Reg. No. XX-XXXX"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date</label>
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Renewal Alert (days before expiry)</label>
              <input type="number" value={renewalLeadDays} onChange={e => setRenewalLeadDays(Number(e.target.value))}
                min={7} max={365}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Regulatory Body</label>
              <select value={regulatoryBody} onChange={e => setRegulatoryBody(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="nafdac">NAFDAC</option>
                <option value="son">SON</option>
                <option value="ministry_of_health">Ministry of Health</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Certificate File Link <span className="text-gray-400">(optional)</span></label>
            <input type="url" value={fileUrl} onChange={e => setFileUrl(e.target.value)}
              placeholder="https://drive.company.com/..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Licence'}
          </button>
        </div>
      </div>
    </div>
  );
}
