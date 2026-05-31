import type { CSSProperties } from "react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { motion } from "framer-motion";
import Sparkline from "./Sparkline";

type IconType = ComponentType<{ className?: string; style?: CSSProperties }>;

interface MetricCardProps {
    title: string;
    value: string | number;
    icon: IconType;
    subtext?: string;
    delta?: { value: number; label?: string }; // percentage change for badge
    trendData?: number[]; // weekly trend array for sparkline
    trendValue?: number; // legacy delta support or new percentage change
    onClick?: () => void;
    variant?: "blue" | "green" | "red" | "yellow" | "purple";
    className?: string;
}

function AnimatedNumber({ target, color }: { target: string; color?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const [display, setDisplay] = useState(target);

    useEffect(() => {
        // Only animate pure numbers
        const num = parseFloat(target.replace(/[^0-9.-]/g, ""));
        if (Number.isNaN(num) || !Number.isFinite(num) || target === "—" || target === "…") {
            setDisplay(target);
            return;
        }

        const suffix = target.replace(/[0-9.-]/g, "");
        const duration = 600;
        const start = performance.now();
        let animId: number;

        const step = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = num * eased;

            if (Number.isInteger(num)) {
                setDisplay(`${Math.round(current)}${suffix}`);
            } else {
                setDisplay(`${current.toFixed(1)}${suffix}`);
            }

            if (progress < 1) animId = requestAnimationFrame(step);
        };

        animId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(animId);
    }, [target]);

    return <span ref={ref} style={{ color }}>{display}</span>;
}

export default function MetricCard({
    title,
    value,
    icon: Icon,
    subtext,
    delta: deltaProp,
    trendData,
    trendValue,
    onClick,
    variant,
    className = "",
}: MetricCardProps) {
    const valStr = typeof value === "number" ? String(value) : value;

    // Normalize delta from props
    const delta = deltaProp || (trendValue !== undefined ? { value: trendValue } : undefined);

    // Theme-aware styles based on variant
    const cardStyle = variant ? {
        background: `var(--metric-${variant}-bg)`,
        borderColor: "rgba(255, 255, 255, 0.1)",
    } : {};

    const titleColor = variant ? `var(--metric-${variant}-secondary)` : undefined;
    const valueColor = variant ? `var(--metric-${variant}-text)` : undefined;
    const subtextColor = variant ? `var(--metric-${variant}-secondary)` : undefined;
    const iconBg = variant ? `var(--metric-${variant}-delta-bg)` : "var(--color-accent-soft)";
    const iconColor = variant ? `var(--metric-${variant}-accent)` : undefined;
    const sparkColor = variant ? "rgba(255,255,255,0.6)" : "var(--color-accent)";

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className={`dash-card h-full min-h-[100px] p-3.5 relative overflow-hidden flex flex-col justify-between ${onClick ? "cursor-pointer" : ""} ${className}`}
            style={cardStyle}
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
            {/* Subtle background wave/pattern if variant is present */}
            {variant && (
                <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none">
                    <svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 80C30 70 40 40 70 30C100 20 120 40 120 0V80H0Z" fill="white" />
                    </svg>
                </div>
            )}

            <div className="flex items-start justify-between gap-3 relative z-10">
                <div className="min-w-0 flex-1">
                    <p
                        className="text-[9px] font-black uppercase tracking-wider opacity-80 truncate"
                        title={title}
                        style={{ color: titleColor || "var(--color-text-secondary)" }}
                    >
                        {title}
                    </p>
                    <p
                        className="text-xl font-black mt-0.5 tabular-nums"
                        style={{ color: valueColor || "var(--color-text-primary)" }}
                    >
                        <AnimatedNumber target={valStr} />
                    </p>
                </div>
                <div
                    className="p-2 rounded-xl shrink-0 backdrop-blur-sm"
                    style={{ background: iconBg }}
                >
                    <Icon className={`w-4 h-4 ${iconColor ? "" : "dash-accent"}`} style={{ color: iconColor }} />
                </div>
            </div>

            <div className="mt-4 relative z-10">
                {trendData && trendData.length > 0 && (
                    <div className="mb-2">
                        <Sparkline data={trendData} color={sparkColor} height={24} />
                    </div>
                )}

                <div className="flex items-center gap-2">
                    {delta && (
                        <div
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"
                            style={{
                                background: variant ? `var(--metric-${variant}-delta-bg)` : (delta.value >= 0 ? "var(--color-success-soft)" : "var(--color-danger-soft)"),
                                color: variant ? `var(--metric-${variant}-delta-text)` : (delta.value >= 0 ? "var(--color-success)" : "var(--color-danger)")
                            }}
                        >
                            {delta.value >= 0 ? "↑" : "↓"}
                            {Math.abs(delta.value)}%
                        </div>
                    )}
                    {subtext && (
                        <p
                            className="text-[9px] font-medium truncate opacity-70"
                            style={{ color: subtextColor || "var(--color-text-tertiary)" }}
                        >
                            {subtext}
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
