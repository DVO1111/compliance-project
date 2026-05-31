import { LineChart, Scale } from "lucide-react";
import type { OnboardingData } from "./OnboardingWizard";

const ROLE_OPTIONS = [
  {
    id: "executive",
    label: "Company Admin / Executive",
    description: "I'm setting up our company workspace and need full visibility into compliance, risk, and team performance.",
    icon: LineChart,
  },
  {
    id: "legal_partner",
    label: "Legal Partner (External)",
    description: "I am an external reviewer or law firm providing services to companies.",
    icon: Scale,
  },
] as const;

export default function StepRoleAssignment({
  data,
  onUpdate,
}: {
  data: OnboardingData;
  onUpdate: (partial: Partial<OnboardingData>) => void;
}) {
  return (
    <div>
      <h2 className="text-white text-xl font-semibold mb-2">Your Role</h2>
      <p className="text-[var(--color-info)] mb-6">
        How do you primarily interact with compliance? This helps us surface the right tools for you.
      </p>

      <div className="space-y-3">
        {ROLE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = data.role === opt.id;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onUpdate({ role: opt.id })} // ✅ THIS is the important line
              className={`w-full text-left rounded-xl border p-5 transition-all ${selected
                  ? "border-[var(--color-success)] bg-[var(--color-success)]/10"
                  : "border-white/10 dash-card/5 hover:dash-card/10"
                }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-11 h-11 rounded-lg flex items-center justify-center ${selected ? "bg-[var(--color-success)] text-white" : "dash-card/10 text-white"
                    }`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex-1">
                  <div className="text-white font-semibold">{opt.label}</div>
                  <div className="text-[var(--color-info)] text-sm mt-1">{opt.description}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

