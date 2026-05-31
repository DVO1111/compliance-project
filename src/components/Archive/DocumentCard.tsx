import { useDraggable } from '@dnd-kit/core';
import {
  FileText, Calendar, GripVertical, Download, Lock,
  AlertCircle, CheckCircle, AlertTriangle, Tag,
} from 'lucide-react';
import SignoffBadge from './SignoffBadge';
import type { ContentWithReport } from '../../hooks/useArchiveData';
import { exportToPDF } from '../../lib/pdfExport';

interface DocumentCardProps {
  item: ContentWithReport;
  viewMode: 'list' | 'grid';
  onClick: () => void;
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

function getRiskIcon(status: string) {
  switch (status) {
    case 'approved':
      return <CheckCircle className="w-4 h-4 text-[var(--color-success)]" />;
    case 'flagged':
      return <AlertTriangle className="w-4 h-4 text-behance-amber-500" />;
    case 'critical':
      return <AlertCircle className="w-4 h-4 text-[var(--color-danger)]" />;
    default:
      return <FileText className="w-4 h-4 dash-text-tertiary" />;
  }
}

function getRiskBadgeClasses(status: string) {
  switch (status) {
    case 'approved': return 'bg-[var(--color-success-soft)] text-[var(--color-success)]';
    case 'flagged': return 'bg-behance-amber-50 text-behance-amber-700';
    case 'critical': return 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]';
    default: return 'dash-surface-alt dash-text-secondary';
  }
}

export default function DocumentCard({ item, viewMode, onClick, selectMode, isSelected, onToggleSelect }: DocumentCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `doc-${item.id}`,
    data: { contentId: item.id },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : undefined;

  const handleExport = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.report) exportToPDF(item, item.report);
  };

  const handleClick = () => {
    if (selectMode && onToggleSelect) {
      onToggleSelect(item.id);
    } else {
      onClick();
    }
  };

  const handleCheckbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.(item.id);
  };

  if (viewMode === 'grid') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`group dash-card rounded-xl border hover:shadow-md transition-all duration-200 cursor-pointer relative
          ${isDragging ? 'opacity-50 shadow-lg' : ''}
          ${item.is_locked ? 'ring-1 ring-amber-200' : ''}
          ${isSelected ? 'border-[var(--color-behance-blue)] ring-2 ring-[var(--color-behance-blue)]/20 bg-[var(--color-info-soft)]/30' : 'dash-border/60 hover:border-[var(--color-behance-blue)]/30'}
        `}
        onClick={handleClick}
      >
        <div
          {...listeners}
          {...attributes}
          className="absolute top-2 left-2 p-1 dash-text-tertiary hover:dash-text-secondary cursor-grab active:cursor-grabbing
            opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </div>

        <div className="p-4 pt-5">
          {selectMode && (
            <div className="absolute top-2 right-2 z-10" onClick={handleCheckbox}>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-[var(--color-behance-blue)] border-[var(--color-behance-blue)]' : 'border-[var(--color-border)] dash-card hover:border-[var(--color-behance-blue)]'
                }`}>
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
          )}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              {getRiskIcon(item.status || '')}
              <h3 className="font-semibold text-sm dash-text line-clamp-1">{item.title}</h3>
            </div>
            {item.is_locked && <Lock className="w-3.5 h-3.5 text-behance-amber-500 shrink-0" />}
          </div>

          <p className="text-xs dash-text-secondary line-clamp-2 mb-3 leading-relaxed">
            {item.content_text.slice(0, 120)}...
          </p>

          <div className="flex flex-wrap gap-1 mb-3">
            {item.tags?.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium
                  ${tag.tag_type === 'campaign' ? 'bg-[var(--color-info-soft)] text-[var(--color-info)]' : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'}
                `}
              >
                <Tag className="w-2.5 h-2.5" />
                {tag.tag_name}
              </span>
            ))}
            {(item.tags?.length || 0) > 3 && (
              <span className="text-[10px] dash-text-tertiary">+{(item.tags?.length || 0) - 3}</span>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t dash-border">
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getRiskBadgeClasses(item.status || '')}`}>
                {item.status}
              </span>
              <SignoffBadge status={item.signoff_status || ''} />
            </div>
            <div className="flex items-center gap-1 text-[10px] dash-text-tertiary">
              <Calendar className="w-3 h-3" />
              {new Date(item.created_at || '').toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 px-4 py-3 hover:dash-surface-alt/80 transition-all
        duration-150 cursor-pointer border-b dash-border last:border-b-0
        ${isDragging ? 'opacity-50 bg-[var(--color-info-soft)]' : ''}
        ${item.is_locked ? 'bg-behance-amber-50/30' : ''}
        ${isSelected ? 'bg-[var(--color-info-soft)]/40 border-l-2 border-l-[var(--color-behance-blue)]' : ''}
      `}
      onClick={handleClick}
    >
      {selectMode && (
        <div className="shrink-0" onClick={handleCheckbox}>
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-[var(--color-behance-blue)] border-[var(--color-behance-blue)]' : 'border-[var(--color-border)] dash-card hover:border-[var(--color-behance-blue)]'
            }`}>
            {isSelected && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      )}
      <div
        {...listeners}
        {...attributes}
        className="dash-text-tertiary hover:dash-text-secondary cursor-grab active:cursor-grabbing
          opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4" />
      </div>

      <div className="shrink-0">{getRiskIcon(item.status || '')}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className="font-medium text-sm dash-text truncate">{item.title}</h3>
          {item.is_locked && <Lock className="w-3 h-3 text-behance-amber-500 shrink-0" />}
        </div>
        <div className="flex items-center gap-2 text-xs dash-text-secondary">
          <span>{item.platform}</span>
          <span className="dash-text-tertiary">|</span>
          <span>{item.content_topic}</span>
          {item.tags && item.tags.length > 0 && (
            <>
              <span className="dash-text-tertiary">|</span>
              {item.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag.id}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-medium
                    ${tag.tag_type === 'campaign' ? 'bg-[var(--color-info-soft)] text-[var(--color-info)]' : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'}
                  `}
                >
                  {tag.tag_name}
                </span>
              ))}
              {item.tags.length > 2 && (
                <span className="text-[10px] dash-text-tertiary">+{item.tags.length - 2}</span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${getRiskBadgeClasses(item.status || '')}`}>
          {item.status}
        </span>
        <SignoffBadge status={item.signoff_status || ''} />
      </div>

      <div className="flex items-center gap-1 text-xs dash-text-tertiary shrink-0">
        <Calendar className="w-3.5 h-3.5" />
        {new Date(item.created_at || '').toLocaleDateString()}
      </div>

      <div className="shrink-0">
        {item.report && (
          <button
            onClick={handleExport}
            className="p-1.5 dash-text-tertiary hover:text-[var(--color-behance-blue)] hover:bg-[var(--color-info-soft)] rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

