import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { providerRegistry, type IntegrationConnection, listConnections } from '../../integrations';
import { createTest, updateTest, type GrcControlTest } from '../../lib/grcAutomation/grcControlTestsService';
import {
    X,
    Settings2,
    Zap,
    Loader2,
    Search,
    Check,
    ChevronRight,
    AlertCircle,
    HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '../../lib/logger';

type ModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    companyId: string;
    userId: string;
    testId?: string | null;
};

export default function AutomationTestModal({ isOpen, onClose, onSuccess, companyId, userId, testId }: ModalProps) {
    const [loading, setLoading] = useState(false);
    const [controls, setControls] = useState<{ id: string; reference_code: string; title: string }[]>([]);
    const [connections, setConnections] = useState<IntegrationConnection[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        test_name: '',
        control_id: '',
        provider_id: '',
        connection_id: '',
        check_type: 'configuration' as GrcControlTest['check_type'],
        frequency: 'daily',
        enabled: true,
        configuration: {
            collectEvidence: true,
            evidenceThrottleHours: 24
        } as any
    });

    const [searchControl, setSearchControl] = useState('');
    const [showControlDropdown, setShowControlDropdown] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchInitialData();
            if (testId) fetchTestData();
            else resetForm();
        }
    }, [isOpen, testId]);

    const resetForm = () => {
        setFormData({
            test_name: '',
            control_id: '',
            provider_id: '',
            connection_id: '',
            check_type: 'configuration',
            frequency: 'daily',
            enabled: true,
            configuration: {
                collectEvidence: true,
                evidenceThrottleHours: 24
            }
        });
        setSearchControl('');
        setError(null);
    };

    const fetchInitialData = async () => {
        try {
            const [controlsRes, connsRes] = await Promise.all([
                supabase.from('grc_controls').select('id, reference_code, title').eq('company_id', companyId).order('reference_code'),
                listConnections(companyId)
            ]);
            setControls((controlsRes.data || []).map((c: any) => ({ ...c, reference_code: c.reference_code || '' })));
            setConnections(connsRes || []);
        } catch (err) {
            logger.error('Failed to fetch modal data:', err);
        }
    };

    const fetchTestData = async () => {
        if (!testId) return;
        try {
            const { data, error } = await (supabase as any)
                .from('grc_control_tests')
                .select('*')
                .eq('id', testId)
                .single();
            if (data) {
                setFormData({
                    test_name: data.test_name,
                    control_id: data.control_id,
                    provider_id: data.provider_id,
                    connection_id: data.connection_id,
                    check_type: data.check_type,
                    frequency: data.frequency,
                    enabled: data.enabled,
                    configuration: data.configuration || { collectEvidence: true, evidenceThrottleHours: 24 }
                });
                const ctrl = controls.find(c => c.id === data.control_id);
                if (ctrl) setSearchControl(`${ctrl.reference_code} - ${ctrl.title}`);
            }
        } catch (err) {
            logger.error('Failed to fetch test details:', err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.control_id || !formData.provider_id || !formData.connection_id || !formData.test_name) {
            setError('Please fill in all required fields');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            if (testId) {
                await updateTest(testId, { ...formData, company_id: companyId }, userId, companyId);
            } else {
                await createTest({ ...formData, company_id: companyId }, userId);
            }
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const automationProviders = providerRegistry.getAllManifests().filter(m => m.supportsAutomation);
    const filteredControls = controls.filter(c =>
        c.reference_code.toLowerCase().includes(searchControl.toLowerCase()) ||
        c.title.toLowerCase().includes(searchControl.toLowerCase())
    );

    const providerConnections = connections.filter(c => c.provider_id === formData.provider_id && c.status === 'active');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--color-purple)]/10 flex items-center justify-center">
                            <Zap className="w-5 h-5 text-[var(--color-purple)]" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">
                                {testId ? 'Edit Automation Test' : 'Configure New Automation'}
                            </h3>
                            <p className="text-xs text-gray-500">Continuous control monitoring</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                    {error && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {/* Test Identity */}
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Test Name *</label>
                            <input
                                type="text"
                                required
                                value={formData.test_name}
                                onChange={(e) => setFormData({ ...formData, test_name: e.target.value })}
                                placeholder="e.g. Daily Slack Connectivity Check"
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-purple)] transition-all"
                            />
                        </div>
                    </div>

                    {/* Control Selection */}
                    <div className="relative">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Associated GRC Control *</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                value={searchControl}
                                onChange={(e) => {
                                    setSearchControl(e.target.value);
                                    setShowControlDropdown(true);
                                }}
                                onFocus={() => setShowControlDropdown(true)}
                                placeholder="Search controls..."
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-purple)] transition-all"
                            />
                        </div>

                        <AnimatePresence>
                            {showControlDropdown && (
                                <motion.div
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 5 }}
                                    className="absolute z-10 w-full mt-2 bg-[#1E293B] border border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto no-scrollbar"
                                >
                                    {filteredControls.length === 0 ? (
                                        <div className="p-4 text-center text-sm text-gray-500 italic">No controls found</div>
                                    ) : (
                                        filteredControls.map(c => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => {
                                                    setFormData({ ...formData, control_id: c.id });
                                                    setSearchControl(`${c.reference_code} - ${c.title}`);
                                                    setShowControlDropdown(false);
                                                }}
                                                className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 flex items-center justify-between ${formData.control_id === c.id ? 'bg-[var(--color-purple)]/10' : ''}`}
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-white truncate">{c.reference_code}</p>
                                                    <p className="text-xs text-gray-400 truncate">{c.title}</p>
                                                </div>
                                                {formData.control_id === c.id && <Check className="w-4 h-4 text-[var(--color-purple)]" />}
                                            </button>
                                        ))
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Provider & Connection */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Service Provider *</label>
                            <select
                                required
                                value={formData.provider_id}
                                onChange={(e) => setFormData({ ...formData, provider_id: e.target.value, connection_id: '' })}
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-purple)] transition-all appearance-none"
                            >
                                <option value="" disabled className="bg-[#0F172A]">Select Provider</option>
                                {automationProviders.map(p => (
                                    <option key={p.id} value={p.id} className="bg-[#0F172A]">{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Integration Connection *</label>
                            <select
                                required
                                disabled={!formData.provider_id}
                                value={formData.connection_id}
                                onChange={(e) => setFormData({ ...formData, connection_id: e.target.value })}
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-purple)] transition-all appearance-none disabled:opacity-50"
                            >
                                <option value="" disabled className="bg-[#0F172A]">Select Connection</option>
                                {providerConnections.map(c => (
                                    <option key={c.id} value={c.id} className="bg-[#0F172A]">{c.display_name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Settings grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Check Type *</label>
                            <select
                                required
                                value={formData.check_type}
                                onChange={(e) => setFormData({ ...formData, check_type: e.target.value as any })}
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-purple)] transition-all"
                            >
                                <option value="configuration" className="bg-[#0F172A]">Configuration Check</option>
                                <option value="log_audit" className="bg-[#0F172A]">Log Audit</option>
                                <option value="resource_list" className="bg-[#0F172A]">Resource List</option>
                                <option value="identity_verify" className="bg-[#0F172A]">Identity Verification</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Frequency *</label>
                            <select
                                required
                                value={formData.frequency}
                                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-purple)] transition-all"
                            >
                                <option value="hourly" className="bg-[#0F172A]">Hourly</option>
                                <option value="daily" className="bg-[#0F172A]">Daily</option>
                                <option value="weekly" className="bg-[#0F172A]">Weekly</option>
                                <option value="monthly" className="bg-[#0F172A]">Monthly</option>
                            </select>
                        </div>
                    </div>

                    {/* Advanced Configuration */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-4">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <Settings2 className="w-3.5 h-3.5" />
                            Evidence Settings
                        </h4>

                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-white">Collect Evidence Artifacts</p>
                                <p className="text-xs text-gray-500">Automatically generate and link Markdown reports to Control.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setFormData({
                                    ...formData,
                                    configuration: { ...formData.configuration, collectEvidence: !formData.configuration.collectEvidence }
                                })}
                                className={`w-12 h-6 rounded-full transition-all relative ${formData.configuration.collectEvidence ? 'bg-[var(--color-purple)]' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.configuration.collectEvidence ? 'right-1' : 'left-1'}`} />
                            </button>
                        </div>

                        {formData.configuration.collectEvidence && (
                            <div className="pt-2">
                                <label className="block text-xs text-gray-400 mb-2 flex items-center gap-1.5">
                                    Evidence Throttling (Hours)
                                    <HelpCircle className="w-3 h-3 text-gray-600" />
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="720"
                                    value={formData.configuration.evidenceThrottleHours}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        configuration: { ...formData.configuration, evidenceThrottleHours: parseInt(e.target.value) || 0 }
                                    })}
                                    className="w-24 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-purple)]"
                                />
                            </div>
                        )}
                    </div>
                </form>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02] flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold text-white bg-[var(--color-purple)] hover:bg-indigo-500 transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                        {testId ? 'Save Changes' : 'Create Automation'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
