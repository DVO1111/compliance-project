import { CheckCircle, AlertTriangle, AlertCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { ComparisonMatrixResult } from '../../lib/complianceEngine';

interface ComparisonMatrixProps {
  matrix: ComparisonMatrixResult;
  onSelectJurisdiction: (jurisdiction: string) => void;
}

const RISK_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  low: { icon: CheckCircle, color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success-soft)]', label: 'PASS' },
  medium: { icon: AlertTriangle, color: 'text-[#F59E0B]', bg: 'bg-behance-amber-50', label: 'CAUTION' },
  high: { icon: AlertCircle, color: 'text-[var(--color-warning)]', bg: 'bg-[var(--color-warning-soft)]', label: 'HIGH RISK' },
  critical: { icon: XCircle, color: 'text-[var(--color-danger)]', bg: 'bg-[var(--color-danger-soft)]', label: 'CRITICAL' },
};

export default function ComparisonMatrix({ matrix, onSelectJurisdiction }: ComparisonMatrixProps) {
  const [expandedJurisdiction, setExpandedJurisdiction] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {matrix.summary.map((item) => {
          const config = RISK_CONFIG[item.risk] || RISK_CONFIG.low;
          const Icon = config.icon;

          return (
            <button
              key={item.jurisdiction}
              onClick={() => onSelectJurisdiction(item.jurisdiction)}
              className={`relative ${config.bg} rounded-xl border border-opacity-50 p-4 text-left transition-all hover:shadow-md hover:scale-[1.02] group`}
              style={{ borderColor: 'currentColor' }}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider dash-text-secondary">
                  {item.label.split('(')[1]?.replace(')', '') || item.label}
                </span>
                <Icon className={`w-5 h-5 ${config.color}`} />
              </div>
              <div className={`text-lg font-bold ${config.color} mb-1`}>
                {config.label}
              </div>
              <div className="flex items-center gap-3 text-xs dash-text-secondary">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-danger)]" />
                  {item.redCount}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-warning)]" />
                  {item.yellowCount}
                </span>
                <span className="dash-text-tertiary">|</span>
                <span>{item.issueCount} total</span>
              </div>
              <div className="absolute inset-0 rounded-xl border-2 border-transparent group-hover:border-[var(--color-behance-blue)] transition-colors" />
            </button>
          );
        })}
      </div>

      <div className="dash-card rounded-xl border dash-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="dash-surface-alt border-b dash-border">
                <th className="text-left px-4 py-3 font-semibold dash-text">Jurisdiction</th>
                <th className="text-center px-4 py-3 font-semibold dash-text">Risk Level</th>
                <th className="text-center px-4 py-3 font-semibold dash-text">Critical</th>
                <th className="text-center px-4 py-3 font-semibold dash-text">Warnings</th>
                <th className="text-center px-4 py-3 font-semibold dash-text">Total Issues</th>
                <th className="text-center px-4 py-3 font-semibold dash-text">Details</th>
              </tr>
            </thead>
            <tbody>
              {matrix.summary.map((item) => {
                const config = RISK_CONFIG[item.risk] || RISK_CONFIG.low;
                const Icon = config.icon;
                const isExpanded = expandedJurisdiction === item.jurisdiction;
                const details = matrix.jurisdictions[item.jurisdiction];

                return (
                  <>
                    <tr key={item.jurisdiction} className="border-b dash-border hover:dash-surface-alt transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium dash-text">{item.label}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${config.bg} ${config.color}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {config.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${item.redCount > 0 ? 'text-[var(--color-danger)]' : 'dash-text-tertiary'}`}>
                          {item.redCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${item.yellowCount > 0 ? 'text-[#F59E0B]' : 'dash-text-tertiary'}`}>
                          {item.yellowCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold dash-text">{item.issueCount}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setExpandedJurisdiction(isExpanded ? null : item.jurisdiction)}
                          className="inline-flex items-center gap-1 text-[var(--color-behance-blue)] hover:text-[#003d7a] text-xs font-medium"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {isExpanded ? 'Hide' : 'Show'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && details && (
                      <tr key={`${item.jurisdiction}-details`}>
                        <td colSpan={6} className="px-4 py-3 dash-surface-alt">
                          {details.issues.length === 0 ? (
                            <div className="text-center py-4 text-sm dash-text-secondary">
                              No issues found for this jurisdiction.
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {details.issues.map((issue, idx) => (
                                <div
                                  key={idx}
                                  className={`flex items-start gap-3 p-3 rounded-lg border-l-3 ${
                                    issue.severity === 'Red'
                                      ? 'bg-[var(--color-danger-soft)] border-l-[#D32F2F] border border-[var(--color-danger)]/20'
                                      : 'bg-behance-amber-50 border-l-[#F59E0B] border border-behance-amber-200'
                                  }`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        issue.severity === 'Red' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-behance-amber-100 text-behance-amber-800'
                                      }`}>
                                        {issue.severity}
                                      </span>
                                      {issue.category && (
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                          issue.category === 'professional_ethics_violation'
                                            ? 'bg-[var(--color-info-soft)] text-[var(--color-info)]'
                                            : issue.category === 'advertising_violation'
                                            ? 'bg-teal-100 text-teal-800'
                                            : 'dash-surface-alt dash-text'
                                        }`}>
                                          {issue.category === 'professional_ethics_violation'
                                            ? 'Ethics'
                                            : issue.category === 'advertising_violation'
                                            ? 'Advertising'
                                            : 'Product'}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm dash-text font-medium">{issue.issue}</p>
                                    <p className="text-xs dash-text-secondary mt-1 font-mono">{issue.regulation_cited}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

