import { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Monitor, Smartphone, LogOut, Globe, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Toast { type: 'success' | 'error'; message: string }

export default function SessionsTab() {
    const { session, signOut } = useAuth();
    const [signingOut, setSigningOut] = useState(false);
    const [toast, setToast] = useState<Toast | null>(null);

    const showToast = (t: Toast) => {
        setToast(t);
        setTimeout(() => setToast(null), 3500);
    };

    const deviceInfo = useMemo(() => {
        const ua = navigator.userAgent;
        let browser = 'Unknown Browser';
        let os = 'Unknown OS';
        let isMobile = false;

        if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Edg')) browser = 'Microsoft Edge';
        else if (ua.includes('Chrome')) browser = 'Google Chrome';
        else if (ua.includes('Safari')) browser = 'Safari';

        if (ua.includes('Windows')) os = 'Windows';
        else if (ua.includes('Mac OS')) os = 'macOS';
        else if (ua.includes('Linux')) os = 'Linux';
        else if (ua.includes('Android')) { os = 'Android'; isMobile = true; }
        else if (ua.includes('iPhone') || ua.includes('iPad')) { os = 'iOS'; isMobile = true; }

        return { browser, os, isMobile };
    }, []);

    const lastSignIn = session?.user?.last_sign_in_at
        ? new Date(session.user.last_sign_in_at).toLocaleString()
        : '—';

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

            {/* Current Session */}
            <div className="dash-card rounded-xl border dash-border p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Monitor className="w-5 h-5 text-[var(--color-behance-blue)]" />
                    <h3 className="text-base font-semibold dash-text">Current Session</h3>
                    <span className="ml-auto px-2 py-0.5 text-xs font-semibold bg-[var(--color-success-soft)] text-[var(--color-success)] rounded-full">Active</span>
                </div>

                <div className="dash-surface-alt rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-3">
                        {deviceInfo.isMobile ? (
                            <Smartphone className="w-8 h-8 text-[var(--color-behance-blue)]" />
                        ) : (
                            <Monitor className="w-8 h-8 text-[var(--color-behance-blue)]" />
                        )}
                        <div>
                            <p className="text-sm font-semibold dash-text">{deviceInfo.browser}</p>
                            <p className="text-xs dash-text-secondary">{deviceInfo.os}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 dash-text-tertiary" />
                            <div>
                                <p className="text-xs dash-text-secondary">IP Address</p>
                                <p className="text-sm dash-text">Session-based (hidden for privacy)</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 dash-text-tertiary" />
                            <div>
                                <p className="text-xs dash-text-secondary">Last Sign In</p>
                                <p className="text-sm dash-text">{lastSignIn}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sign Out Everywhere */}
            <div className="dash-card rounded-xl border dash-border p-6">
                <div className="flex items-center gap-2 mb-2">
                    <LogOut className="w-5 h-5 text-[var(--color-danger)]" />
                    <h3 className="text-base font-semibold dash-text">Sign Out All Devices</h3>
                </div>
                <p className="text-sm dash-text-secondary mb-4">
                    This will terminate all active sessions across all devices. You will need to sign in again.
                </p>
                <button
                    onClick={handleSignOutEverywhere}
                    disabled={signingOut}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-danger)] bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded-lg hover:bg-[var(--color-danger-soft)] transition-colors disabled:opacity-50"
                >
                    <LogOut className="w-4 h-4" />
                    {signingOut ? 'Signing out…' : 'Sign Out Everywhere'}
                </button>
            </div>
        </div>
    );
}

