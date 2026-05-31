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
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                        <h3 className="text-sm font-semibold dash-text tracking-tight">
                            {title}
                        </h3>
                        {subtitle && (
                            <p className="text-xs dash-text-secondary mt-0.5">{subtitle}</p>
                        )}
                    </div>
                    {actions && <div className="flex items-center gap-2">{actions}</div>}
                </div>
            )}

            <motion.div variants={itemVariants}>{children}</motion.div>
        </motion.section>
    );
}

export { itemVariants, containerVariants };
