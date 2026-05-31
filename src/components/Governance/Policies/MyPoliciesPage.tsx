import { useState, useEffect } from 'react';
import {
    ShieldCheck,
    CheckCircle2,
    Clock,
    FileText,
    AlertCircle,
    ChevronRight,
    ExternalLink
} from 'lucide-react';
import { policyService } from '../../../lib/governance/policyService';
import { useAuth } from '../../../contexts/AuthContext';
import { format } from 'date-fns';
import { logger } from '../../../lib/logger';

export default function MyPoliciesPage() {
    const { user } = useAuth();
    const [required, setRequired] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPolicy, setSelectedPolicy] = useState<any | null>(null);
    const [agreed, setAgreed] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user]);

    async function fetchData() {
        setLoading(true);
        try {
            const [reqData, histData] = await Promise.all([
                policyService.listMyRequiredPolicies(user!.id),
                policyService.listMyAcknowledgementHistory(user!.id)
            ]);
            setRequired(reqData);
            setHistory(histData);
        } catch (err) {
            logger.error('Error fetching policies:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleAcknowledge() {
        if (!selectedPolicy || !agreed) return;
        setSubmitting(true);
        try {
            await policyService.acknowledgePolicy(
                selectedPolicy.id,
                selectedPolicy.policy_id,
                user!.id
            );
            setSelectedPolicy(null);
            setAgreed(false);
            fetchData();
        } catch (err) {
            logger.error('Error acknowledging policy:', err);
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <div className="p-8 flex justify-center items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            <header className="flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Policies</h1>
                    <p className="text-gray-500 mt-1">Review and acknowledge mandatory organization policies.</p>
                </div>
            </header>

            {/* Required Section */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <AlertCircle className="text-amber-500" size={20} />
                    Required Actions
                </h2>

                {required.length === 0 ? (
                    <div className="bg-green-50 rounded-xl p-8 border border-green-100 flex flex-col items-center text-center">
                        <ShieldCheck className="text-green-500 mb-3" size={40} />
                        <h3 className="text-lg font-medium text-green-900">You're all caught up!</h3>
                        <p className="text-green-600">No policies currently requiring your attention.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {required.map((pol) => {
                            const isOverdue = pol.dueDate && new Date(pol.dueDate) < new Date();
                            return (
                                <div
                                    key={pol.id}
                                    className={`bg-white rounded-xl shadow-sm border transition-all hover:shadow-md overflow-hidden flex flex-col ${isOverdue ? 'border-red-200' : 'border-gray-200'
                                        }`}
                                >
                                    <div className={`h-1.5 ${isOverdue ? 'bg-red-500' : 'bg-amber-500'}`} />
                                    <div className="p-5 flex-1 space-y-3">
                                        <div className="flex justify-between items-start">
                                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                                {pol.policies.category}
                                            </span>
                                            {isOverdue && (
                                                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                                                    Overdue
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 line-clamp-2">{pol.policies.title}</h3>
                                            <p className="text-sm text-gray-500 mt-1">Version {pol.version_label}</p>
                                        </div>

                                        <div className="pt-2 flex items-center gap-2 text-xs text-gray-500">
                                            <Clock size={14} />
                                            <span>Due: {pol.dueDate ? format(new Date(pol.dueDate), 'MMM d, yyyy') : 'N/A'}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedPolicy(pol)}
                                        className="w-full bg-gray-50 border-t border-gray-100 p-3 text-indigo-600 font-semibold text-sm hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
                                    >
                                        View & Acknowledge
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* History Section */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <HistoryIcon className="text-gray-400" size={20} />
                    Acknowledged History
                </h2>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Policy</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Signed Date</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {history.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                        No acknowledgement history found.
                                    </td>
                                </tr>
                            ) : (
                                history.map((ack) => (
                                    <tr key={ack.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900">{ack.policy_versions.policies.title}</div>
                                            <div className="text-xs text-gray-500">{ack.policy_versions.policies.category}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {ack.policy_versions.version_label}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {format(new Date(ack.acknowledged_at), 'MMM d, yyyy')}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-indigo-600 hover:text-indigo-900 text-sm font-medium flex items-center gap-1 ml-auto">
                                                <FileText size={14} />
                                                View PDF
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Acknowledge Modal */}
            {selectedPolicy && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">{selectedPolicy.policies.title}</h3>
                                <p className="text-sm text-gray-500">Version {selectedPolicy.version_label} • Published {format(new Date(selectedPolicy.published_at), 'MMM d, yyyy')}</p>
                            </div>
                            <button onClick={() => setSelectedPolicy(null)} className="text-gray-400 hover:text-gray-600">
                                <ChevronRight className="rotate-90" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-6">
                            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100 flex items-start gap-3">
                                <ShieldCheck className="text-indigo-600 mt-1" size={20} />
                                <div className="text-sm text-indigo-900">
                                    By acknowledging this policy, you confirm that you have read, understood, and agree to comply with the guidelines outlined in this document.
                                </div>
                            </div>

                            <div className="bg-gray-100 rounded-xl p-8 flex flex-col items-center justify-center border-2 border-dashed border-gray-300">
                                <FileText className="text-gray-400 mb-2" size={32} />
                                <p className="text-sm font-medium text-gray-900">Policy Document Content</p>
                                <a
                                    href={`/archive/${selectedPolicy.submission_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-4 bg-white px-4 py-2 rounded-lg border shadow-sm text-indigo-600 text-sm font-semibold flex items-center gap-2 hover:bg-gray-50"
                                >
                                    <ExternalLink size={14} />
                                    Read Full Policy
                                </a>
                            </div>

                            <div className="space-y-4 pt-4">
                                <label className="flex items-start gap-3 cursor-pointer group">
                                    <div className="pt-1">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                            checked={agreed}
                                            onChange={(e) => setAgreed(e.target.checked)}
                                        />
                                    </div>
                                    <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                                        I confirm that I have accessed and read the policy document linked above in its entirety.
                                        I understand the requirements and agree to adhere to these standards.
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="p-6 border-t bg-gray-50 rounded-b-2xl flex justify-end gap-3">
                            <button
                                onClick={() => setSelectedPolicy(null)}
                                className="px-4 py-2 text-gray-700 font-semibold hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={!agreed || submitting}
                                onClick={handleAcknowledge}
                                className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                            >
                                {submitting ? 'Signing...' : 'Acknowledge Policy'}
                                <CheckCircle2 size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function HistoryIcon({ size, className }: { size: number, className?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
        </svg>
    );
}
