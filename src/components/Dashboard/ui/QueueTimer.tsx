import { useEffect, useState } from "react";
import { Clock, AlertCircle } from "lucide-react";

interface QueueTimerProps {
    submittedAt: string | null;
}

export default function QueueTimer({ submittedAt }: QueueTimerProps) {
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [isBreached, setIsBreached] = useState(false);

    useEffect(() => {
        if (!submittedAt) return;

        const calculateTime = () => {
            const now = new Date().getTime();
            const submitted = new Date(submittedAt).getTime();
            const slaLimit = 24 * 60 * 60 * 1000; // 24 hours in ms
            const diff = slaLimit - (now - submitted);

            if (diff <= 0) {
                setTimeLeft(0);
                setIsBreached(true);
            } else {
                setTimeLeft(diff);
                setIsBreached(false);
            }
        };

        calculateTime();
        const interval = setInterval(calculateTime, 1000);

        return () => clearInterval(interval);
    }, [submittedAt]);

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    };

    if (!submittedAt) return <span className="dash-text-tertiary">—</span>;

    // Logic for colors
    // Red: < 2h (7200000 ms)
    // Orange: < 6h (21600000 ms)
    // Green: > 6h
    const twoHours = 2 * 60 * 60 * 1000;
    const sixHours = 6 * 60 * 60 * 1000;

    let colorClass = "text-behance-green";
    let bgClass = "bg-behance-green/10";
    let borderClass = "border-behance-green/20";

    if (isBreached || timeLeft < twoHours) {
        colorClass = "text-behance-pink";
        bgClass = "bg-behance-pink/10";
        borderClass = "border-behance-pink/20";
    } else if (timeLeft < sixHours) {
        colorClass = "text-orange-400";
        bgClass = "bg-orange-500/10";
        borderClass = "border-orange-500/20";
    }

    return (
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${bgClass} ${borderClass} ${colorClass} font-mono text-[10px] font-bold tabular-nums`}>
            {isBreached ? (
                <>
                    <AlertCircle className="w-3 h-3" />
                    <span>BREACHED</span>
                </>
            ) : (
                <>
                    <Clock className="w-3 h-3" />
                    <span>{formatTime(timeLeft)}</span>
                </>
            )}
        </div>
    );
}
