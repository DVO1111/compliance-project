import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    type ExtractedLicenseData,
    extractLicenseData,
    createLicense,
} from '../../lib/licenseService';
import {
    Upload, FileText, X, CheckCircle, AlertCircle, Loader2, Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    onClose: () => void;
    onCreated: () => void;
}

export default function LicenseUploadModal({ onClose, onCreated }: Props) {
    const { user, profile } = useAuth();
    const [step, setStep] = useState<'upload' | 'review' | 'saving'>('upload');
    const [extracting, setExtracting] = useState(false);
    const [fileName, setFileName] = useState('');
    const [extracted, setExtracted] = useState<ExtractedLicenseData | null>(null);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Editable form state
    const [form, setForm] = useState({
        product_name: '',
        nafdac_reg_number: '',
        expiry_date: '',
        issue_date: '',
        issuing_authority: 'NAFDAC',
        category: 'Drug',
        notes: '',
    });

    const showToast = (t: { type: 'success' | 'error'; message: string }) => {
        setToast(t);
        setTimeout(() => setToast(null), 3500);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        setExtracting(true);

        try {
            let text = '';
            if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
                text = await file.text();
            } else {
                // For PDF/images, read as text (basic extraction)
                text = await file.text();
            }

            const data = extractLicenseData(text);
            setExtracted(data);
            setForm({
                product_name: data.product_name,
                nafdac_reg_number: data.nafdac_reg_number,
                expiry_date: data.expiry_date,
                issue_date: data.issue_date,
                issuing_authority: data.issuing_authority,
                category: data.category,
                notes: '',
            });
            setStep('review');
        } catch {
            showToast({ type: 'error', message: 'Failed to read file. Try a different format.' });
        }
        setExtracting(false);
    };

    const handleManualEntry = () => {
        setExtracted({ product_name: '', nafdac_reg_number: '', expiry_date: '', issue_date: '', issuing_authority: 'NAFDAC', category: 'Drug', confidence: 'low' });
        setStep('review');
    };

    const handleSave = async () => {
        if (!form.product_name.trim()) {
            showToast({ type: 'error', message: 'Product name is required.' });
            return;
        }
        if (!form.expiry_date) {
            showToast({ type: 'error', message: 'Expiry date is required.' });
            return;
        }
        if (!user || !profile?.company_id) return;
        setStep('saving');

        try {
            await createLicense({
                company_id: profile.company_id,
                uploaded_by: user.id,
                product_name: form.product_name.trim(),
                nafdac_reg_number: form.nafdac_reg_number.trim(),
                category: form.category,
                expiry_date: form.expiry_date,
                issue_date: form.issue_date || null,
                issuing_authority: form.issuing_authority,
                certificate_url: null,
                notes: form.notes.trim() || null,
            });
            onCreated();
        } catch (err: any) {
            showToast({ type: 'error', message: err.message || 'Failed to save license.' });
            setStep('review');
        }
    };

    return (
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
                className="bg-[var(--color-surface)] rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-[#004A99] to-[#0066cc] px-6 py-4 flex items-center justify-between">
                    <h3 className="text-white font-semibold text-lg">Add License / Certificate</h3>
                    <button onClick={onClose} className="p-1 text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                {/* Toast */}
                <AnimatePresence>
                    {toast && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className={`mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'}`}>
                            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {toast.message}
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="overflow-y-auto flex-1 p-6">
                    {step === 'upload' && (
                        <div className="space-y-4">
                            <div className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-8 text-center hover:border-[#004A99] transition-colors">
                                {extracting ? (
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 className="w-8 h-8 text-[#004A99] animate-spin" />
                                        <p className="text-sm text-[var(--color-text-secondary)]">Extracting certificate data…</p>
                                    </div>
                                ) : (
                                    <label className="cursor-pointer flex flex-col items-center gap-3">
                                        <Upload className="w-8 h-8 text-[var(--color-text-tertiary)]" />
                                        <div>
                                            <p className="text-sm font-medium text-[var(--color-text-primary)]">Upload Certificate</p>
                                            <p className="text-xs text-[var(--color-text-secondary)] mt-1">PDF, TXT, or image file</p>
                                        </div>
                                        <input type="file" accept=".pdf,.txt,.png,.jpg,.jpeg" className="hidden" onChange={handleFileSelect} />
                                    </label>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-px bg-[var(--color-surface-alt)]" />
                                <span className="text-xs text-[var(--color-text-tertiary)]">OR</span>
                                <div className="flex-1 h-px bg-[var(--color-surface-alt)]" />
                            </div>

                            <button
                                onClick={handleManualEntry}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-[#004A99] bg-[var(--color-info-soft)] border border-[var(--color-info)]/20 rounded-xl hover:bg-[var(--color-info-soft)] transition-colors"
                            >
                                <FileText className="w-4 h-4" />
                                Enter Details Manually
                            </button>
                        </div>
                    )}

                    {step === 'review' && (
                        <div className="space-y-4">
                            {extracted && extracted.confidence !== 'low' && (
                                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${extracted.confidence === 'high' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
                                    }`}>
                                    <Sparkles className="w-4 h-4" />
                                    AI extracted data ({extracted.confidence} confidence) — please review and edit
                                </div>
                            )}

                            {fileName && (
                                <p className="text-xs text-[var(--color-text-secondary)]">Source: {fileName}</p>
                            )}

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Product Name <span className="text-[var(--color-danger)]">*</span></label>
                                    <input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-[#004A99] focus:border-transparent outline-none"
                                        placeholder="e.g. Amoxicillin 500mg Capsules" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">NAFDAC Registration No.</label>
                                    <input value={form.nafdac_reg_number} onChange={e => setForm(f => ({ ...f, nafdac_reg_number: e.target.value }))}
                                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-[#004A99] focus:border-transparent outline-none"
                                        placeholder="e.g. A4-0123" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Issue Date</label>
                                        <input type="date" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))}
                                            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-[#004A99] focus:border-transparent outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Expiry Date <span className="text-[var(--color-danger)]">*</span></label>
                                        <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))}
                                            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-[#004A99] focus:border-transparent outline-none" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Category</label>
                                        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-[#004A99] focus:border-transparent outline-none bg-[var(--color-surface)]">
                                            {['Drug', 'Biological', 'Cosmetic', 'Medical Device', 'Processed Food', 'Chemical', 'Herbal Medicine'].map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Issuing Authority</label>
                                        <input value={form.issuing_authority} onChange={e => setForm(f => ({ ...f, issuing_authority: e.target.value }))}
                                            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-[#004A99] focus:border-transparent outline-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Notes</label>
                                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-[#004A99] focus:border-transparent outline-none resize-none"
                                        placeholder="Any additional notes…" />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'saving' && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <Loader2 className="w-8 h-8 text-[#004A99] animate-spin" />
                            <p className="text-sm text-[var(--color-text-secondary)]">Saving license and generating renewal tasks…</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step === 'review' && (
                    <div className="border-t border-[var(--color-border)] px-6 py-4 flex items-center justify-end gap-3">
                        <button onClick={() => setStep('upload')}
                            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors">
                            Back
                        </button>
                        <button onClick={handleSave}
                            className="px-5 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors">
                            Save License
                        </button>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}
