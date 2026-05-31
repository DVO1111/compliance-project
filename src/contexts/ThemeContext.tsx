import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "dark-blue";

interface ThemeContextType {
    theme: ThemeMode;
    setTheme: (t: ThemeMode) => void;
    cycle: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "fola-dashboard-theme";
const THEME_ORDER: ThemeMode[] = ["light", "dark", "dark-blue"];

function getInitial(): ThemeMode {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && THEME_ORDER.includes(stored as ThemeMode)) return stored as ThemeMode;
    } catch { /* SSR or blocked storage */ }
    return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemeMode>(getInitial);

    const apply = (t: ThemeMode) => {
        document.documentElement.setAttribute("data-theme", t);
        if (t === "dark" || t === "dark-blue") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
        try { localStorage.setItem(STORAGE_KEY, t); } catch { /* noop */ }
    };

    useEffect(() => { apply(theme); }, [theme]);

    const setTheme = (t: ThemeMode) => { setThemeState(t); };

    const cycle = () => {
        setThemeState((prev) => {
            const idx = THEME_ORDER.indexOf(prev);
            return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
        });
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, cycle }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
    return ctx;
}
