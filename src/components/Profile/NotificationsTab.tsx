import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    Bell, Mail, Smartphone, Clock, Save, CheckCircle, AlertCircle, Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Toast { type: 'success' | 'error' | 'info'; message: string }

interface NotifSettings {
    email_enabled: boolean;
    inapp_enabled: boolean;
    digest_frequency: 'immediate' | 'daily' | 'weekly';
    toggles: {
        status_changes: boolean;
        comments_mentions: boolean;
        approvals_rejections: boolean;
        sla_alerts: boolean;
        expiry_reminders: boolean;
    };
}

const DEFAULT_SETTINGS: NotifSettings = {
    email_enabled: true,
    inapp_enabled: true,
    digest_frequency: 'immediate',
    toggles: {
        status_changes: true,
        comments_mentions: true,
        approvals_rejections: true,
        sla_alerts: true,
        expiry_reminders: false,
    },
};

export default function NotificationsTab() {
    const { user } = useAuth();
    const [settings, setSettings] = useState<NotifSettings>(DEFAULT_SETTINGS);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<Toast | null>(null);
    const [dbAvailable, setDbAvailable] = useState(true);
    const [loaded, setLoaded] = useState(false);

    const showToast = (t: Toast) => {
        setToast(t);
        setTimeout(() => setToast(null), 3500);
    };

    useEffect(() => {
        if (!user) return;
        (async () => {
            try {
                const { data, error } = await supabase
                    .from('profile_settings' as any)
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (error) throw error;
                if (data) {
                    setSettings({
                        email_enabled: (data as any).email_enabled ?? true,
                        inapp_enabled: (data as any).inapp_enabled ?? true,
                        digest_frequency: (data as any).digest_frequency ?? 'immediate',
                        toggles: { ...DEFAULT_SETTINGS.toggles, ...((data as any).toggles ?? {}) },
                    });
                }
                setDbAvailable(true);
            } catch {
                setDbAvailable(false);
            }
            setLoaded(true);
        })();
    }, [user]);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            if (!dbAvailable) throw new Error('Storage not configured');
            const { error } = await supabase.from('profile_settings' as any).upsert({
                user_id: user.id,
                email_enabled: settings.email_enabled,
                inapp_enabled: settings.inapp_enabled,
                digest_frequency: settings.digest_frequency,
                toggles: settings.toggles,
                updated_at: new Date().toISOString(),
            } as any, { onConflict: 'user_id' });
            if (error) throw error;
            showToast({ type: 'success', message: 'Notification preferences saved!' });
        } catch {
            showToast({ type: 'error', message: 'Could not save preferences. Settings storage may not be configured yet.' });
        }
        setSaving(false);
    };

    if (!loaded) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map(i => (
                    <div key={i} className="dash-card rounded-xl border dash-border p-6 animate-pulse">
                        <div className="h-4 bg-[var(--color-surface-alt)] rounded w-48 mb-4" />
                        <div className="h-8 dash-surface-alt rounded w-full" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-[var(--color-success)] text-white' : toast.type === 'error' ? 'bg-[var(--color-danger)] text-white' : 'bg-[var(--color-info)] text-white'
                            }`}
                    >
                        {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>

            {!dbAvailable && (
                <div className="bg-behance-amber-50 border border-behance-amber-200 rounded-lg p-4 flex items-start gap-3">
                    <Info className="w-5 h-5 text-behance-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-behance-amber-800">Settings storage not configured yet</p>
                        <p className="text-xs text-behance-amber-600 mt-1">Preferences will be stored locally until the database migration is applied.</p>
                    </div>
                </div>
            )}

            {/* Channels */}
            <div className="dash-card rounded-xl border dash-border p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Bell className="w-5 h-5 text-[var(--color-behance-blue)]" />
                    <h3 className="text-base font-semibold dash-text">Notification Channels</h3>
                </div>
                <div className="space-y-4">
                    <ToggleRow
                        icon={Mail}
                        label="Email Notifications"
                        desc="Receive notifications via email"
                        checked={settings.email_enabled}
                        onChange={v => setSettings(s => ({ ...s, email_enabled: v }))}
                    />
                    <ToggleRow
                        icon={Smartphone}
                        label="In-App Notifications"
                        desc="Show notifications within the platform"
                        checked={settings.inapp_enabled}
                        onChange={v => setSettings(s => ({ ...s, inapp_enabled: v }))}
                    />
                </div>
            </div>

            {/* Digest Frequency */}
            <div className="dash-card rounded-xl border dash-border p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-[var(--color-behance-blue)]" />
                    <h3 className="text-base font-semibold dash-text">Digest Frequency</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                    {(['immediate', 'daily', 'weekly'] as const).map(freq => (
                        <button
                            key={freq}
                            onClick={() => setSettings(s => ({ ...s, digest_frequency: freq }))}
                            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${settings.digest_frequency === freq
                                    ? 'bg-[var(--color-behance-blue)] text-white border-[var(--color-behance-blue)]'
                                    : 'dash-card dash-text border-[var(--color-border)] hover:dash-surface-alt'
                                }`}
                        >
                            {freq.charAt(0).toUpperCase() + freq.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Category Toggles */}
            <div className="dash-card rounded-xl border dash-border p-6">
                <h3 className="text-base font-semibold dash-text mb-4">Notification Categories</h3>
                <div className="space-y-4">
                    {([
                        ['status_changes', 'Status Changes', 'When a document status changes (e.g. approved, flagged)'],
                        ['comments_mentions', 'Comments & Mentions', 'When someone comments on or mentions you'],
                        ['approvals_rejections', 'Approvals & Rejections', 'When a document is approved or rejected by legal'],
                        ['sla_alerts', 'SLA Alerts', 'When review deadlines are approaching or missed'],
                        ['expiry_reminders', 'Expiry Reminders', 'Upcoming regulation or document expiry notifications'],
                    ] as const).map(([key, label, desc]) => (
                        <ToggleRow
                            key={key}
                            label={label}
                            desc={desc}
                            checked={settings.toggles[key]}
                            onChange={v => setSettings(s => ({ ...s, toggles: { ...s.toggles, [key]: v } }))}
                        />
                    ))}
                </div>
            </div>

            {/* Save */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[var(--color-behance-blue)] rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving…' : 'Save Preferences'}
                </button>
            </div>
        </div>
    );
}

/* ── Toggle Row ── */
function ToggleRow({ icon: Icon, label, desc, checked, onChange }: {
    icon?: any; label: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
                {Icon && <Icon className="w-4 h-4 dash-text-tertiary mt-0.5" />}
                <div>
                    <p className="text-sm font-medium dash-text">{label}</p>
                    <p className="text-xs dash-text-secondary">{desc}</p>
                </div>
            </div>
            <button
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${checked ? 'bg-[var(--color-behance-blue)]' : 'bg-[var(--color-border)]'
                    }`}
            >
                <span className={`inline-block h-4 w-4 transform rounded-full dash-card transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>
    );
}

