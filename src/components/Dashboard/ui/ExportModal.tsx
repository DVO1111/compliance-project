import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    FileText,
    FileDown,
    Calendar,
    Layers,
    Download,
    CheckCircle2,
} from "lucide-react";

type ExportFormat = "pdf" | "csv" | "excel";

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    role: string;
    selectedJurisdiction?: string;
}

const SECTIONS = [
    { id: "kpis", label: "Executive Summary (KPIs)" },
    { id: "compliance", label: "Compliance Matrix" },
    { id: "risk", label: "Risk Distribution / Trends" },
    { id: "activity", label: "Recent Activity Feed" },
    { id: "queue", label: "Legal / Review Queue" },
    { id: "deadlines", label: "Upcoming Deadlines" },
];

export default function ExportModal({
    isOpen,
    onClose,
    role,
    selectedJurisdiction,
}: ExportModalProps) {
    const [format, setFormat] = useState<ExportFormat>("pdf");
    const [dateRange, setDateRange] = useState({
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        end: new Date().toISOString().split("T")[0],
    });
    const [selectedSections, setSelectedSections] = useState<string[]>(
        SECTIONS.map((s) => s.id)
    );
    const [isExporting, setIsExporting] = useState(false);

    const toggleSection = (id: string) => {
        setSelectedSections((prev) =>
            prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
        );
    };

    const handleExport = async () => {
        setIsExporting(true);

        // Simulate some delay
        await new Promise((resolve) => setTimeout(resolve, 800));

        if (format === "pdf") {
            // Add a class to body to indicate which sections to print
            document.body.classList.add("printing-dashboard");
            selectedSections.forEach((id) => {
                document.body.classList.add(`print-section-${id}`);
            });

            window.print();

            // Clean up after print dialog
            document.body.classList.remove("printing-dashboard");
            SECTIONS.forEach((s) => {
                document.body.classList.remove(`print-section-${s.id}`);
            });
        } else if (format === "csv" || format === "excel") {
            // Basic CSV generation for demonstration
            const headers = ["Section", "Metric", "Value", "Date"];
            const rows = [
                ["Summary", "Total Submissions", "124", dateRange.end],
                ["Summary", "Compliance Rate", "98%", dateRange.end],
                ["Risk", "High Priority", "5", dateRange.end],
            ];

            const csvContent = [headers, ...rows]
                .map((row) => row.join(","))
                .join("\n");

            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `Criateur_Export_${format.toUpperCase()}_${new Date().toISOString().split("T")[0]}.${format === "excel" ? "xlsx" : "csv"}`);
            link.style.visibility = "hidden";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        setIsExporting(false);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Modal Container */}
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="w-full max-w-xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
                        >
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface-alt)]">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-dark,var(--color-accent))] flex items-center justify-center text-white shadow-lg">
                                        <FileDown className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold dash-text">Export Dashboard</h2>
                                        <p className="text-xs dash-text-secondary">Generate compliance reports & data</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                >
                                    <X className="w-5 h-5 dash-text-secondary" />
                                </button>
                            </div>

                            <div className="p-6 space-y-8 overflow-y-auto max-h-[70vh]">
                                {/* Format Selection */}
                                <section className="space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <FileText className="w-4 h-4 text-[var(--color-accent)]" />
                                        <h3 className="text-sm font-semibold dash-text">Select Format</h3>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {(["pdf", "csv", "excel"] as const).map((f) => (
                                            <button
                                                key={f}
                                                onClick={() => setFormat(f)}
                                                className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-200 ${format === f
                                                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5 text-[var(--color-accent)] shadow-[0_0_15px_rgba(var(--color-accent-rgb),0.1)]"
                                                        : "border-[var(--color-border)] hover:border-[var(--color-text-tertiary)] dash-text-secondary"
                                                    }`}
                                            >
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${format === f ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-surface-alt)]"
                                                    }`}>
                                                    {f === "pdf" ? <FileText className="w-5 h-5" /> : f === "csv" ? <Download className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
                                                </div>
                                                <span className="text-xs font-bold uppercase">{f === "excel" ? "Excel" : f.toUpperCase()}</span>
                                            </button>
                                        ))}
                                    </div>
                                </section>

                                {/* Date Range */}
                                <section className="space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Calendar className="w-4 h-4 text-[var(--color-accent)]" />
                                        <h3 className="text-sm font-semibold dash-text">Select Time Period</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] uppercase font-bold dash-text-tertiary ml-1">Start Date</label>
                                            <input
                                                type="date"
                                                value={dateRange.start}
                                                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] dash-text text-sm focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] outline-none transition-all"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] uppercase font-bold dash-text-tertiary ml-1">End Date</label>
                                            <input
                                                type="date"
                                                value={dateRange.end}
                                                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] dash-text text-sm focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                </section>

                                {/* Sections */}
                                <section className="space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Layers className="w-4 h-4 text-[var(--color-accent)]" />
                                        <h3 className="text-sm font-semibold dash-text">Included Sections</h3>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {SECTIONS.map((s) => (
                                            <button
                                                key={s.id}
                                                onClick={() => toggleSection(s.id)}
                                                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${selectedSections.includes(s.id)
                                                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5 text-[var(--color-accent)]"
                                                        : "border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] dash-text-secondary"
                                                    }`}
                                            >
                                                <span className="text-sm font-medium">{s.label}</span>
                                                {selectedSections.includes(s.id) && (
                                                    <CheckCircle2 className="w-4 h-4" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            </div>

                            {/* Footer */}
                            <div className="p-6 border-t border-[var(--color-border)] bg-[var(--color-surface-alt)]/50">
                                <button
                                    onClick={handleExport}
                                    disabled={isExporting || selectedSections.length === 0}
                                    className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-white shadow-xl shadow-[var(--color-accent)]/20 hover:shadow-[var(--color-accent)]/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                                    style={{
                                        background: "linear-gradient(135deg, var(--color-accent), var(--color-accent-dark, var(--color-accent)))",
                                    }}
                                >
                                    {isExporting ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Download className="w-5 h-5" />
                                            <span>Generate {format.toUpperCase()} Export</span>
                                        </>
                                    )}
                                </button>
                                <div className="mt-4 flex items-center justify-center gap-6">
                                    <div className="flex items-center gap-1.5 grayscale opacity-60">
                                        <span className="text-[10px] font-bold dash-text-secondary uppercase tracking-widest">Criateur Compliance Engine</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
