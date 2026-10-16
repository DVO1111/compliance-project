import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface DashboardSectionProps {
    title?: string;
    subtitle?: string;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
}

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.05 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export default function DashboardSection({
    title,
    subtitle,
    actions,
    children,
    className = "",
}: DashboardSectionProps) {
    return (
        <motion.section
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className={`space-y-3 ${className}`}
        >
            {title && (
                //  The Criateur Dashboard design sets the subtitle BESIDE the
                //  heading on a shared baseline, not stacked under it: the
                //  heading names the tier and the subtitle qualifies it from
                //  the far edge ("Needs attention … Where quality is slipping
                //  today"). Stacked, the two read as a title and a
                //  description of the same weight; side by side, the heading
                //  carries and the subtitle annotates.
                //
                //  It wraps on narrow viewports, where the subtitle drops
                //  under the heading and the stacked reading returns —
                //  which is the right fallback rather than truncating it.
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <h3
                        className="dash-text"
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 19,
                            fontWeight: 600,
                            fontStretch: '94%',
                            lineHeight: 1.2,
                            margin: 0,
                        }}
                    >
                        {title}
                    </h3>
                    <div className="flex items-baseline gap-3 flex-wrap">
                        {subtitle && (
                            <span className="dash-text-secondary" style={{ fontSize: 13 }}>
                                {subtitle}
                            </span>
                        )}
                        {actions && <div className="flex items-center gap-2">{actions}</div>}
                    </div>
                </div>
            )}

            <motion.div variants={itemVariants}>{children}</motion.div>
        </motion.section>
    );
}

export { itemVariants, containerVariants };
