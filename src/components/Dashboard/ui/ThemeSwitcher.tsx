import { Sun, Moon, Compass } from "lucide-react";
import { useTheme, type ThemeMode } from "../../../contexts/ThemeContext";

const MODES: { key: ThemeMode; icon: typeof Sun; label: string }[] = [
    { key: "light", icon: Sun, label: "Light" },
    { key: "dark", icon: Moon, label: "Dark" },
    { key: "dark-blue", icon: Compass, label: "Navy" },
];

export default function ThemeSwitcher() {
    const { theme, setTheme } = useTheme();

    return (
        <div
            className="inline-flex rounded-lg p-0.5"
            style={{ background: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
            role="radiogroup"
            aria-label="Theme selector"
        >
            {MODES.map(({ key, icon: Icon, label }) => {
                const active = theme === key;
                return (
                    <button
                        key={key}
                        role="radio"
                        aria-checked={active}
                        aria-label={label}
                        title={label}
                        onClick={() => setTheme(key)}
                        className={`relative px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all duration-200 ${active
                                ? "dash-surface dash-text shadow-sm"
                                : "dash-text-secondary hover:dash-text"
                            }`}
                        style={active ? { background: "var(--color-surface)", boxShadow: "var(--color-card-shadow)" } : {}}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
