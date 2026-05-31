import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export default function OfflineBadge() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [showRestored, setShowRestored] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setShowRestored(true);
            const timer = setTimeout(() => setShowRestored(false), 3000);
            return () => clearTimeout(timer);
        };
        const handleOffline = () => {
            setIsOnline(false);
            setShowRestored(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (isOnline && !showRestored) return null;

    return (
        <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg transition-all duration-500 animate-in fade-in slide-in-from-top-2 ${isOnline
                ? 'bg-[var(--color-success-soft)] text-[var(--color-success)] border border-[var(--color-success)]'
                : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)] border border-[var(--color-danger)]'
                }`}
        >
            {isOnline ? (
                <>
                    <Wifi size={14} />
                    <span>Back Online</span>
                </>
            ) : (
                <>
                    <WifiOff size={14} />
                    <span>Working Offline</span>
                </>
            )}
        </div>
    );
}
