import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    KeyRound, LogOut, ShieldCheck, Eye, EyeOff, CheckCircle, AlertCircle, Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Toast { type: 'success' | 'error'; message: string }

export default function SecurityTab() {
    const { signOut } = useAuth();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [changingPw, setChangingPw] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [toast, setToast] = useState<Toast | null>(null);

    const showToast = (t: Toast) => {
        setToast(t);
        setTimeout(() => setToast(null), 3500);
    };

    const handleChangePassword = async () => {
        if (newPassword.length < 8) {
            showToast({ type: 'error', message: 'Password must be at least 8 characters.' });
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast({ type: 'error', message: 'Passwords do not match.' });
            return;
        }
        setChangingPw(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            setNewPassword('');
            setConfirmPassword('');
            showToast({ type: 'success', message: 'Password changed successfully!' });
        } catch (err: any) {
            if (err.message?.includes('not supported') || err.message?.includes('SSO')) {
                showToast({ type: 'error', message: 'Password change not supported — account is managed by your organization.' });
            } else {
                showToast({ type: 'error', message: err.message || 'Failed to change password.' });
            }
        }
        setChangingPw(false);
    };

    const handleSignOut = async () => {
        setSigningOut(true);
        await signOut();
    };

    const handleSignOutEverywhere = async () => {
        setSigningOut(true);
        try {
            const { error } = await supabase.auth.signOut({ scope: 'global' });
            if (error) throw error;
            await signOut();
        } catch {
            showToast({ type: 'error', message: 'Failed to sign out everywhere.' });
            setSigningOut(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${toast.type === 'success' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-danger)]'
                            }`}
                    >
                        {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Change Password */}
            <div className="dash-card rounded-xl border dash-border p-6">
                <div className="flex items-center gap-2 mb-4">
                    <KeyRound className="w-5 h-5 text-[var(--color-behance-blue)]" />
                    <h3 className="text-base font-semibold dash-text">Change Password</h3>
                </div>
                <p className="text-sm dash-text-secondary mb-4">
                    Choose a strong password with at least 8 characters.
                </p>
                <div className="space-y-3 max-w-md">
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="New password"
                            className="w-full px-3 py-2 border border-[var(--color-input-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent outline-none bg-[var(--color-input-bg)] text-[var(--color-text-primary)] pr-10"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 dash-text-tertiary hover:dash-text-secondary"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)] focus:border-transparent outline-none"
                    />
                    <button
                        onClick={handleChangePassword}
                        disabled={changingPw || !newPassword}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
                    >
                        <Lock className="w-4 h-4" />
                        {changingPw ? 'Updating…' : 'Update Password'}
                    </button>
                </div>
            </div>

            {/* Sign Out */}
            <div className="dash-card rounded-xl border dash-border p-6">
                <div className="flex items-center gap-2 mb-4">
                    <LogOut className="w-5 h-5 text-[var(--color-behance-blue)]" />
                    <h3 className="text-base font-semibold dash-text">Session Management</h3>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={handleSignOut}
                        disabled={signingOut}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium dash-text dash-card border border-[var(--color-border)] rounded-lg hover:dash-surface-alt transition-colors disabled:opacity-50"
                    >
                        <LogOut className="w-4 h-4" />
                        {signingOut ? 'Signing out…' : 'Sign Out'}
                    </button>
                    <button
                        onClick={handleSignOutEverywhere}
                        disabled={signingOut}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-danger)] bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded-lg hover:opacity-80 transition-colors disabled:opacity-50"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign Out Everywhere
                    </button>
                </div>
            </div>

            {/* MFA Coming Soon */}
            <div className="dash-card rounded-xl border dash-border p-6">
                <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="w-5 h-5 text-[var(--color-behance-blue)]" />
                    <h3 className="text-base font-semibold dash-text">Multi-Factor Authentication</h3>
                </div>
                <div className="bg-[var(--color-info-soft)] border border-[var(--color-info)]/20 rounded-lg p-4">
                    <p className="text-sm text-[var(--color-info)] font-medium">Coming Soon</p>
                    <p className="text-xs text-[var(--color-info)] mt-1 opacity-80">
                        Multi-factor authentication will be available in a future update to add an extra layer of security to your account.
                    </p>
                </div>
            </div>
        </div>
    );
}

