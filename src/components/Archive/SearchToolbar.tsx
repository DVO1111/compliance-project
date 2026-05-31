import { Search, Filter, LayoutList, LayoutGrid } from 'lucide-react';

interface SearchToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  platformFilter: string;
  onPlatformFilterChange: (value: string) => void;
  tagFilter: string;
  onTagFilterChange: (value: string) => void;
  allTags: string[];
  viewMode: 'list' | 'grid';
  onViewModeChange: (mode: 'list' | 'grid') => void;
  signoffFilter: string;
  onSignoffFilterChange: (value: string) => void;
}

export default function SearchToolbar({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  platformFilter,
  onPlatformFilterChange,
  tagFilter,
  onTagFilterChange,
  allTags,
  viewMode,
  onViewModeChange,
  signoffFilter,
  onSignoffFilterChange,
}: SearchToolbarProps) {
  return (
    <div className="dash-card rounded-xl shadow-sm border dash-border/60 p-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
          <input
            type="text"
            placeholder="Search by title, tag, or flagged content..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border dash-border rounded-lg
              focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)] transition-all"
          />
        </div>

        <div className="flex items-center dash-surface-alt rounded-lg p-0.5">
          <button
            onClick={() => onViewModeChange('list')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'list' ? 'dash-card shadow-sm text-[var(--color-behance-blue)]' : 'dash-text-secondary hover:dash-text'
            }`}
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'grid' ? 'dash-card shadow-sm text-[var(--color-behance-blue)]' : 'dash-text-secondary hover:dash-text'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 dash-text-tertiary" />
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="pl-8 pr-8 py-1.5 text-xs border dash-border rounded-lg
              focus:ring-1 focus:ring-[var(--color-behance-blue)] focus:border-[var(--color-behance-blue)] appearance-none dash-card"
          >
            <option value="all">All Risk</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="flagged">Flagged</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <select
          value={signoffFilter}
          onChange={(e) => onSignoffFilterChange(e.target.value)}
          className="px-3 py-1.5 text-xs border dash-border rounded-lg
            focus:ring-1 focus:ring-[var(--color-behance-blue)] focus:border-[var(--color-behance-blue)] appearance-none dash-card"
        >
          <option value="all">All Workflow</option>
          <option value="draft">Draft</option>
          <option value="analyzed">Analyzed</option>
          <option value="awaiting_legal">Awaiting Legal</option>
          <option value="signed_off">Signed Off</option>
        </select>

        <select
          value={platformFilter}
          onChange={(e) => onPlatformFilterChange(e.target.value)}
          className="px-3 py-1.5 text-xs border dash-border rounded-lg
            focus:ring-1 focus:ring-[var(--color-behance-blue)] focus:border-[var(--color-behance-blue)] appearance-none dash-card"
        >
          <option value="all">All Platforms</option>
          <option value="instagram">Instagram</option>
          <option value="x">X (Twitter)</option>
          <option value="website">Website</option>
          <option value="linkedin">LinkedIn</option>
          <option value="print">Print</option>
          <option value="radio">Radio</option>
        </select>

        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => onTagFilterChange(e.target.value)}
            className="px-3 py-1.5 text-xs border dash-border rounded-lg
              focus:ring-1 focus:ring-[var(--color-behance-blue)] focus:border-[var(--color-behance-blue)] appearance-none dash-card"
          >
            <option value="all">All Tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

