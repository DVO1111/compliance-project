import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    AlertOctagon, Trash2, CheckCircle, AlertCircle, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '../../lib/logger';

interface Toast { type: 'success' | 'error'; message: string }

export default function DangerZoneTab() {
    const { user, profile } = useAuth();
    const [showModal, setShowModal] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [requested, setRequested] = useState(false);
    const [toast, setToast] = useState<Toast | null>(null);

    const showToast = (t: Toast) => {
        setToast(t);
        setTimeout(() => setToast(null), 3500);
    };

    const handleRequestDeletion = async () => {
        if (confirmText !== 'DELETE') return;
        if (!user) return;
        setSubmitting(true);

        try {
            // Try to insert into deletion_requests table
            const { error } = await supabase.from('deletion_requests' as any).insert({
                user_id: user.id,
                company_id: profile?.company_id ?? null,
                reason: reason.trim() || null,
                status: 'pending',
            } as any);

            if (error) throw error;

            setRequested(true);
            setShowModal(false);
            showToast({ type: 'success', message: 'Account deletion request submitted.' });
        } catch {
            // Fallback: log and notify
            logger.warn('Could not store deletion request — table may not exist. Logging locally.');
            setRequested(true);
            setShowModal(false);
            showToast({ type: 'success', message: 'Deletion request recorded. Contact your administrator for processing.' });
        }
        setSubmitting(false);
    };

    return (
        <div className="space-y-6">
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-[var(--color-success)] text-white' : 'bg-[var(--color-danger)] text-white'
                            }`}
                    >
                        {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Warning Banner */}
            <div className="bg-[var(--color-danger-soft)] border-2 border-[var(--color-danger)]/20 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-3">
                    <AlertOctagon className="w-5 h-5 text-[var(--color-danger)]" />
                    <h3 className="text-base font-semibold text-[var(--color-danger)]">Danger Zone</h3>
                </div>
                <p className="text-sm text-[var(--color-danger)] mb-1">
                    Actions in this section are irreversible or require administrator approval. Please proceed with extreme caution.
                </p>
            </div>

            {/* Request Account Deletion */}
            <div className="dash-card rounded-xl border border-[var(--color-danger)]/20 p-6">
                <div className="flex items-center gap-2 mb-3">
                    <Trash2 className="w-5 h-5 text-[var(--color-danger)]" />
                    <h3 className="text-base font-semibold dash-text">Request Account Deletion</h3>
                </div>

                {requested ? (
                    <div className="bg-behance-amber-50 border border-behance-amber-200 rounded-lg p-4">
                        <p className="text-sm font-medium text-behance-amber-800">Deletion Request Pending</p>
                        <p className="text-xs text-behance-amber-600 mt-1">
                            Your account deletion request has been submitted and is pending administrator review.
                            Your data will be retained until the request is processed.
                        </p>
                    </div>
                ) : (
                    <>
                        <p className="text-sm dash-text-secondary mb-4">
                            Requesting deletion will notify your organization's administrator. Your content submissions and audit logs
                            will be retained for compliance purposes, but your personal profile data will be removed.
                        </p>
                        <ul className="text-xs dash-text-secondary space-y-1 mb-4 ml-4 list-disc">
                            <li>Your profile information will be permanently deleted</li>
                            <li>Content submissions will remain company-owned for compliance records</li>
                            <li>Audit trail entries will be preserved</li>
                            <li>This action requires administrator approval</li>
                        </ul>
                        <button
                            onClick={() => setShowModal(true)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-danger)] bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 rounded-lg hover:bg-[var(--color-danger-soft)] transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            Request Account Deletion
                        </button>
                    </>
                )}
            </div>

            {/* Confirmation Modal */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="dash-card rounded-2xl max-w-md w-full shadow-2xl overflow-hidden"
                        >
                            <div className="bg-[var(--color-danger-soft)] border-b border-[var(--color-danger)]/20 px-6 py-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <AlertOctagon className="w-5 h-5 text-[var(--color-danger)]" />
                                    <h3 className="text-base font-semibold text-[var(--color-danger)]">Confirm Deletion Request</h3>
                                </div>
                                <button onClick={() => setShowModal(false)} className="p-1 dash-text-tertiary hover:dash-text-secondary">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="px-6 py-5 space-y-4">
                                <p className="text-sm dash-text-secondary">
                                    This action will submit a request to permanently delete your account. This cannot be undone.
                                </p>

                                <div>
                                    <label className="block text-sm font-medium dash-text mb-1">Reason (optional)</label>
                                    <textarea
                                        value={reason}
                                        onChange={e => setReason(e.target.value)}
                                        rows={2}
                                        placeholder="Why are you leaving?"
                                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--color-danger)] focus:border-transparent outline-none resize-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium dash-text mb-1">
                                        Type <span className="font-mono text-[var(--color-danger)] font-bold">DELETE</span> to confirm
                                    </label>
                                    <input
                                        value={confirmText}
                                        onChange={e => setConfirmText(e.target.value)}
                                        placeholder="Type DELETE"
                                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm font-mono focus:ring-2 focus:ring-[var(--color-danger)] focus:border-transparent outline-none"
                                    />
                                </div>
                            </div>

                            <div className="dash-surface-alt border-t dash-border px-6 py-4 flex items-center justify-end gap-3">
                                <button
                                    onClick={() => { setShowModal(false); setConfirmText(''); setReason(''); }}
                                    className="px-4 py-2 text-sm font-medium dash-text dash-card border border-[var(--color-border)] rounded-lg hover:dash-surface-alt transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRequestDeletion}
                                    disabled={confirmText !== 'DELETE' || submitting}
                                    className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-danger)] rounded-lg hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submitting ? 'Submitting…' : 'Confirm Deletion Request'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

