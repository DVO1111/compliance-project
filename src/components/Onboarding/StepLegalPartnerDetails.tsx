import { Globe, BookOpen, DollarSign, FileText } from "lucide-react";
import type { OnboardingData } from "./OnboardingWizard";

const JURISDICTIONS = ["Global", "USA", "UK", "EU", "Nigeria", "South Africa", "Canada"];
const SPECIALTIES = ["Advertising", "Pharma", "Medical Devices", "Financial Services", "Data Privacy", "Labor Law"];

export default function StepLegalPartnerDetails({
    data,
    onUpdate,
}: {
    data: OnboardingData;
    onUpdate: (partial: Partial<OnboardingData>) => void;
}) {
    const toggleJurisdiction = (j: string) => {
        const next = data.jurisdictions.includes(j)
            ? data.jurisdictions.filter(x => x !== j)
            : [...data.jurisdictions, j];
        onUpdate({ jurisdictions: next });
    };

    const toggleSpecialty = (s: string) => {
        const next = data.specialties.includes(s)
            ? data.specialties.filter(x => x !== s)
            : [...data.specialties, s];
        onUpdate({ specialties: next });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-white text-xl font-semibold mb-2">Professional Details</h2>
                <p className="text-[var(--color-info)] mb-6">
                    Tell us about your legal expertise so companies can find the right match.
                </p>
            </div>

            <div className="space-y-4">
                {/* Partner Type */}
                <div className="flex gap-4">
                    <button
                        type="button"
                        onClick={() => onUpdate({ partnerType: 'individual' })}
                        className={`flex-1 p-4 rounded-xl border transition-all ${data.partnerType === 'individual' ? "border-[var(--color-success)] bg-white/5" : "border-white/10"
                            }`}
                    >
                        <div className="text-white font-semibold">Individual</div>
                        <div className="text-xs text-[var(--color-info)]">Freelance Legal Counsel</div>
                    </button>
                    <button
                        type="button"
                        onClick={() => onUpdate({ partnerType: 'firm' })}
                        className={`flex-1 p-4 rounded-xl border transition-all ${data.partnerType === 'firm' ? "border-[var(--color-success)] bg-white/5" : "border-white/10"
                            }`}
                    >
                        <div className="text-white font-semibold">Law Firm</div>
                        <div className="text-xs text-[var(--color-info)]">Regulated Legal Entity</div>
                    </button>
                </div>

                {data.partnerType === 'firm' && (
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-white uppercase tracking-wider">Firm Name</label>
                        <input
                            type="text"
                            value={data.firmName}
                            onChange={e => onUpdate({ firmName: e.target.value })}
                            placeholder="e.g. Smith & Associates"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-success)]"
                        />
                    </div>
                )}

                {/* Jurisdictions */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                        <Globe className="w-3 h-3" /> Jurisdictions
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {JURISDICTIONS.map(j => (
                            <button
                                key={j}
                                type="button"
                                onClick={() => toggleJurisdiction(j)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${data.jurisdictions.includes(j) ? 'bg-[var(--color-success)] text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                                    }`}
                            >
                                {j}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Specialties */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                        <BookOpen className="w-3 h-3" /> Specialties
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {SPECIALTIES.map(s => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => toggleSpecialty(s)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${data.specialties.includes(s) ? 'bg-[var(--color-success)] text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                                    }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Hourly Rate */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                        <DollarSign className="w-3 h-3" /> Hourly Rate (USD)
                    </label>
                    <input
                        type="number"
                        value={data.hourlyRate || ''}
                        onChange={e => onUpdate({ hourlyRate: parseInt(e.target.value) || 0 })}
                        placeholder="e.g. 150"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-success)]"
                    />
                </div>

                {/* Bio */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                        <FileText className="w-3 h-3" /> Short Bio
                    </label>
                    <textarea
                        value={data.bio}
                        onChange={e => onUpdate({ bio: e.target.value })}
                        placeholder="Tell us about your experience..."
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-success)] resize-none"
                    />
                </div>
            </div>
        </div>
    );
}
