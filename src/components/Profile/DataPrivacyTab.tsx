import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    Download, ShieldCheck, FileText, Database, CheckCircle, AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Toast { type: 'success' | 'error'; message: string }

export default function DataPrivacyTab() {
    const { profile, user } = useAuth();
    const [exporting, setExporting] = useState(false);
    const [toast, setToast] = useState<Toast | null>(null);

    const showToast = (t: Toast) => {
        setToast(t);
        setTimeout(() => setToast(null), 3500);
    };

    const handleExportData = async () => {
        if (!user || !profile) return;
        setExporting(true);

        try {
            const exportData: Record<string, any> = {
                exported_at: new Date().toISOString(),
                profile: {
                    id: profile.id,
                    email: profile.email,
                    full_name: profile.full_name,
                    role: profile.role,
                    organization: profile.organization,
                    department: profile.department,
                    industry_type: profile.industry_type,
                    primary_markets: profile.primary_markets,
                    product_categories: profile.product_categories,
                    company_id: profile.company_id,
                    created_at: profile.created_at,
                    updated_at: profile.updated_at,
                },
            };

            // Try to fetch user's content submissions
            try {
                const { data: submissions } = await supabase
                    .from('content_submissions')
                    .select('id, title, platform, content_topic, status, signoff_status, created_at')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(500);
                exportData.content_submissions = submissions ?? [];
            } catch {
                exportData.content_submissions = '(could not retrieve — insufficient permissions or table not accessible)';
            }

            // Try to fetch user's audit logs
            try {
                const { data: logs } = await supabase
                    .from('audit_logs')
                    .select('id, action, entity_type, entity_id, created_at')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(200);
                exportData.audit_logs = logs ?? [];
            } catch {
                exportData.audit_logs = '(could not retrieve)';
            }

            // Download as JSON
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `my_data_export_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);

            showToast({ type: 'success', message: 'Data exported successfully!' });
        } catch (err: any) {
            showToast({ type: 'error', message: err.message || 'Export failed.' });
        }
        setExporting(false);
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

            {/* Export Data */}
            <div className="dash-card rounded-xl border dash-border p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Download className="w-5 h-5 text-[var(--color-behance-blue)]" />
                    <h3 className="text-base font-semibold dash-text">Export My Data</h3>
                </div>
                <p className="text-sm dash-text-secondary mb-4">
                    Download a copy of your data as a JSON file. This includes your profile information,
                    content submissions, and activity logs.
                </p>
                <button
                    onClick={handleExportData}
                    disabled={exporting}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-behance-blue)] rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
                >
                    <FileText className="w-4 h-4" />
                    {exporting ? 'Exporting…' : 'Download My Data'}
                </button>
            </div>

            {/* Privacy Summary */}
            <div className="dash-card rounded-xl border dash-border p-6">
                <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="w-5 h-5 text-[var(--color-behance-blue)]" />
                    <h3 className="text-base font-semibold dash-text">Privacy Summary</h3>
                </div>
                <div className="space-y-3">
                    {[
                        { icon: Database, title: 'Data We Store', desc: 'Your name, email, role, department, and organization. Content you submit for compliance review, compliance analysis results, and activity audit logs.' },
                        { icon: ShieldCheck, title: 'How We Protect It', desc: 'All data is encrypted at rest and in transit. Access is restricted by role-based policies. Audit logs track every action.' },
                        { icon: FileText, title: 'Your Rights', desc: 'You can export your data at any time, request corrections, or request account deletion. Contact your administrator for data portability requests.' },
                    ].map((item, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 dash-surface-alt rounded-lg">
                            <item.icon className="w-5 h-5 text-[var(--color-behance-blue)] shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold dash-text">{item.title}</p>
                                <p className="text-xs dash-text-secondary mt-1">{item.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

