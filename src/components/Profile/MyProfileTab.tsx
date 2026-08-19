import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import RegulatorBadge from '../Common/RegulatorBadge';
import { supabase } from '../../lib/supabase';
import {
    User, Mail, Building2, Briefcase, Globe, Clock, Languages, Phone,
    Save, RotateCcw, Camera, CheckCircle, AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const JURISDICTIONS = ['Nigeria', 'United States', 'European Union', 'United Kingdom', 'Ghana', 'Kenya', 'South Africa', 'India', 'Other'];
const TIMEZONES = (Intl as any).supportedValuesOf?.('timeZone') ?? ['Africa/Lagos', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'UTC'];

interface Toast { type: 'success' | 'error'; message: string }

export default function MyProfileTab() {
    const { profile, user, refreshProfile } = useAuth();

    const [form, setForm] = useState({
        full_name: '',
        phone: '',
        department: '',
        default_jurisdiction: '',
        timezone: '',
        language: '',
    });
    const [original, setOriginal] = useState(form);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<Toast | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (!profile) return;
        const data = {
            full_name: profile.full_name ?? '',
            phone: (profile as any).phone ?? '',
            department: profile.department ?? '',
            default_jurisdiction: (profile as any).default_jurisdiction ?? profile.primary_markets?.[0] ?? '',
            timezone: (profile as any).timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: (profile as any).language ?? 'en',
        };
        setForm(data);
        setOriginal(data);
        setAvatarUrl((profile as any).avatar_url ?? null);
    }, [profile]);

    const isDirty = JSON.stringify(form) !== JSON.stringify(original);

    const showToast = (t: Toast) => {
        setToast(t);
        setTimeout(() => setToast(null), 3500);
    };

    const handleSave = async () => {
        if (!form.full_name.trim()) {
            showToast({ type: 'error', message: 'Full name is required.' });
            return;
        }
        setSaving(true);
        try {
            const { error } = await supabase.from('profiles').update({
                full_name: form.full_name.trim(),
                department: form.department.trim() || null,
            } as any).eq('id', user!.id);
            if (error) throw error;
            await refreshProfile();
            setOriginal(form);
            showToast({ type: 'success', message: 'Profile updated successfully!' });
        } catch (err: any) {
            showToast({ type: 'error', message: err.message || 'Failed to save.' });
        }
        setSaving(false);
    };

    const handleReset = () => setForm(original);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        setUploading(true);
        try {
            const ext = file.name.split('.').pop();
            const path = `avatars/${user.id}.${ext}`;
            const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
            if (upErr) throw upErr;
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
            // Cache-bust so re-uploading to the same path shows the new image immediately.
            const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
            const { error: updErr } = await supabase.from('profiles').update({ avatar_url: publicUrl } as any).eq('id', user.id);
            if (updErr) throw updErr;
            setAvatarUrl(publicUrl);
            // Refresh the shared auth profile so the new avatar appears everywhere
            // (top bar, menus) — not just in this tab.
            await refreshProfile();
            showToast({ type: 'success', message: 'Avatar updated!' });
        } catch {
            showToast({ type: 'error', message: 'Avatar upload failed. Storage may not be configured.' });
        }
        setUploading(false);
    };

    const initials = (profile?.full_name ?? 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

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

            {/* Avatar Section */}
            <div className="dash-card rounded-xl border dash-border p-6">
                <h3 className="text-sm font-semibold dash-text-secondary uppercase tracking-wider mb-4">Profile Photo</h3>
                <div className="flex items-center gap-5">
                    <div className="relative group">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 dash-border" />
                        ) : (
                            <div className="w-20 h-20 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white text-2xl font-bold border-2 border-[var(--color-accent-hover)]">
                                {initials}
                            </div>
                        )}
                        <label className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                            <Camera className="w-5 h-5 text-white" />
                            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
                        </label>
                    </div>
                    <div>
                        <p className="text-sm font-medium dash-text">{uploading ? 'Uploading…' : 'Click to change photo'}</p>
                        <p className="text-xs dash-text-secondary mt-1">JPG, PNG, GIF. Max 2MB.</p>
                    </div>
                </div>
            </div>

            {/* Editable Fields */}
            <div className="dash-card rounded-xl border dash-border p-6 space-y-4">
                <h3 className="text-sm font-semibold dash-text-secondary uppercase tracking-wider mb-2">Personal Information</h3>

                <FieldRow icon={User} label="Full Name" required>
                    <input
                        value={form.full_name}
                        onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                        className="w-full px-3 py-2 border border-[var(--color-input-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent outline-none bg-[var(--color-input-bg)] text-[var(--color-text-primary)]"
                        placeholder="Your full name"
                    />
                </FieldRow>

                <FieldRow icon={Phone} label="Phone">
                    <input
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        className="w-full px-3 py-2 border border-[var(--color-input-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent outline-none bg-[var(--color-input-bg)] text-[var(--color-text-primary)]"
                        placeholder="+234 800 000 0000"
                    />
                </FieldRow>

                <FieldRow icon={Briefcase} label="Department">
                    <input
                        value={form.department}
                        onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                        className="w-full px-3 py-2 border border-[var(--color-input-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent outline-none bg-[var(--color-input-bg)] text-[var(--color-text-primary)]"
                        placeholder="e.g. Marketing, Regulatory Affairs"
                    />
                </FieldRow>

                {/* Read-only: the regulator is set once at sign-up and scopes every
                    scan, risk score and audit record already on file. Changing it
                    here would silently re-scope that history. */}
                <FieldRow icon={Globe} label="Regulatory Body">
                    <div className="flex items-center gap-3">
                        <RegulatorBadge />
                        <span className="type-caption-01" style={{ color: 'var(--color-text-tertiary)' }}>
                            Set at sign-up — contact your workspace owner to change it
                        </span>
                    </div>
                </FieldRow>

                <FieldRow icon={Clock} label="Timezone">
                    <select
                        value={form.timezone}
                        onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
                        className="w-full px-3 py-2 border border-[var(--color-input-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent outline-none bg-[var(--color-input-bg)] text-[var(--color-text-primary)]"
                    >
                        {TIMEZONES.map((tz: any) => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                </FieldRow>

                <FieldRow icon={Languages} label="Language">
                    <select
                        value={form.language}
                        onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
                        className="w-full px-3 py-2 border border-[var(--color-input-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent outline-none bg-[var(--color-input-bg)] text-[var(--color-text-primary)]"
                    >
                        <option value="en">English</option>
                        <option value="fr">French</option>
                        <option value="pt">Portuguese</option>
                        <option value="ar">Arabic</option>
                    </select>
                </FieldRow>
            </div>

            {/* Read-Only Fields */}
            <div className="dash-card rounded-xl border dash-border p-6 space-y-4">
                <h3 className="text-sm font-semibold dash-text-secondary uppercase tracking-wider mb-2">Account Information</h3>

                <FieldRow icon={Mail} label="Email" readOnly>
                    <div className="px-3 py-2 dash-surface-alt border dash-border rounded-lg text-sm dash-text-secondary">{profile?.email ?? '—'}</div>
                </FieldRow>

                <FieldRow icon={User} label="Role" readOnly>
                    <div className="px-3 py-2 dash-surface-alt border dash-border rounded-lg text-sm dash-text-secondary capitalize">{profile?.role?.replace(/_/g, ' ') ?? '—'}</div>
                </FieldRow>

                <FieldRow icon={Building2} label="Organization" readOnly>
                    <div className="px-3 py-2 dash-surface-alt border dash-border rounded-lg text-sm dash-text-secondary">{profile?.organization ?? '—'}</div>
                </FieldRow>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-3 justify-end">
                {isDirty && (
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium dash-text dash-card border border-[var(--color-border)] rounded-lg hover:dash-surface-alt transition-colors"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Reset Changes
                    </button>
                )
                }
                <button
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving…' : 'Save Changes'}
                </button>
            </div>
        </div>
    );
}

/* ── Shared FieldRow helper ── */
function FieldRow({ icon: Icon, label, readOnly, required, children }: {
    icon: any; label: string; readOnly?: boolean; required?: boolean; children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <div className="flex items-center gap-2 w-full sm:w-44 shrink-0">
                <Icon className="w-4 h-4 dash-text-tertiary" />
                <span className="text-sm font-medium dash-text">
                    {label}
                    {required && <span className="text-[var(--color-danger)] ml-0.5">*</span>}
                    {readOnly && <span className="text-xs dash-text-tertiary ml-1">(read-only)</span>}
                </span>
            </div>
            <div className="flex-1">{children}</div>
        </div>
    );
}

