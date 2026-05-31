interface SkeletonProps {
    className?: string;
}

/** Single shimmer line — default h-4 w-full */
export function SkeletonLine({ className = "h-4 w-full" }: SkeletonProps) {
    return <div className={`skeleton ${className}`} />;
}

/** Card-shaped skeleton block */
export function SkeletonCard({ className = "h-28" }: SkeletonProps) {
    return <div className={`skeleton rounded-xl ${className}`} />;
}

/** Chart placeholder with aspect ratio */
export function SkeletonChart({ className = "h-48" }: SkeletonProps) {
    return (
        <div className={`skeleton rounded-lg ${className}`}>
            <div className="w-full h-full flex items-end gap-1 p-4 opacity-20">
                {[40, 65, 50, 80, 60, 72, 55].map((h, i) => (
                    <div
                        key={i}
                        className="flex-1 rounded-t"
                        style={{
                            height: `${h}%`,
                            background: "var(--color-skeleton-shine)",
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

/** Table placeholder — renders n rows */
export function SkeletonTable({
    rows = 4,
    cols = 5,
    className = "",
}: {
    rows?: number;
    cols?: number;
    className?: string;
}) {
    return (
        <div className={`space-y-2 ${className}`}>
            {/* Header row */}
            <div className="flex gap-3">
                {Array.from({ length: cols }).map((_, c) => (
                    <SkeletonLine
                        key={`h-${c}`}
                        className={`h-3 ${c === 0 ? "w-1/3" : "flex-1"}`}
                    />
                ))}
            </div>
            {/* Body rows */}
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="flex gap-3">
                    {Array.from({ length: cols }).map((_, c) => (
                        <SkeletonLine
                            key={`${r}-${c}`}
                            className={`h-4 ${c === 0 ? "w-1/3" : "flex-1"}`}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

/** Metric card skeleton */
export function SkeletonMetric({ className = "" }: SkeletonProps) {
    return (
        <div className={`dash-card p-4 space-y-3 ${className}`}>
            <SkeletonLine className="h-3 w-2/3" />
            <SkeletonLine className="h-7 w-1/3" />
            <SkeletonLine className="h-2.5 w-1/2" />
        </div>
    );
}
