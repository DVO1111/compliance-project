import { useState } from "react";
import { X, Globe, DollarSign, Send, ShieldCheck } from "lucide-react";
import { LegalPartnerProfile, sendConnectionRequest } from "../../lib/legalMarketplaceService";
import { logger } from '../../lib/logger';

interface PartnerDetailsModalProps {
    partner: LegalPartnerProfile;
    companyId: string;
    onClose: () => void;
}

export default function PartnerDetailsModal({ partner, companyId, onClose }: PartnerDetailsModalProps) {
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    async function handleSendRequest() {
        if (!message.trim()) return;
        try {
            setSending(true);
            await sendConnectionRequest(partner.id, companyId, message);
            setSent(true);
        } catch (err) {
            logger.error("Failed to send request:", err);
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200" style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)' }}>
                <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full transition-colors z-10 hover:bg-[var(--color-hover-bg)]" style={{ background: 'var(--color-surface-alt)' }}>
                    <X className="w-5 h-5 dash-text" />
                </button>

                <div className="flex flex-col md:flex-row">
                    {/* Sidebar / Profile Info */}
                    <div className="w-full md:w-64 p-8 flex flex-col items-center" style={{ background: 'var(--color-surface-alt)', borderRight: '1px solid var(--color-border)' }}>
                        <div className="w-32 h-32 rounded-3xl overflow-hidden mb-6 shadow-xl border-4 border-[var(--color-success)]/20">
                            <img src={partner.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(partner.full_name || "")}&background=random`} className="w-full h-full object-cover" alt={partner.full_name} />
                        </div>
                        <h2 className="text-xl font-bold dash-text text-center mb-1">{partner.full_name}</h2>
                        {partner.firm_name && <p className="dash-text-secondary text-sm mb-4 text-center">{partner.firm_name}</p>}

                        <div className="w-full space-y-3 mt-6">
                            <div className="flex items-center gap-3 dash-text-secondary text-sm">
                                <Globe className="w-4 h-4" /> {partner.jurisdictions.join(", ")}
                            </div>
                            <div className="flex items-center gap-3 dash-text-secondary text-sm">
                                <ShieldCheck className="w-4 h-4 text-[var(--color-success)]" /> Verified Partner
                            </div>
                            <div className="flex items-center gap-3 dash-text-secondary text-sm">
                                <DollarSign className="w-4 h-4" /> ${partner.hourly_rate}/hr
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 p-8">
                        <div className="mb-8">
                            <h3 className="text-xs font-bold dash-text-tertiary uppercase tracking-widest mb-3">About</h3>
                            <p className="dash-text-secondary leading-relaxed italic">{partner.bio || "No bio provided."}</p>
                        </div>

                        <div className="mb-8">
                            <h3 className="text-xs font-bold dash-text-tertiary uppercase tracking-widest mb-3">Expertise</h3>
                            <div className="flex flex-wrap gap-2">
                                {partner.specialties.map(s => (
                                    <span key={s} className="bg-[var(--color-success)]/10 text-[var(--color-success)] px-3 py-1 rounded-full text-xs font-bold border border-[var(--color-success)]/20">
                                        {s}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {!sent ? (
                            <div className="space-y-4 pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
                                <h3 className="text-sm font-bold dash-text">Send Collaboration Request</h3>
                                <textarea
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder="Tell the partner about your project or firm needs..."
                                    rows={4}
                                    className="w-full rounded-2xl p-4 dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-success)] resize-none text-sm"
                                    style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}
                                />
                                <button
                                    onClick={handleSendRequest}
                                    disabled={sending || !message.trim()}
                                    className="w-full btn-primary py-4 rounded-2xl flex items-center justify-center gap-2 font-bold disabled:opacity-50 transition-all hover:scale-[1.02]"
                                >
                                    {sending ? "Sending..." : "Request Connection"}
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-2xl p-6 text-center animate-in zoom-in duration-300 pt-6">
                                <div className="w-12 h-12 bg-[var(--color-success)] rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Send className="w-6 h-6 text-white" />
                                </div>
                                <h3 className="text-lg font-bold dash-text mb-1">Request Sent!</h3>
                                <p className="text-[var(--color-success)] text-sm mb-4">We've notified {partner.full_name}. You'll receive a notification when they respond.</p>
                                <button onClick={onClose} className="dash-text-secondary underline text-sm hover:text-[var(--color-success)] transition-colors">Close</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
