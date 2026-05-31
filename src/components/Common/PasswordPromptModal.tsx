import { useState } from 'react';
import { Lock, X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PasswordPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (password: string) => void;
    title?: string;
    description?: string;
    confirmLabel?: string;
    isLoading?: boolean;
}

export default function PasswordPromptModal({
    isOpen,
    onClose,
    onConfirm,
    title = 'Security Verification Required',
    description = 'Please enter your password to confirm this action. This action is irreversible.',
    confirmLabel = 'Confirm action',
    isLoading = false,
}: PasswordPromptModalProps) {
    const [password, setPassword] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (password.trim()) {
            onConfirm(password);
            setPassword(''); // clear after sending
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="w-full max-w-md bg-[var(--color-surface)] rounded-2xl shadow-xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-[var(--color-danger-soft)] rounded-lg text-[var(--color-danger)]">
                                    <Lock className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h3>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <form onSubmit={handleSubmit} className="p-6">
                            <div className="flex gap-3 p-4 mb-6 text-sm text-[var(--color-danger)] bg-[var(--color-danger-soft)] rounded-xl border border-[var(--color-danger)]/20">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <p>{description}</p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
                                        Account Password
                                    </label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Enter your password"
                                        className="w-full px-4 py-2.5 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] placeholder-[var(--color-text-tertiary)] border border-[var(--color-input-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-danger)]/20 focus:border-[var(--color-danger)] outline-none"
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-end gap-3 mt-8">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!password || isLoading}
                                    className="px-5 py-2.5 flex items-center gap-2 text-sm font-medium text-white bg-[var(--color-danger)] hover:opacity-90 rounded-xl transition-colors disabled:opacity-50"
                                >
                                    <Lock className="w-4 h-4" />
                                    {isLoading ? 'Verifying...' : confirmLabel}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
