import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    User, KeyRound, Bell, Monitor, ShieldCheck, LifeBuoy, AlertOctagon, ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MyProfileTab from './MyProfileTab';
import SecurityTab from './SecurityTab';
import NotificationsTab from './NotificationsTab';
import SessionsTab from './SessionsTab';
import DataPrivacyTab from './DataPrivacyTab';
import SupportTab from './SupportTab';
import DangerZoneTab from './DangerZoneTab';

type TabId = 'profile' | 'security' | 'notifications' | 'sessions' | 'data-privacy' | 'support' | 'danger-zone';

const TABS: { id: TabId; label: string; icon: typeof User; danger?: boolean }[] = [
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'security', label: 'Security', icon: KeyRound },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'sessions', label: 'Sessions & Devices', icon: Monitor },
    { id: 'data-privacy', label: 'Data & Privacy', icon: ShieldCheck },
    { id: 'support', label: 'Support', icon: LifeBuoy },
    { id: 'danger-zone', label: 'Danger Zone', icon: AlertOctagon, danger: true },
];

export default function ProfilePage() {
    const { profile } = useAuth();
    const [activeTab, setActiveTab] = useState<TabId>('profile');
    const [mobileOpen, setMobileOpen] = useState(false);

    // Support deep linking via global event
    useEffect(() => {
        const handler = (e: Event) => {
            const tab = (e as CustomEvent<{ tab?: string }>)?.detail?.tab;
            if (tab && TABS.some(t => t.id === tab)) {
                setActiveTab(tab as TabId);
            }
        };
        window.addEventListener('profile-tab', handler);
        return () => window.removeEventListener('profile-tab', handler);
    }, []);

    const initials = (profile?.full_name ?? 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    const currentTab = TABS.find(t => t.id === activeTab)!;

    return (
        <div>
            {/* Page Header */}
            <div className="mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[var(--color-behance-blue)] flex items-center justify-center text-white text-lg font-bold">
                        {initials}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold dash-text">My Profile</h1>
                        <p className="text-sm dash-text-secondary">Manage your account settings and preferences</p>
                    </div>
                </div>
            </div>

            {/* Mobile Tab Selector */}
            <div className="sm:hidden mb-4">
                <button
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="w-full flex items-center justify-between px-4 py-3 dash-card border dash-border rounded-lg text-sm font-medium dash-text"
                >
                    <div className="flex items-center gap-2">
                        <currentTab.icon className="w-4 h-4" />
                        {currentTab.label}
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${mobileOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                    {mobileOpen && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-1 dash-card border dash-border rounded-lg overflow-hidden shadow-lg"
                        >
                            {TABS.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => { setActiveTab(tab.id); setMobileOpen(false); }}
                                    className={`w-full flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === tab.id
                                        ? 'bg-[var(--color-behance-blue)]/5 text-[var(--color-behance-blue)]'
                                        : tab.danger ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]' : 'dash-text hover:dash-surface-alt'
                                        }`}
                                >
                                    <tab.icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Desktop Layout: Sidebar + Content */}
            <div className="flex gap-6">
                {/* Sidebar (desktop) */}
                <aside className="hidden sm:block w-56 shrink-0">
                    <nav className="dash-card rounded-xl border dash-border overflow-hidden sticky top-24">
                        {TABS.map(tab => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-l-3 ${isActive
                                        ? 'bg-[var(--color-behance-blue)]/5 text-[var(--color-behance-blue)] border-l-[var(--color-behance-blue)]'
                                        : tab.danger
                                            ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] border-l-transparent'
                                            : 'dash-text-secondary hover:dash-surface-alt border-l-transparent'
                                        }`}
                                >
                                    <tab.icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                {/* Content */}
                <main className="flex-1 min-w-0">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                        >
                            {activeTab === 'profile' && <MyProfileTab />}
                            {activeTab === 'security' && <SecurityTab />}
                            {activeTab === 'notifications' && <NotificationsTab />}
                            {activeTab === 'sessions' && <SessionsTab />}
                            {activeTab === 'data-privacy' && <DataPrivacyTab />}
                            {activeTab === 'support' && <SupportTab />}
                            {activeTab === 'danger-zone' && <DangerZoneTab />}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
}

