import { useEffect, useRef, useState } from 'react';
import {
    Building2, Palette, Globe, Upload, Loader2, CheckCircle,
    Database, AlertTriangle, Lock, Sparkles, ChevronRight,
    Image, Type, Link2, Users
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { seedDemoData } from '../../lib/sampleDataSeeder';
import { logger } from '../../lib/logger';

interface CompanySettings {
    name: string;
    logo_url: string;
    brand_color: string;
    tagline: string;
    website_url: string;
}

const DEFAULTS: CompanySettings = {
    name: '',
    logo_url: '',
    brand_color: '#1e3a8a',
    tagline: '',
    website_url: '',
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-[260px_1fr] gap-2 sm:gap-8 items-start py-6 border-b dash-border last:border-0">
            <div className="pt-0.5">
                <p className="text-sm font-semibold dash-text">{label}</p>
                {hint && <p className="text-xs dash-text-tertiary mt-1 leading-relaxed">{hint}</p>}
            </div>
            <div className="w-full">{children}</div>
        </div>
    );
}

export default function CompanySettingsPage() {
    const { user, profile } = useAuth();
    const companyId = (profile as any)?.company_id as string | undefined;
    const isAdminOrOwner =
        (profile as any)?.company_role === 'owner' ||
        (profile as any)?.company_role === 'admin' ||
        (profile as any)?.role === 'admin' ||
        (profile as any)?.role === 'Executive' ||
        (profile as any)?.role === 'Compliance';

    const [settings, setSettings] = useState<CompanySettings>(DEFAULTS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const [logoUploading, setLogoUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [seeding, setSeeding] = useState(false);
    const [seedResult, setSeedResult] = useState<{ text: string; ok: boolean } | null>(null);

    useEffect(() => {
        if (!companyId) { setLoading(false); return; }
        const load = async () => {
            const { data } = await supabase
                .from('company_settings' as any)
                .select('*')
                .eq('company_id', companyId)
                .maybeSingle();
            if (data) {
                setSettings({
                    name: (data as any).name || '',
                    logo_url: (data as any).logo_url || '',
                    brand_color: (data as any).brand_color || '#1e3a8a',
                    tagline: (data as any).tagline || '',
                    website_url: (data as any).website_url || '',
                });
            }
            setLoading(false);
        };
        load();
    }, [companyId]);

    const handleSave = async () => {
        if (!companyId || !isAdminOrOwner) return;
        setSaving(true);
        setSavedMsg(null);
        try {
            const { error } = await supabase
                .from('company_settings' as any)
                .upsert({ company_id: companyId, ...settings, updated_at: new Date().toISOString() });
            if (error) throw error;
            setSavedMsg({ text: 'Changes saved successfully.', ok: true });
            setTimeout(() => setSavedMsg(null), 4000);
        } catch (err: any) {
            logger.error('Failed to save company settings:', err);
            setSavedMsg({ text: 'Failed to save. Please try again.', ok: false });
        } finally {
            setSaving(false);
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !companyId) return;
        if (!file.type.startsWith('image/')) { alert('Please upload an image file.'); return; }
        if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2 MB.'); return; }
        setLogoUploading(true);
        try {
            const ext = file.name.split('.').pop();
            const path = `company-logos/${companyId}.${ext}`;
            const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
            if (upErr) throw upErr;
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
            setSettings(prev => ({ ...prev, logo_url: urlData.publicUrl }));
        } catch (err: any) {
            logger.error('Logo upload failed:', err);
            alert('Logo upload failed. Please try again.');
        } finally {
            setLogoUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSeedData = async () => {
        if (!companyId || !user) return;
        setSeeding(true);
        setSeedResult(null);
        try {
            const result = await seedDemoData(companyId, user.id);
            setSeedResult({
                text: result.message,
                ok: !result.alreadySeeded,
            });
        } catch (err: any) {
            logger.error('Seeding failed:', err);
            setSeedResult({ text: 'Failed to seed demo data. Please try again.', ok: false });
        } finally {
            setSeeding(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-accent)]" />
            </div>
        );
    }

    if (!companyId) {
        return (
            <div className="dash-card rounded-2xl border dash-border p-12 text-center">
                <Building2 className="w-10 h-10 dash-text-tertiary mx-auto mb-3" />
                <p className="text-sm dash-text-secondary">No company linked to your account.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Page header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold dash-text">Company Settings</h1>
                    <p className="text-sm dash-text-tertiary mt-1">Manage your organisation's profile, brand identity, and workspace configuration.</p>
                </div>
                {isAdminOrOwner && (
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="dash-button-primary flex items-center gap-2 shrink-0"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                )}
            </div>

            {/* Read-only banner */}
            {!isAdminOrOwner && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                    <Lock className="w-4 h-4 shrink-0" />
                    <span>You have read-only access. Ask your company owner or admin to make changes.</span>
                </div>
            )}

            {/* Save feedback */}
            {savedMsg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium ${
                    savedMsg.ok
                        ? 'border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]'
                        : 'border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                }`}>
                    {savedMsg.ok ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {savedMsg.text}
                </div>
            )}

            {/* Brand Identity card */}
            <div className="dash-card border dash-border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b dash-border flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-soft)] flex items-center justify-center">
                        <Palette className="w-4 h-4 text-[var(--color-accent)]" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold dash-text">Brand Identity</h2>
                        <p className="text-xs dash-text-tertiary">Your organisation's visual identity and public profile.</p>
                    </div>
                </div>

                <div className="px-6 divide-y dash-divide">
                    {/* Logo */}
                    <Field label="Company Logo" hint="PNG, JPG or SVG — max 2 MB">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-xl border-2 border-dashed dash-border bg-[var(--color-surface-alt)] flex items-center justify-center overflow-hidden shrink-0">
                                {settings.logo_url
                                    ? <img src={settings.logo_url} alt="Company logo" className="w-full h-full object-contain p-1" />
                                    : <Image className="w-6 h-6 dash-text-tertiary" />
                                }
                            </div>
                            <div className="space-y-1">
                                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={logoUploading || !isAdminOrOwner}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl border dash-border text-sm font-medium dash-text hover:bg-[var(--color-surface-alt)] transition-colors disabled:opacity-50"
                                >
                                    {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    {logoUploading ? 'Uploading…' : 'Upload Logo'}
                                </button>
                                {settings.logo_url && isAdminOrOwner && (
                                    <button onClick={() => setSettings(p => ({ ...p, logo_url: '' }))} className="text-xs text-[var(--color-danger)] hover:underline block">
                                        Remove logo
                                    </button>
                                )}
                            </div>
                        </div>
                    </Field>

                    {/* Company name */}
                    <Field label="Company Name" hint="The legal or trading name of your organisation.">
                        <div className="relative">
                            <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                            <input
                                type="text"
                                value={settings.name}
                                onChange={e => setSettings(p => ({ ...p, name: e.target.value }))}
                                disabled={!isAdminOrOwner}
                                placeholder="e.g. Criateur Media Ltd"
                                className="w-full border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-60 transition-all"
                            />
                        </div>
                    </Field>

                    {/* Tagline */}
                    <Field label="Tagline" hint="A short description shown in your workspace header.">
                        <input
                            type="text"
                            value={settings.tagline}
                            onChange={e => setSettings(p => ({ ...p, tagline: e.target.value }))}
                            disabled={!isAdminOrOwner}
                            placeholder="e.g. Compliance, simplified."
                            className="w-full border dash-border rounded-xl px-4 py-2.5 text-sm dash-text bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-60 transition-all"
                        />
                    </Field>

                    {/* Brand color */}
                    <Field label="Primary Brand Colour" hint="Used for accents and brand elements across the platform.">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <input
                                    type="color"
                                    value={settings.brand_color}
                                    onChange={e => setSettings(p => ({ ...p, brand_color: e.target.value }))}
                                    disabled={!isAdminOrOwner}
                                    className="w-10 h-10 rounded-xl border dash-border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed p-1 bg-[var(--color-surface)]"
                                />
                            </div>
                            <input
                                type="text"
                                value={settings.brand_color}
                                onChange={e => setSettings(p => ({ ...p, brand_color: e.target.value }))}
                                disabled={!isAdminOrOwner}
                                placeholder="#1e3a8a"
                                maxLength={7}
                                className="w-28 border dash-border rounded-xl px-3 py-2.5 text-sm font-mono dash-text bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-60"
                            />
                            <div className="w-9 h-9 rounded-xl border dash-border shadow-sm" style={{ backgroundColor: settings.brand_color }} />
                            <span className="text-xs dash-text-tertiary">Preview</span>
                        </div>
                    </Field>

                    {/* Website */}
                    <Field label="Website URL" hint="Your public-facing company website.">
                        <div className="relative">
                            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                            <input
                                type="url"
                                value={settings.website_url}
                                onChange={e => setSettings(p => ({ ...p, website_url: e.target.value }))}
                                disabled={!isAdminOrOwner}
                                placeholder="https://yourcompany.com"
                                className="w-full border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-60 transition-all"
                            />
                        </div>
                    </Field>
                </div>
            </div>

            {/* Quick links to related settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                    { icon: Users, label: 'Manage Members', sub: 'View and remove team members', page: 'company-members' },
                    { icon: Globe, label: 'Invite Team', sub: 'Send invitations to colleagues', page: 'company-invites' },
                ].map(item => (
                    <button
                        key={item.page}
                        onClick={() => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: item.page } }))}
                        className="dash-card border dash-border rounded-2xl p-5 text-left hover:bg-[var(--color-surface-alt)] transition-colors group flex items-center gap-4"
                    >
                        <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-alt)] group-hover:bg-[var(--color-accent-soft)] flex items-center justify-center transition-colors">
                            <item.icon className="w-5 h-5 dash-text-tertiary group-hover:text-[var(--color-accent)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold dash-text">{item.label}</p>
                            <p className="text-xs dash-text-tertiary">{item.sub}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 dash-text-tertiary" />
                    </button>
                ))}
            </div>

            {/* Demo Data / Pilot Setup */}
            {isAdminOrOwner && (
                <div className="dash-card border dash-border rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b dash-border flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-info-soft)] flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-[var(--color-info)]" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold dash-text">Pilot Setup</h2>
                            <p className="text-xs dash-text-tertiary">Seed your workspace with realistic demo data to explore the platform.</p>
                        </div>
                    </div>

                    <div className="p-6 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                                { label: 'Submissions', count: '5' },
                                { label: 'Policies', count: '4' },
                                { label: 'Risks', count: '5' },
                                { label: 'Vendors', count: '3' },
                            ].map(item => (
                                <div key={item.label} className="rounded-xl border dash-border bg-[var(--color-surface-alt)] px-4 py-3 text-center">
                                    <p className="text-xl font-bold dash-text">{item.count}</p>
                                    <p className="text-xs dash-text-tertiary mt-0.5">{item.label}</p>
                                </div>
                            ))}
                        </div>

                        <p className="text-sm dash-text-secondary leading-relaxed">
                            Populates your workspace with sample compliance submissions, policies, risks, vendors, and obligations so your team can explore all modules before adding real data.
                            This will not run if your workspace already has submissions.
                        </p>

                        <div className="flex items-center gap-4 flex-wrap">
                            <button
                                onClick={handleSeedData}
                                disabled={seeding}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--color-info)]/40 text-[var(--color-info)] text-sm font-semibold hover:bg-[var(--color-info-soft)] transition-colors disabled:opacity-60"
                            >
                                {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                                {seeding ? 'Seeding data…' : 'Load Demo Data'}
                            </button>

                            {seedResult && (
                                <div className={`flex items-center gap-2 text-sm font-medium ${seedResult.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
                                    {seedResult.ok
                                        ? <CheckCircle className="w-4 h-4" />
                                        : <AlertTriangle className="w-4 h-4" />}
                                    {seedResult.text}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
