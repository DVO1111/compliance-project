import { useState } from 'react';
import {
    ShieldCheck,
    Building2,
    FileText,
    Users,
    Scale,
    Check,
    ChevronRight,
    ArrowRight,
    Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../lib/logger';

interface SetupItem {
    id: string;
    icon: React.ElementType;
    title: string;
    description: string;
    cta: string;
    navigateTo?: string;
}

const SETUP_ITEMS: SetupItem[] = [
    {
        id: 'departments',
        icon: Building2,
        title: 'Create your first department',
        description: 'Organise your team by department to enable granular compliance tracking and ownership.',
        cta: 'Create Department',
    },
    {
        id: 'policy',
        icon: FileText,
        title: 'Add your first policy',
        description: 'Upload or write a policy to start building your central policy repository.',
        cta: 'Go to Policies',
        navigateTo: 'policies',
    },
    {
        id: 'obligations',
        icon: Scale,
        title: 'Set compliance obligations',
        description: 'Define the regulations and standards your company must adhere to.',
        cta: 'Set Obligations',
        navigateTo: 'obligations',
    },
    {
        id: 'members',
        icon: Users,
        title: 'Invite your team',
        description: 'Bring your colleagues onto the platform to collaborate on compliance workflows.',
        cta: 'Invite Members',
        navigateTo: 'company-invites',
    },
];

interface Props {
    onComplete: (navigateTo?: string) => void;
}

export default function CompanySetupChecklist({ onComplete }: Props) {
    const { profile } = useAuth();
    const [done, setDone] = useState<Set<string>>(new Set());
    const [activeInline, setActiveInline] = useState<string | null>(null);
    const [deptName, setDeptName] = useState('');
    const [savingDept, setSavingDept] = useState(false);
    const [deptError, setDeptError] = useState('');

    const markDone = (id: string) => setDone(prev => new Set(prev).add(id));

    const handleItemClick = (item: SetupItem) => {
        if (done.has(item.id)) return;
        if (item.id === 'departments') {
            setActiveInline(activeInline === 'departments' ? null : 'departments');
            return;
        }
        markDone(item.id);
        onComplete(item.navigateTo);
    };

    const handleCreateDept = async () => {
        if (!deptName.trim() || !profile?.company_id) return;
        setSavingDept(true);
        setDeptError('');
        try {
            const { error } = await supabase
                .from('departments' as any)
                .insert({ company_id: profile.company_id, name: deptName.trim() });
            if (error) throw error;
            markDone('departments');
            setActiveInline(null);
            setDeptName('');
        } catch (err: any) {
            logger.error('Failed to create department:', err);
            setDeptError(err.message || 'Failed to create department');
        } finally {
            setSavingDept(false);
        }
    };

    const completedCount = done.size;
    const totalCount = SETUP_ITEMS.length;
    const progressPct = Math.round((completedCount / totalCount) * 100);

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#002D62] via-[#003d7a] to-[var(--color-behance-blue)] flex items-center justify-center px-4 py-12">
            <div className="absolute inset-0 opacity-10">
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                        backgroundSize: '48px 48px',
                    }}
                />
            </div>

            <div className="w-full max-w-2xl relative z-10">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 mb-4">
                        <ShieldCheck className="w-8 h-8 text-[var(--color-success)]" />
                        <span className="text-xl font-bold text-white">Criateur Compliance</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Set up your workspace</h1>
                    <p className="text-[var(--color-info)]">
                        Complete these steps to get the most out of your compliance platform.
                    </p>
                </div>

                {/* Progress */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-white/70">{completedCount} of {totalCount} completed</span>
                        <span className="text-sm font-semibold text-white">{progressPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-[var(--color-success)] transition-all duration-500"
                            style={{ width: `${progressPct}%` }}
                        />
                    </div>
                </div>

                {/* Checklist */}
                <div className="space-y-3 mb-6">
                    {SETUP_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const isDone = done.has(item.id);
                        const isInline = activeInline === item.id;

                        return (
                            <div
                                key={item.id}
                                className={`glass-card rounded-2xl border transition-all duration-200 ${
                                    isDone
                                        ? 'border-[var(--color-success)]/40 opacity-70'
                                        : isInline
                                        ? 'border-white/30'
                                        : 'border-white/10 hover:border-white/20'
                                }`}
                            >
                                <div className="flex items-center gap-4 p-5">
                                    {/* Check circle */}
                                    <div
                                        className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                                            isDone
                                                ? 'border-[var(--color-success)] bg-[var(--color-success)]'
                                                : 'border-white/30 bg-white/5'
                                        }`}
                                    >
                                        {isDone ? (
                                            <Check className="w-5 h-5 text-white" />
                                        ) : (
                                            <Icon className="w-5 h-5 text-white/60" />
                                        )}
                                    </div>

                                    {/* Text */}
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-semibold ${isDone ? 'text-white/50 line-through' : 'text-white'}`}>
                                            {item.title}
                                        </p>
                                        <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
                                            {item.description}
                                        </p>
                                    </div>

                                    {/* CTA */}
                                    {!isDone && (
                                        <button
                                            onClick={() => handleItemClick(item)}
                                            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all"
                                        >
                                            {item.cta}
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                {/* Inline department form */}
                                {isInline && item.id === 'departments' && (
                                    <div className="px-5 pb-5 pt-0">
                                        <div className="border-t border-white/10 pt-4">
                                            <label className="block text-xs text-white/60 mb-2 font-medium">Department name</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={deptName}
                                                    onChange={(e) => setDeptName(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateDept()}
                                                    placeholder="e.g. Marketing, Legal, Operations"
                                                    className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/40"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={handleCreateDept}
                                                    disabled={!deptName.trim() || savingDept}
                                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-success)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                                >
                                                    {savingDept ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                    Save
                                                </button>
                                            </div>
                                            {deptError && (
                                                <p className="text-xs text-red-300 mt-2">{deptError}</p>
                                            )}
                                            <p className="text-xs text-white/40 mt-2">You can add more departments later in Settings.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => onComplete()}
                        className="text-sm text-white/40 hover:text-white/70 transition-colors"
                    >
                        Skip setup
                    </button>

                    <button
                        onClick={() => onComplete()}
                        className="btn-primary flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold"
                    >
                        Go to Dashboard
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>

                <p className="text-center text-white/30 text-xs mt-6">
                    You can complete these steps anytime from your dashboard.
                </p>
            </div>
        </div>
    );
}
