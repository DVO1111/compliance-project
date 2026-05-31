import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    LifeBuoy, Send, CheckCircle, AlertCircle, Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Toast { type: 'success' | 'error'; message: string }

export default function SupportTab() {
    const { user, profile } = useAuth();
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [toast, setToast] = useState<Toast | null>(null);

    const showToast = (t: Toast) => {
        setToast(t);
        setTimeout(() => setToast(null), 3500);
    };

    const handleSubmit = async () => {
        if (!subject.trim() || !message.trim()) {
            showToast({ type: 'error', message: 'Subject and message are required.' });
            return;
        }
        if (!user) return;
        setSubmitting(true);

        try {
            const { error } = await supabase.from('support_tickets' as any).insert({
                user_id: user.id,
                company_id: profile?.company_id ?? null,
                subject: subject.trim(),
                message: message.trim(),
                severity,
            } as any);

            if (error) throw error;
            setSubmitted(true);
            showToast({ type: 'success', message: 'Support ticket submitted!' });
            setSubject('');
            setMessage('');
            setSeverity('normal');
        } catch {
            // Fallback: mailto link
            const mailtoUrl = `mailto:support@criateur.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
            window.open(mailtoUrl, '_blank');
            showToast({ type: 'success', message: 'Opened email client — support table may not be configured yet.' });
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

            {/* Report Issue Form */}
            <div className="dash-card rounded-xl border dash-border p-6">
                <div className="flex items-center gap-2 mb-4">
                    <LifeBuoy className="w-5 h-5 text-[var(--color-behance-blue)]" />
                    <h3 className="text-base font-semibold dash-text">Report an Issue</h3>
                </div>

                {submitted ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[var(--color-success-soft)] border border-[var(--color-success)]/20 rounded-lg p-6 text-center"
                    >
                        <CheckCircle className="w-10 h-10 text-[var(--color-success)] mx-auto mb-3" />
                        <p className="text-sm font-semibold text-[var(--color-success)]">Ticket Submitted Successfully!</p>
                        <p className="text-xs text-[var(--color-success)] mt-2">Our team will review your issue and get back to you.</p>
                        <button
                            onClick={() => setSubmitted(false)}
                            className="mt-4 px-4 py-2 text-sm font-medium text-[var(--color-success)] bg-[var(--color-success-soft)] rounded-lg hover:bg-[var(--color-success-soft)] transition-colors"
                        >
                            Submit Another Issue
                        </button>
                    </motion.div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium dash-text mb-1">Subject <span className="text-[var(--color-danger)]">*</span></label>
                            <input
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                placeholder="Brief description of the issue"
                                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)] focus:border-transparent outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium dash-text mb-1">Severity</label>
                            <div className="flex flex-wrap gap-2">
                                {([
                                    ['low', 'Low', 'dash-surface-alt dash-text border-[var(--color-border)]'],
                                    ['normal', 'Normal', 'bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]/20'],
                                    ['high', 'High', 'bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/20'],
                                    ['critical', 'Critical', 'bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/20'],
                                ] as const).map(([val, label, colors]) => (
                                    <button
                                        key={val}
                                        onClick={() => setSeverity(val)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${severity === val ? colors + ' ring-2 ring-offset-1 ring-[var(--color-behance-blue)]' : 'dash-card dash-text-secondary dash-border hover:dash-surface-alt'
                                            }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium dash-text mb-1">Message <span className="text-[var(--color-danger)]">*</span></label>
                            <textarea
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                rows={5}
                                placeholder="Describe the issue in detail…"
                                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)] focus:border-transparent outline-none resize-none"
                            />
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={submitting || !subject.trim() || !message.trim()}
                            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[var(--color-behance-blue)] rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
                        >
                            <Send className="w-4 h-4" />
                            {submitting ? 'Submitting…' : 'Submit Ticket'}
                        </button>
                    </div>
                )}
            </div>

            {/* App Info */}
            <div className="dash-card rounded-xl border dash-border p-6">
                <div className="flex items-center gap-2 mb-3">
                    <Info className="w-5 h-5 text-[var(--color-behance-blue)]" />
                    <h3 className="text-base font-semibold dash-text">Application Info</h3>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="dash-surface-alt rounded-lg p-3">
                        <p className="dash-text-secondary font-medium">Platform</p>
                        <p className="dash-text font-semibold mt-0.5">Criateur Healthcare Compliance</p>
                    </div>
                    <div className="dash-surface-alt rounded-lg p-3">
                        <p className="dash-text-secondary font-medium">Environment</p>
                        <p className="dash-text font-semibold mt-0.5">{import.meta.env.MODE}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

