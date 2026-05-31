import { useState, useEffect, useCallback } from 'react';
import { Lightbulb, CheckCircle2, XCircle, ChevronDown, ChevronUp, GraduationCap, Trophy, Sparkles } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { getTodayQuestion, getJurisdictionColor } from '../../../lib/trainingQuestions';
import type { TrainingQuestion } from '../../../lib/trainingQuestions';
import DashboardCard from '../ui/DashboardCard';
import { logger } from '../../../lib/logger';

type QuizState = 'loading' | 'ready' | 'answered' | 'already_done';

export default function DailyQuizWidget() {
    const { user, profile } = useAuth();
    const userId = user?.id;
    const companyId = (profile as any)?.company_id ?? null;

    const [state, setState] = useState<QuizState>('loading');
    const [question, setQuestion] = useState<TrainingQuestion | null>(null);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [tipExpanded, setTipExpanded] = useState(true);
    const [streak, setStreak] = useState(0);
    const [totalScore, setTotalScore] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });
    const [history, setHistory] = useState<any[]>([]);

    const [currentView, setCurrentView] = useState("today");

    const views = [
        { id: "today", label: "Today" },
        { id: "stats", label: "Stats" },
        { id: "history", label: "History" },
    ];

    // Load today's question and check if already answered
    const load = useCallback(async () => {
        if (!userId) return;

        const q = getTodayQuestion(userId);
        setQuestion(q);

        // Check if already answered today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data } = await (supabase as any)
            .from('training_responses')
            .select('is_correct, selected_answer')
            .eq('user_id', userId)
            .eq('question_id', q.id)
            .gte('answered_at', todayStart.toISOString())
            .limit(1);

        if (data && data.length > 0) {
            setSelectedOption(data[0].selected_answer);
            setIsCorrect(data[0].is_correct);
            setState('already_done');
            setTipExpanded(false);
        } else {
            setState('ready');
        }

        // Load overall stats
        const { data: stats } = await (supabase as any)
            .from('training_responses')
            .select('is_correct, answered_at')
            .eq('user_id', userId)
            .order('answered_at', { ascending: false });

        if (stats) {
            setHistory(stats);
            const correct = stats.filter((s: any) => s.is_correct).length;
            setTotalScore({ correct, total: stats.length });

            // Calculate streak (consecutive days with at least one answer)
            let s = 0;
            const now = new Date();
            for (let d = 0; d < 365; d++) {
                const day = new Date(now);
                day.setDate(day.getDate() - d);
                const dayStr = day.toISOString().slice(0, 10);
                const hasAnswer = stats.some((r: any) => r.answered_at?.slice(0, 10) === dayStr);
                if (hasAnswer) s++;
                else break;
            }
            setStreak(s);
        }
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    const handleSubmit = async () => {
        if (!userId || !question || selectedOption === null) return;

        const correct = selectedOption === question.correctIndex;
        setIsCorrect(correct);
        setState('answered');
        setTipExpanded(false);

        // Persist to Supabase
        try {
            await (supabase as any).from('training_responses').insert({
                user_id: userId,
                company_id: companyId,
                question_id: question.id,
                selected_answer: selectedOption,
                is_correct: correct,
            });
            // Refresh stats
            await load();
        } catch (err) {
            logger.error('Failed to save training response:', err);
        }
    };

    if (!question || state === 'loading') {
        return (
            <DashboardCard className="h-full min-h-[400px] max-h-[400px] flex flex-col">
                <div className="p-6 flex-1 flex items-center justify-center text-[var(--color-text-secondary)] min-h-0">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent mr-3" />
                    Loading today's quiz…
                </div>
            </DashboardCard>
        );
    }

    const answered = state === 'answered' || state === 'already_done';
    const jColor = getJurisdictionColor(question.jurisdiction);

    return (
        <DashboardCard
            className="h-full min-h-[400px] max-h-[400px] flex flex-col"
            views={views}
            currentView={currentView}
            onViewChange={setCurrentView}
        >
            <div className="p-5 pt-0 flex-1 overflow-y-auto min-h-0">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl" style={{ background: `${jColor}15` }}>
                            <GraduationCap className="w-5 h-5" style={{ color: jColor }} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Daily Compliance Quiz</h3>
                            <p className="text-xs text-[var(--color-text-secondary)]">
                                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                            </p>
                        </div>
                    </div>

                    {/* Jurisdiction badge */}
                    <span
                        className="px-2.5 py-1 rounded-full text-[11px] font-bold text-white shrink-0 ml-2"
                        style={{ background: jColor }}
                    >
                        {question.jurisdiction}
                    </span>
                </div>

                {currentView === "stats" && (
                    <div className="flex flex-col gap-4 mt-6">
                        <div className="p-5 rounded-xl border dash-border dash-surface-alt flex flex-col items-center justify-center text-center">
                            <Trophy className="w-8 h-8 text-[var(--color-warning)] mb-2" />
                            <h4 className="text-2xl font-bold dash-text">{streak} Days</h4>
                            <p className="text-sm dash-text-secondary mt-1">Current Streak</p>
                        </div>
                        <div className="p-5 rounded-xl border dash-border dash-surface-alt flex flex-col items-center justify-center text-center">
                            <Sparkles className="w-8 h-8 text-[var(--color-success)] mb-2" />
                            <h4 className="text-2xl font-bold dash-text">
                                {totalScore.total > 0 ? Math.round((totalScore.correct / totalScore.total) * 100) : 0}%
                            </h4>
                            <p className="text-sm dash-text-secondary mt-1">
                                Accuracy ({totalScore.correct} / {totalScore.total})
                            </p>
                        </div>
                    </div>
                )}

                {currentView === "history" && (
                    <div className="space-y-2 mt-4">
                        {history.length === 0 ? (
                            <p className="text-sm dash-text-secondary text-center py-6">No quizzes taken yet.</p>
                        ) : (
                            history.map((h, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-lg border dash-border dash-surface-alt">
                                    <div className="flex items-center gap-3">
                                        {h.is_correct ? (
                                            <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
                                        ) : (
                                            <XCircle className="w-4 h-4 text-[var(--color-danger)]" />
                                        )}
                                        <span className="text-sm font-medium dash-text">
                                            {new Date(h.answered_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${h.is_correct ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'}`}>
                                        {h.is_correct ? 'Correct' : 'Incorrect'}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {currentView === "today" && (
                    <>
                        {/* Stats bar */}
                        <div className="flex items-center gap-4 mb-4 p-2.5 rounded-lg dash-surface-alt border dash-border">
                            <div className="flex items-center gap-1.5 text-xs">
                                <Trophy className="w-3.5 h-3.5 text-[var(--color-warning)]" />
                                <span className="font-semibold dash-text">{streak}-day streak</span>
                            </div>
                            <div className="w-px h-4 bg-[var(--color-border)]" />
                            <div className="flex items-center gap-1.5 text-xs">
                                <Sparkles className="w-3.5 h-3.5 text-[var(--color-success)]" />
                                <span className="font-semibold dash-text">
                                    {totalScore.total > 0 ? Math.round((totalScore.correct / totalScore.total) * 100) : 0}% accuracy
                                </span>
                                <span className="dash-text-tertiary">({totalScore.correct}/{totalScore.total})</span>
                            </div>
                        </div>

                        {/* Compliance Tip */}
                        <button
                            onClick={() => setTipExpanded(!tipExpanded)}
                            className="w-full flex items-center justify-between p-3 rounded-lg bg-[var(--color-warning)]/10 border border-amber-500/20 mb-4 text-left hover:bg-[var(--color-warning)]/20 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <Lightbulb className="w-4 h-4 text-[var(--color-warning)] shrink-0" />
                                <span className="text-xs font-semibold text-[var(--color-warning)]">Compliance Tip of the Day</span>
                            </div>
                            {tipExpanded ? (
                                <ChevronUp className="w-4 h-4 text-[var(--color-warning)] shrink-0" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-[var(--color-warning)] shrink-0" />
                            )}
                        </button>
                        {tipExpanded && (
                            <div className="mb-4 px-3 py-2.5 rounded-lg bg-[var(--color-warning)]/5 border border-amber-500/10">
                                <p className="text-sm text-amber-200 leading-relaxed">{question.tip}</p>
                            </div>
                        )}

                        {/* Question */}
                        <div className="mb-4">
                            <p className="text-sm font-semibold dash-text leading-snug mb-1">{question.question}</p>
                            <p className="text-[11px] dash-text-tertiary">{question.category} • {question.regulationCited}</p>
                        </div>

                        {/* Options */}
                        <div className="space-y-2 mb-4">
                            {question.options.map((opt, i) => {
                                const isSelected = selectedOption === i;
                                const isCorrectOption = i === question.correctIndex;

                                let optionClasses = 'border-[var(--color-border)] hover:border-[var(--color-info)]/30 hover:bg-[var(--color-info-soft)]/30';
                                if (answered) {
                                    if (isCorrectOption) {
                                        optionClasses = 'border-emerald-400 bg-[var(--color-success-soft)]';
                                    } else if (isSelected && !isCorrectOption) {
                                        optionClasses = 'border-red-400 bg-[var(--color-danger-soft)]';
                                    } else {
                                        optionClasses = 'border-[var(--color-border)] opacity-50';
                                    }
                                } else if (isSelected) {
                                    optionClasses = 'border-blue-500 bg-[var(--color-info-soft)] ring-1 ring-blue-200';
                                }

                                return (
                                    <button
                                        key={i}
                                        onClick={() => !answered && setSelectedOption(i)}
                                        disabled={answered}
                                        className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${optionClasses}`}
                                    >
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${answered && isCorrectOption
                                            ? 'border-emerald-500 bg-[var(--color-success)]'
                                            : answered && isSelected && !isCorrectOption
                                                ? 'border-red-500 bg-[var(--color-danger)]'
                                                : isSelected
                                                    ? 'border-blue-500 bg-[var(--color-info)]'
                                                    : 'border-[var(--color-border)]'
                                            }`}>
                                            {answered && isCorrectOption && <CheckCircle2 className="w-3 h-3 text-white" />}
                                            {answered && isSelected && !isCorrectOption && <XCircle className="w-3 h-3 text-white" />}
                                            {!answered && isSelected && <div className="w-2 h-2 rounded-full bg-[var(--color-surface)]" />}
                                        </div>
                                        <span className={`text-sm ${answered && isCorrectOption ? 'font-semibold text-[var(--color-success)]' : 'text-[var(--color-text-secondary)]'}`}>
                                            {opt}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Submit / Result */}
                        {!answered ? (
                            <button
                                onClick={handleSubmit}
                                disabled={selectedOption === null}
                                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${selectedOption !== null
                                    ? 'bg-behance-blue text-white hover:opacity-90 shadow-lg shadow-behance-blue/20'
                                    : 'dash-surface border dash-border dash-text-tertiary cursor-not-allowed'
                                    }`}
                            >
                                Submit Answer
                            </button>
                        ) : (
                            <div className={`p-3 rounded-lg text-sm ${isCorrect
                                ? 'bg-[var(--color-success-soft)] border border-[var(--color-success)]/20 text-[var(--color-success)]'
                                : 'bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 text-[var(--color-danger)]'
                                }`}>
                                <div className="flex items-center gap-2 mb-1">
                                    {isCorrect ? (
                                        <><CheckCircle2 className="w-4 h-4" /> <span className="font-bold">Correct!</span></>
                                    ) : (
                                        <><XCircle className="w-4 h-4" /> <span className="font-bold">Not quite</span></>
                                    )}
                                    {state === 'already_done' && (
                                        <span className="text-xs opacity-60 ml-auto">Answered earlier today</span>
                                    )}
                                </div>
                                <p className="text-xs leading-relaxed opacity-80">
                                    The correct answer is: <strong>{question.options[question.correctIndex]}</strong>
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </DashboardCard>
    );
}
