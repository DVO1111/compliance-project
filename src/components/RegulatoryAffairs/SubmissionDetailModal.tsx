import { useState, useEffect } from 'react';
import { X, CheckCircle2, Circle, ChevronDown, ChevronRight, FileText, AlertCircle } from 'lucide-react';
import {
  RegulatorySubmission, StatusLogEntry, ChecklistItem,
  SubmissionStatus, STATUS_LABELS, STATUS_COLORS, STATUS_TIMELINE,
  PRODUCT_CATEGORY_LABELS,
  getChecklist, getStatusLog, updateSubmissionStatus, updateDocumentCheck,
  createLicenceFromApproval,
} from '../../lib/regulatoryAffairsService';

interface Props {
  submission: RegulatorySubmission;
  companyId: string;
  userId: string;
  onClose: () => void;
  onUpdated: () => void;
}

const NEXT_STATUSES: Partial<Record<SubmissionStatus, SubmissionStatus[]>> = {
  draft:                ['submitted', 'withdrawn'],
  submitted:            ['division_review', 'compliance_directive', 'rejected'],
  division_review:      ['inspection_scheduled', 'compliance_directive', 'rejected'],
  inspection_scheduled: ['inspection_completed'],
  inspection_completed: ['lab_testing', 'compliance_directive'],
  lab_testing:          ['fdrc_committee', 'compliance_directive'],
  fdrc_committee:       ['approved', 'rejected', 'compliance_directive'],
  compliance_directive: ['submitted', 'withdrawn'],
};

export default function SubmissionDetailModal({ submission, companyId, userId, onClose, onUpdated }: Props) {
  const [log, setLog] = useState<StatusLogEntry[]>([]);
  const [docsExpanded, setDocsExpanded] = useState(true);
  const [statusNote, setStatusNote] = useState('');
  const [newStatus, setNewStatus] = useState<SubmissionStatus | ''>('');
  const [napamsRef, setNapamsRef] = useState(submission.napams_reference ?? '');
  const [regNumber, setRegNumber] = useState(submission.registration_number ?? '');
  const [expiryDate, setExpiryDate] = useState(submission.expiry_date ?? '');
  const [saving, setSaving] = useState(false);
  const [creatingLicence, setCreatingLicence] = useState(false);
  const [licenceCreated, setLicenceCreated] = useState(false);
  const [validationError, setValidationError] = useState<string[] | null>(null);

  useEffect(() => {
    getStatusLog(submission.id).then(setLog);
  }, [submission.id]);

  const checklist: ChecklistItem[] = getChecklist(submission.product_category, submission.submission_type);
  const checkStatus = submission.document_checklist;
  const presentCount = checklist.filter(i => checkStatus[i.name]?.is_present).length;
  const requiredCount = checklist.filter(i => i.required).length;
  const requiredPresent = checklist.filter(i => i.required && checkStatus[i.name]?.is_present).length;

  const handleStatusUpdate = async () => {
    if (!newStatus) return;

    // Block draft → submitted if required documents are missing
    if (newStatus === 'submitted') {
      const missing = checklist.filter(i => i.required && !checkStatus[i.name]?.is_present).map(i => i.name);
      if (missing.length > 0) {
        setValidationError(missing);
        return;
      }
    }

    setValidationError(null);
    setSaving(true);
    await updateSubmissionStatus(submission.id, newStatus as SubmissionStatus, statusNote, userId, {
      napams_reference: napamsRef || undefined,
      registration_number: regNumber || undefined,
      expiry_date: expiryDate || undefined,
    });
    setSaving(false);
    onUpdated();
    onClose();
  };

  const handleDocToggle = async (itemName: string, currentValue: boolean) => {
    await updateDocumentCheck(submission.id, itemName, !currentValue, checkStatus[itemName]?.notes ?? '');
    onUpdated();
  };

  const handleAddToVault = async () => {
    setCreatingLicence(true);
    await createLicenceFromApproval(companyId, submission, userId);
    setCreatingLicence(false);
    setLicenceCreated(true);
    onUpdated();
  };

  const timelineIndex = STATUS_TIMELINE.indexOf(submission.current_status);
  const nextOptions = NEXT_STATUSES[submission.current_status] ?? [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b flex-shrink-0">
          <div>
            <p className="font-semibold text-gray-900 text-lg">{submission.product_name}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-gray-500">{PRODUCT_CATEGORY_LABELS[submission.product_category]}</span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-500">{submission.submission_type === 'local_manufacture' ? 'Local Manufacture' : submission.submission_type === 'importation' ? 'Importation' : 'Export'}</span>
              <span className="text-gray-300">·</span>
              <span className="text-xs font-medium uppercase">{submission.regulatory_body}</span>
              {submission.napams_reference && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs font-mono text-blue-600">{submission.napams_reference}</span>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Status Timeline */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">NAPAMS Status Timeline</p>
            <div className="flex items-center gap-0 overflow-x-auto pb-1">
              {STATUS_TIMELINE.map((s, i) => {
                const isActive = s === submission.current_status;
                const isPast = i < timelineIndex;
                const isTerminal = submission.current_status === 'rejected' || submission.current_status === 'withdrawn' || submission.current_status === 'compliance_directive';
                return (
                  <div key={s} className="flex items-center flex-shrink-0">
                    <div className={`flex flex-col items-center`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                        isActive ? 'bg-blue-600 border-blue-600 text-white' :
                        isPast ? 'bg-green-500 border-green-500 text-white' :
                        'bg-white border-gray-300 text-gray-400'
                      }`}>
                        {isPast ? '✓' : i + 1}
                      </div>
                      <span className={`text-xs mt-1 text-center leading-tight max-w-[60px] ${isActive ? 'text-blue-600 font-semibold' : isPast ? 'text-green-600' : 'text-gray-400'}`}>
                        {STATUS_LABELS[s].replace('Submitted to NAPAMS', 'Submitted').replace('FDRC Committee', 'FDRC')}
                      </span>
                    </div>
                    {i < STATUS_TIMELINE.length - 1 && (
                      <div className={`h-0.5 w-6 flex-shrink-0 mb-4 ${i < timelineIndex ? 'bg-green-500' : 'bg-gray-200'}`} />
                    )}
                  </div>
                );
              })}
            </div>
            {(submission.current_status === 'rejected' || submission.current_status === 'compliance_directive' || submission.current_status === 'withdrawn') && (
              <div className={`mt-2 px-3 py-2 rounded-lg text-sm font-medium ${STATUS_COLORS[submission.current_status]}`}>
                Status: {STATUS_LABELS[submission.current_status]}
              </div>
            )}
          </div>

          {/* Approved — save to Licence Vault */}
          {submission.current_status === 'approved' && submission.registration_number && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-green-800 text-sm">Application Approved ✓</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    Reg. No. {submission.registration_number}
                    {submission.expiry_date && ` · Expires ${new Date(submission.expiry_date).toLocaleDateString()}`}
                  </p>
                </div>
                {!licenceCreated ? (
                  <button onClick={handleAddToVault} disabled={creatingLicence}
                    className="flex-shrink-0 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                    {creatingLicence ? 'Saving…' : 'Save to Licence Vault →'}
                  </button>
                ) : (
                  <span className="text-xs text-green-600 font-medium">✓ Saved to Vault</span>
                )}
              </div>
            </div>
          )}

          {/* Document Checklist */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setDocsExpanded(e => !e)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Document Checklist</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${requiredPresent === requiredCount ? 'text-green-700 bg-green-100' : 'text-amber-700 bg-amber-100'}`}>
                  {requiredPresent}/{requiredCount} required · {presentCount}/{checklist.length} total
                </span>
              </div>
              {docsExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            </button>

            {docsExpanded && (
              <div className="divide-y divide-gray-100">
                {checklist.map(item => {
                  const status = checkStatus[item.name];
                  const isPresent = status?.is_present ?? false;
                  return (
                    <div key={item.name} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                      <button onClick={() => handleDocToggle(item.name, isPresent)} className="mt-0.5 flex-shrink-0">
                        {isPresent
                          ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                          : <Circle className="w-5 h-5 text-gray-300" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm ${isPresent ? 'text-gray-700' : 'text-gray-800'} ${isPresent ? 'line-through text-gray-400' : ''} font-medium`}>
                            {item.name}
                          </span>
                          {item.required && !isPresent && (
                            <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Required</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                        {status?.notes && <p className="text-xs text-blue-600 mt-0.5 italic">{status.notes}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Status history */}
          {log.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status History</p>
              <div className="space-y-2">
                {log.map(entry => (
                  <div key={entry.id} className="flex items-start gap-2 text-xs text-gray-500">
                    <span className="flex-shrink-0 mt-0.5 text-gray-300">○</span>
                    <div>
                      <span className="font-medium text-gray-700">{STATUS_LABELS[entry.to_status as SubmissionStatus] ?? entry.to_status}</span>
                      {entry.from_status && <span className="text-gray-400"> (from {STATUS_LABELS[entry.from_status as SubmissionStatus] ?? entry.from_status})</span>}
                      {entry.notes && <span className="text-gray-500"> — {entry.notes}</span>}
                      <span className="ml-1 text-gray-400">{new Date(entry.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Update status */}
          {nextOptions.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Update Status</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Move to</label>
                  <select value={newStatus} onChange={e => { setNewStatus(e.target.value as SubmissionStatus); setValidationError(null); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">— select —</option>
                    {nextOptions.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">NAPAMS Reference</label>
                  <input type="text" value={napamsRef} onChange={e => setNapamsRef(e.target.value)}
                    placeholder="FD-XXXXX-YYYY"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              {newStatus === 'approved' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Registration Number</label>
                    <input type="text" value={regNumber} onChange={e => setRegNumber(e.target.value)}
                      placeholder="NAFDAC Reg. No."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Expiry Date</label>
                    <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <input type="text" value={statusNote} onChange={e => setStatusNote(e.target.value)}
                  placeholder="e.g. Inspection visit confirmed for 20 June"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {validationError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-700">Cannot submit — required documents missing</p>
                      <ul className="mt-1 space-y-0.5">
                        {validationError.map(name => (
                          <li key={name} className="text-xs text-red-600">· {name}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-red-500 mt-1.5">Tick each document in the checklist above once it is in your possession before submitting to NAPAMS.</p>
                    </div>
                  </div>
                </div>
              )}
              <button onClick={handleStatusUpdate} disabled={!newStatus || saving}
                className="w-full py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {saving ? 'Updating…' : 'Update Status'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
