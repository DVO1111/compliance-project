import { useState, useEffect, useMemo } from 'react';
import {
    GraduationCap, Printer, TrendingUp, Target,
    Trophy, Calendar, Filter, ChevronDown, ChevronUp,
    CheckCircle2, XCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { TRAINING_QUESTIONS, getJurisdictionColor } from '../../lib/trainingQuestions';
import type { TrainingQuestion } from '../../lib/trainingQuestions';

interface TrainingRecord {
    id: string;
    user_id: string;
    question_id: string;
    selected_answer: number;
    is_correct: boolean;
    answered_at: string;
    user_name?: string;
    user_email?: string;
}

const Q_MAP = new Map<string, TrainingQuestion>();
TRAINING_QUESTIONS.forEach(q => Q_MAP.set(q.id, q));

export default function TrainingLogPage() {
    const { user } = useAuth();

    const [records, setRecords] = useState<TrainingRecord[]>([]);
    const [profiles, setProfiles] = useState<Map<string, { name: string; email: string }>>(new Map());
    const [loading, setLoading] = useState(true);
    const [filterJurisdiction, setFilterJurisdiction] = useState<string>('all');
    const [filterUser, setFilterUser] = useState<string>('all');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    useEffect(() => {
        if (!user?.id) return;

        const load = async () => {
            setLoading(true);

            const { data, error } = await (supabase as any)
                .from('training_responses')
                .select('*')
                .order('answered_at', { ascending: false })
                .limit(500);

            if (!error && data) {
                setRecords(data);

                const userIds = [...new Set(data.map((r: any) => r.user_id))] as string[];
                if (userIds.length > 0) {
                    const { data: profs } = await (supabase as any)
                        .from('profiles')
                        .select('id, full_name, email')
                        .in('id', userIds);

                    const m = new Map<string, { name: string; email: string }>();
                    (profs || []).forEach((p: any) => {
                        m.set(p.id, { name: p.full_name || 'Unknown', email: p.email || '' });
                    });
                    setProfiles(m);
                }
            }

            setLoading(false);
        };

        load();
    }, [user?.id]);

    const filteredRecords = useMemo(() => {
        let result = [...records];

        if (filterJurisdiction !== 'all') {
            result = result.filter(r => {
                const q = Q_MAP.get(r.question_id);
                return q?.jurisdiction === filterJurisdiction;
            });
        }

        if (filterUser !== 'all') {
            result = result.filter(r => r.user_id === filterUser);
        }

        result.sort((a, b) => {
            const da = new Date(a.answered_at).getTime();
            const db = new Date(b.answered_at).getTime();
            return sortDir === 'desc' ? db - da : da - db;
        });

        return result;
    }, [records, filterJurisdiction, filterUser, sortDir]);

    const stats = useMemo(() => {
        const total = filteredRecords.length;
        const correct = filteredRecords.filter(r => r.is_correct).length;
        const uniqueUsers = new Set(filteredRecords.map(r => r.user_id)).size;
        const uniqueDays = new Set(filteredRecords.map(r => r.answered_at?.slice(0, 10))).size;
        return { total, correct, uniqueUsers, uniqueDays, accuracy: total > 0 ? Math.round((correct / total) * 100) : 0 };
    }, [filteredRecords]);

    const userOptions = useMemo(() => {
        const ids = [...new Set(records.map(r => r.user_id))];
        return ids.map(id => ({
            id,
            name: profiles.get(id)?.name || 'Unknown User',
        }));
    }, [records, profiles]);

    const handlePrint = () => { window.print(); };

    const printCss = `
    @media print {
      body * { visibility: hidden; }
      .training-log-print, .training-log-print * { visibility: visible; }
      .training-log-print { position: absolute; left: 0; top: 0; width: 100%; }
      .no-print { display: none !important; }
      .print-only { display: block !important; }
      table { font-size: 11px; }
      th, td { padding: 6px 8px !important; }
    }
  `;

    return (
        <div className="space-y-6 training-log-print">
            <style dangerouslySetInnerHTML={{ __html: printCss }} />

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-[var(--color-info)] to-indigo-700 shadow-lg">
                        <GraduationCap className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Training Log</h1>
                        <p className="text-sm text-[var(--color-text-secondary)]">Audit-ready compliance training records</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 no-print">
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors shadow-sm"
                    >
                        <Printer className="w-4 h-4" />
                        Print Audit Report
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Quizzes', value: stats.total, icon: Target, color: 'var(--color-info)' },
                    { label: 'Accuracy', value: `${stats.accuracy}%`, icon: TrendingUp, color: 'var(--color-success)' },
                    { label: 'Staff Trained', value: stats.uniqueUsers, icon: Trophy, color: 'var(--color-warning)' },
                    { label: 'Training Days', value: stats.uniqueDays, icon: Calendar, color: 'var(--color-purple)' },
                ].map((card) => (
                    <div key={card.label} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-lg" style={{ background: `${card.color}15` }}>
                                <card.icon className="w-4 h-4" style={{ color: card.color }} />
                            </div>
                            <span className="text-xs font-medium text-[var(--color-text-secondary)]">{card.label}</span>
                        </div>
                        <p className="text-2xl font-bold text-[var(--color-text-primary)]">{card.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 no-print">
                <div className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
                    <Filter className="w-4 h-4" />
                    <span className="font-medium">Filters:</span>
                </div>

                <select
                    value={filterJurisdiction}
                    onChange={(e) => setFilterJurisdiction(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-sm bg-[var(--color-surface)]"
                >
                    <option value="all">All Jurisdictions</option>
                    <option value="NAFDAC">NAFDAC</option>
                    <option value="FDA">FDA</option>
                    <option value="EMA">EMA</option>
                    <option value="Pan-African">Pan-African</option>
                    <option value="WHO">WHO</option>
                </select>

                <select
                    value={filterUser}
                    onChange={(e) => setFilterUser(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-sm bg-[var(--color-surface)]"
                >
                    <option value="all">All Staff</option>
                    {userOptions.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>

                <button
                    onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-sm bg-[var(--color-surface)] hover:bg-[var(--color-surface-alt)]"
                >
                    {sortDir === 'desc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
                </button>
            </div>

            {/* Print Header */}
            <div className="hidden print-only mb-6 border-b-2 border-[var(--color-border)] pb-4">
                <h2 className="text-lg font-bold">Compliance Training Audit Log</h2>
                <p className="text-sm text-[var(--color-text-secondary)]">
                    Generated on: {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-sm text-[var(--color-text-secondary)]">
                    Total records: {stats.total} | Accuracy: {stats.accuracy}% | Staff: {stats.uniqueUsers} | Days: {stats.uniqueDays}
                </p>
            </div>

            {/* Table */}
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-[var(--color-text-secondary)]">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mx-auto mb-3" />
                        Loading training records…
                    </div>
                ) : filteredRecords.length === 0 ? (
                    <div className="p-12 text-center">
                        <GraduationCap className="w-10 h-10 text-[var(--color-text-tertiary)] mx-auto mb-3" />
                        <p className="text-sm text-[var(--color-text-secondary)] font-medium">No training records yet</p>
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Complete the daily quiz on your dashboard to start building your training log.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-[var(--color-surface-alt)] border-b border-[var(--color-border)]">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Date</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Staff</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Jurisdiction</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Question</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Result</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider no-print">Regulation</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                                {filteredRecords.map((r) => {
                                    const q = Q_MAP.get(r.question_id);
                                    const userName = profiles.get(r.user_id)?.name || 'Unknown';
                                    const jColor = q ? getJurisdictionColor(q.jurisdiction) : '#6b7280';

                                    return (
                                        <tr key={r.id} className="hover:bg-[var(--color-surface-alt)] transition-colors">
                                            <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
                                                {new Date(r.answered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                <span className="text-xs text-[var(--color-text-tertiary)] ml-1">
                                                    {new Date(r.answered_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-medium text-[var(--color-text-primary)]">{userName}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                {q && (
                                                    <span
                                                        className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                                                        style={{ background: jColor }}
                                                    >
                                                        {q.jurisdiction}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)] max-w-xs truncate">
                                                {q?.question || r.question_id}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {r.is_correct ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-success-soft)] text-[var(--color-success)] text-xs font-semibold">
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        Correct
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)] text-xs font-semibold">
                                                        <XCircle className="w-3 h-3" />
                                                        Incorrect
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)] max-w-[200px] truncate no-print">
                                                {q?.regulationCited || '\u2014'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Print footer */}
            <div className="hidden print-only mt-8 pt-4 border-t border-[var(--color-border)] text-xs text-[var(--color-text-secondary)]">
                <p>This report was generated by Criateur Compliance \u2014 Healthcare RegTech Platform.</p>
                <p>All training records are electronically logged and tamper-evident.</p>
                <p className="mt-2 font-semibold">Authorized Signature: _________________________ Date: _____________</p>
            </div>
        </div>
    );
}
