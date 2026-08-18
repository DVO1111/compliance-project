import { CheckCircle2, Circle, Calendar, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import type { RenewalTask } from '../../lib/licenseService';

interface Props {
    tasks: RenewalTask[];
    onToggle: (taskId: string, completed: boolean) => void;
    compact?: boolean;
}

export default function RenewalTaskList({ tasks, onToggle, compact }: Props) {
    if (!tasks.length) {
        return (
            <div className="text-center py-6 text-sm text-[var(--color-text-secondary)]">
                No renewal tasks generated yet. Tasks are auto-created when a license is within 6 months of expiry.
            </div>
        );
    }

    const completed = tasks.filter(t => t.is_completed).length;
    const progress = Math.round((completed / tasks.length) * 100);

    const isOverdue = (deadline: string) => new Date(deadline) < new Date();
    const isDueSoon = (deadline: string) => {
        const d = new Date(deadline);
        const now = new Date();
        const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 14;
    };

    return (
        <div className="space-y-4">
            {/* Progress Bar */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Renewal Progress</span>
                    <span className="text-xs font-bold text-[var(--color-accent)]">{completed}/{tasks.length} completed</span>
                </div>
                <div className="w-full bg-[var(--color-surface-alt)] rounded-full h-2">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className={`h-2 rounded-full ${progress === 100 ? 'bg-[var(--color-success)]' : 'bg-[var(--color-accent)]'}`}
                    />
                </div>
            </div>

            {/* Task List */}
            <div className="space-y-1.5">
                {tasks.map((task, i) => {
                    const overdue = !task.is_completed && isOverdue(task.deadline);
                    const dueSoon = !task.is_completed && isDueSoon(task.deadline);

                    return (
                        <motion.div
                            key={task.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${task.is_completed
                                    ? 'bg-[var(--color-surface-alt)] border-[var(--color-border)]'
                                    : overdue
                                        ? 'bg-[var(--color-danger-soft)]/50 border-[var(--color-danger)]/20'
                                        : dueSoon
                                            ? 'bg-[var(--color-warning-soft)]/50 border-[var(--color-warning)]/20'
                                            : 'bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]'
                                }`}
                            onClick={() => onToggle(task.id, !task.is_completed)}
                        >
                            <div className="mt-0.5 shrink-0">
                                {task.is_completed ? (
                                    <CheckCircle2 className="w-5 h-5 text-[var(--color-success)]" />
                                ) : (
                                    <Circle className={`w-5 h-5 ${overdue ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-tertiary)]'}`} />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${task.is_completed ? 'text-[var(--color-text-tertiary)] line-through' : 'text-[var(--color-text-primary)]'}`}>
                                    {task.sort_order}. {task.title}
                                </p>
                                {!compact && (
                                    <p className={`text-xs mt-0.5 ${task.is_completed ? 'text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-secondary)]'}`}>
                                        {task.description}
                                    </p>
                                )}
                                <div className="flex items-center gap-3 mt-1.5">
                                    <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-[var(--color-danger)] font-semibold' : dueSoon ? 'text-[var(--color-warning)] font-medium' : 'text-[var(--color-text-tertiary)]'
                                        }`}>
                                        {overdue ? <Clock className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                                        {overdue ? 'Overdue — ' : dueSoon ? 'Due soon — ' : ''}
                                        {new Date(task.deadline).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
