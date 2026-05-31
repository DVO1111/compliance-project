import { motion } from "framer-motion";
import type { ReactNode } from "react";

export interface DashboardViewProps {
    id: string;
    label: string;
}

interface DashboardCardProps {
    children: ReactNode;
    className?: string;
    noPadding?: boolean;
    onClick?: () => void;
    // New Multi-View Props
    views?: DashboardViewProps[];
    currentView?: string;
    onViewChange?: (viewId: string) => void;
}

export default function DashboardCard({
    children,
    className = "",
    noPadding = false,
    onClick,
    views,
    currentView,
    onViewChange,
}: DashboardCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            whileHover={{ y: -2, transition: { duration: 0.2 } }}
            className={`dash-card h-full min-h-[100px] flex flex-col ${noPadding ? "" : "p-4"} ${onClick ? "cursor-pointer" : ""
                } ${className}`}
            onClick={onClick}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={
                onClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") onClick();
                    }
                    : undefined
            }
        >
            {views && views.length > 0 && currentView && onViewChange && (
                <div className={`flex items-center justify-end mb-4 ${noPadding ? "p-5 pb-0" : ""}`}>
                    <div className="flex bg-[var(--color-surface-alt)] rounded-lg p-1 border dash-border shrink-0">
                        {views.map((v) => (
                            <button
                                key={v.id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onViewChange(v.id);
                                }}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${currentView === v.id
                                    ? "bg-[var(--color-surface)] shadow-sm text-behance-blue border border-[var(--color-border)]"
                                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/50 border border-transparent"
                                    }`}
                            >
                                {v.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {children}
        </motion.div>
    );
}
