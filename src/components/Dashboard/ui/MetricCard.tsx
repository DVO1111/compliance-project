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

    // `variant` used to paint a full-bleed gradient with white text. The Figma
    // style guide has no gradients — surfaces are flat with a subtle stroke —
    // so the variant now carries *meaning* instead: it tints the value and the
    // icon so a card that needs action reads as such at a glance.
    const TONE: Record<string, string> = {
        red: "var(--color-danger)",
        yellow: "var(--color-warning)",
        green: "var(--color-success)",
        blue: "var(--color-accent)",
        purple: "var(--color-accent)",
    };
    const tone = variant ? TONE[variant] ?? "var(--color-accent)" : "var(--color-accent)";
    const valueColor = variant && variant !== "purple" && variant !== "blue"
        ? tone
        : "var(--color-text-primary)";

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={`dash-card h-full min-h-[104px] p-4 flex flex-col justify-between ${onClick ? "cursor-pointer" : ""} ${className}`}
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
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    {/* label-01 */}
                    <p
                        className="type-label-01 truncate"
                        title={title}
                        style={{ color: "var(--color-text-secondary)" }}
                    >
                        {title}
                    </p>
                    {/* heading-04 — the number is the point of the card */}
                    <p
                        className="type-heading-04 mt-1 tabular-nums"
                        style={{ color: valueColor }}
                    >
                        <AnimatedNumber target={valStr} />
                    </p>
                </div>
                <Icon className="w-5 h-5 shrink-0" style={{ color: tone }} />
            </div>

            <div className="mt-3">
                {trendData && trendData.length > 0 && (
                    <div className="mb-2">
                        <Sparkline data={trendData} color={tone} height={24} />
                    </div>
                )}

                <div className="flex items-center gap-2">
                    {delta && (
                        <span
                            className="type-caption-01 px-1.5 py-0.5 rounded-md"
                            style={{
                                background: delta.value >= 0 ? "var(--color-success-soft)" : "var(--color-danger-soft)",
                                color: delta.value >= 0 ? "var(--color-success)" : "var(--color-danger)",
                            }}
                        >
                            {delta.value >= 0 ? "\u2191" : "\u2193"}{Math.abs(delta.value)}%
                        </span>
                    )}
                    {subtext && (
                        <p className="type-caption-01 truncate" style={{ color: "var(--color-text-tertiary)" }}>
                            {subtext}
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
