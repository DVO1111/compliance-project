import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Award, Tag, Plus, RefreshCw, ChevronRight,
  CheckCircle2, Clock, XCircle, AlertTriangle, Search, Trash2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  RegulatorySubmission, RegulatoryLicence, SubmissionStatus,
  STATUS_LABELS, STATUS_COLORS, PRODUCT_CATEGORY_LABELS, LICENCE_TYPE_LABELS,
  LabellingRequirement, ProductCategory,
  listSubmissions, listLicences, deleteSubmission, deleteLicenceRecord,
  getLicenceStatus, LICENCE_STATUS_COLORS,
  getLabellingRequirements,
} from '../../lib/regulatoryAffairsService';
import { getDossiers, type CTDDossier } from '../../lib/ctdDossierService';
import NewSubmissionModal from './NewSubmissionModal';
import SubmissionDetailModal from './SubmissionDetailModal';
import NewLicenceModal from './NewLicenceModal';

type Tab = 'applications' | 'licences' | 'labelling';

/* ── Labelling checker panel ────────────────────────────────── */
function LabellingCheckerPanel() {
  const [category, setCategory] = useState<ProductCategory>('food');
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  const requirements = getLabellingRequirements(category);

  const toggle = (field: string) => setChecks(c => ({ ...c, [field]: !c[field] }));

  const required = requirements.filter(r => r.required);
  const requiredPassed = required.filter(r => checks[r.field]).length;
  const total = requirements.length;
  const totalPassed = requirements.filter(r => checks[r.field]).length;
  const score = total > 0 ? Math.round((requiredPassed / required.length) * 100) : 0;

  const scoreColor = score === 100 ? 'text-green-600' : score >= 70 ? 'text-amber-600' : 'text-red-600';
  const scoreBg = score === 100 ? 'bg-green-50 border-green-200' : score >= 70 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">Labelling Compliance Checker</h2>
          <p className="text-sm text-gray-500 mt-0.5">Verify your product label meets NAFDAC mandatory requirements before submission.</p>
        </div>
        <select value={category} onChange={e => { setCategory(e.target.value as ProductCategory); setChecks({}); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="food">Food Product</option>
          <option value="drug_pharmaceutical">Drug / Pharmaceutical</option>
          <option value="cosmetic">Cosmetic</option>
        </select>
      </div>

      {/* Score card */}
      <div className={`rounded-xl border p-4 mb-5 flex items-center justify-between ${scoreBg}`}>
        <div>
          <p className="text-xs font-medium text-gray-500">Required Fields Compliant</p>
          <p className={`text-3xl font-bold ${scoreColor}`}>{score}%</p>
          <p className="text-xs text-gray-400 mt-0.5">{requiredPassed}/{required.length} required · {totalPassed}/{total} total</p>
        </div>
        {score === 100 && (
          <div className="text-right">
            <CheckCircle2 className="w-10 h-10 text-green-500 ml-auto" />
            <p className="text-xs text-green-600 font-medium mt-1">Label compliant</p>
          </div>
        )}
        {score < 100 && (
          <div className="text-right">
            <p className="text-xs text-red-600 font-medium">{required.length - requiredPassed} required field{required.length - requiredPassed !== 1 ? 's' : ''} missing</p>
            <p className="text-xs text-gray-400">Check all required fields to proceed</p>
          </div>
        )}
      </div>

      {/* Checklist */}
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {requirements.map(req => (
          <label key={req.field} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" checked={!!checks[req.field]} onChange={() => toggle(req.field)}
              className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${checks[req.field] ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {req.field}
                </span>
                {req.required && !checks[req.field] && (
                  <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded flex-shrink-0">Required</span>
                )}
                {!req.required && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">Optional</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{req.note}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────── */
export default function RegulatoryAffairsPage() {
  const { user, profile } = useAuth();
  const companyId = (profile as any)?.company_id ?? '';
  const userId = user?.id ?? '';

  const [tab, setTab] = useState<Tab>('applications');
  const [submissions, setSubmissions] = useState<RegulatorySubmission[]>([]);
  const [licences, setLicences] = useState<RegulatoryLicence[]>([]);
  const [dossiers, setDossiers] = useState<CTDDossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewSub, setShowNewSub] = useState(false);
  const [showNewLic, setShowNewLic] = useState(false);
  const [selectedSub, setSelectedSub] = useState<RegulatorySubmission | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [subs, lics, doss] = await Promise.all([
      listSubmissions(companyId),
      listLicences(companyId),
      getDossiers(companyId),
    ]);
    setSubmissions(subs);
    setLicences(lics);
    setDossiers(doss);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const filteredSubs = submissions.filter(s =>
    s.product_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.napams_reference ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredLics = licences.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.registration_number ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Summary stats
  const activeApps = submissions.filter(s => !['approved','rejected','withdrawn'].includes(s.current_status)).length;
  const approvedCount = submissions.filter(s => s.current_status === 'approved').length;
  const expiringLics = licences.filter(l => getLicenceStatus(l.expiry_date, l.renewal_lead_days) === 'expiring').length;
  const expiredLics = licences.filter(l => getLicenceStatus(l.expiry_date, l.renewal_lead_days) === 'expired').length;

  const handleDeleteSub = async (id: string) => {
    if (!window.confirm('Delete this application?')) return;
    setDeletingId(id);
    await deleteSubmission(id);
    setDeletingId(null);
    load();
  };

  const handleDeleteLic = async (id: string) => {
    if (!window.confirm('Delete this licence record?')) return;
    setDeletingId(id);
    await deleteLicenceRecord(id);
    setDeletingId(null);
    load();
  };

  const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: 'applications', label: 'Applications', icon: FileText },
    { id: 'licences',     label: 'Licences & Certificates', icon: Award },
    { id: 'labelling',    label: 'Labelling Checker', icon: Tag },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Regulatory Affairs</h1>
          <p className="text-sm text-gray-500 mt-0.5">NAPAMS application tracking, licences, and labelling compliance</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500">Active Applications</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{activeApps}</p>
          <p className="text-xs text-gray-400 mt-0.5">{approvedCount} approved total</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500">Total Submissions</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{submissions.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">across all products</p>
        </div>
        <div className={`rounded-xl border p-4 ${expiringLics > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
          <p className="text-xs font-medium text-gray-500">Licences Expiring</p>
          <p className={`text-2xl font-bold mt-1 ${expiringLics > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{expiringLics}</p>
          <p className="text-xs text-gray-400 mt-0.5">within renewal window</p>
        </div>
        <div className={`rounded-xl border p-4 ${expiredLics > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <p className="text-xs font-medium text-gray-500">Expired Licences</p>
          <p className={`text-2xl font-bold mt-1 ${expiredLics > 0 ? 'text-red-700' : 'text-gray-900'}`}>{expiredLics}</p>
          <p className="text-xs text-gray-400 mt-0.5">require immediate renewal</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                <Icon className="w-4 h-4" />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + action bar */}
      {tab !== 'labelling' && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'applications' ? 'Search products or reference…' : 'Search licences…'}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          {tab === 'applications' && (
            <button onClick={() => setShowNewSub(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              <Plus className="w-4 h-4" /> New Application
            </button>
          )}
          {tab === 'licences' && (
            <button onClick={() => setShowNewLic(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700">
              <Plus className="w-4 h-4" /> Add Licence
            </button>
          )}
        </div>
      )}

      {/* Tab content */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* Applications tab */}
          {tab === 'applications' && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {filteredSubs.length === 0 ? (
                <div className="py-16 text-center">
                  <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No applications yet</p>
                  <p className="text-sm text-gray-400 mt-1">Create your first NAPAMS application to start tracking.</p>
                  <button onClick={() => setShowNewSub(true)}
                    className="mt-4 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                    New Application
                  </button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">NAPAMS Ref</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Updated</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredSubs.map(sub => {
                      const checklist = Object.entries(sub.document_checklist);
                      const presentDocs = checklist.filter(([, v]) => v.is_present).length;
                      return (
                        <tr key={sub.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedSub(sub)}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{sub.product_name}</p>
                            <p className="text-xs text-gray-400">{sub.submission_type === 'local_manufacture' ? 'Local' : sub.submission_type === 'importation' ? 'Import' : 'Export'} · {sub.regulatory_body.toUpperCase()}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{PRODUCT_CATEGORY_LABELS[sub.product_category]}</td>
                          <td className="px-4 py-3">
                            {sub.napams_reference
                              ? <span className="font-mono text-blue-600 text-xs">{sub.napams_reference}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[sub.current_status]}`}>
                              {STATUS_LABELS[sub.current_status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">{new Date(sub.updated_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setSelectedSub(sub)} className="text-blue-600 hover:text-blue-700 p-1">
                                <ChevronRight className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteSub(sub.id)} disabled={deletingId === sub.id}
                                className="text-gray-300 hover:text-red-500 p-1">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Licences tab */}
          {tab === 'licences' && (
            <div className="space-y-3">
              {filteredLics.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
                  <Award className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No licences recorded yet</p>
                  <p className="text-sm text-gray-400 mt-1">Add your NAFDAC registration certificates, site licences, and SON approvals.</p>
                  <button onClick={() => setShowNewLic(true)}
                    className="mt-4 px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700">
                    Add Licence
                  </button>
                </div>
              ) : (
                filteredLics.map(lic => {
                  const status = getLicenceStatus(lic.expiry_date, lic.renewal_lead_days);
                  const statusColor = LICENCE_STATUS_COLORS[status];
                  const daysLeft = lic.expiry_date
                    ? Math.floor((new Date(lic.expiry_date).getTime() - Date.now()) / 86_400_000)
                    : null;
                  return (
                    <div key={lic.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{lic.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
                            {status === 'active' ? 'Active' : status === 'expiring' ? 'Expiring Soon' : status === 'expired' ? 'Expired' : 'No Expiry'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-gray-500">
                          <span>{LICENCE_TYPE_LABELS[lic.licence_type]}</span>
                          {lic.registration_number && <span className="font-mono text-blue-600">{lic.registration_number}</span>}
                          {lic.product_name && <span>{lic.product_name}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          {lic.issue_date && <span>Issued {new Date(lic.issue_date).toLocaleDateString()}</span>}
                          {lic.expiry_date && (
                            <span className={daysLeft !== null && daysLeft < 0 ? 'text-red-600 font-medium' : daysLeft !== null && daysLeft <= 90 ? 'text-amber-600 font-medium' : ''}>
                              Expires {new Date(lic.expiry_date).toLocaleDateString()}
                              {daysLeft !== null && (
                                <span className="ml-1">
                                  ({daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`})
                                </span>
                              )}
                            </span>
                          )}
                          {lic.file_url && (
                            <a href={lic.file_url} target="_blank" rel="noreferrer"
                              className="text-blue-500 hover:underline" onClick={e => e.stopPropagation()}>
                              View Certificate
                            </a>
                          )}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteLic(lic.id)} disabled={deletingId === lic.id}
                        className="text-gray-300 hover:text-red-500 flex-shrink-0 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Labelling checker tab */}
          {tab === 'labelling' && <LabellingCheckerPanel />}
        </>
      )}

      {/* Modals */}
      {showNewSub && (
        <NewSubmissionModal companyId={companyId} userId={userId}
          onClose={() => setShowNewSub(false)} onCreated={load}
          dossiers={dossiers} />
      )}
      {showNewLic && (
        <NewLicenceModal companyId={companyId} userId={userId}
          onClose={() => setShowNewLic(false)} onCreated={load} />
      )}
      {selectedSub && (
        <SubmissionDetailModal submission={selectedSub} companyId={companyId} userId={userId}
          onClose={() => setSelectedSub(null)}
          onUpdated={() => { setSelectedSub(null); load(); }}
          dossiers={dossiers} />
      )}
    </div>
  );
}
