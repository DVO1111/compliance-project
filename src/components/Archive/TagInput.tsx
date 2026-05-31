import { useState } from 'react';
import { X, Plus, Tag } from 'lucide-react';
import type { Database } from '../../lib/database.types';

type DocumentTag = Database['public']['Tables']['document_tags']['Row'];

interface TagInputProps {
  tags: DocumentTag[];
  onAdd: (name: string, type: 'campaign' | 'client') => Promise<void>;
  onRemove: (tagId: string) => Promise<void>;
  disabled?: boolean;
}

export default function TagInput({ tags, onAdd, onRemove, disabled }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [tagType, setTagType] = useState<'campaign' | 'client'>('campaign');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!inputValue.trim()) return;
    await onAdd(inputValue.trim(), tagType);
    setInputValue('');
    setIsAdding(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              tag.tag_type === 'campaign'
                ? 'bg-[var(--color-info-soft)] text-teal-700 ring-1 ring-inset ring-teal-600/20'
                : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)] ring-1 ring-inset ring-orange-600/20'
            }`}
          >
            <Tag className="w-3 h-3" />
            {tag.tag_name}
            {!disabled && (
              <button
                onClick={() => onRemove(tag.id)}
                className="ml-0.5 hover:opacity-70 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}

        {!disabled && !isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium
              dash-surface-alt dash-text-secondary ring-1 ring-inset ring-[var(--color-border)] hover:dash-surface-alt transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add tag
          </button>
        )}
      </div>

      {isAdding && (
        <div className="flex items-center gap-2">
          <select
            value={tagType}
            onChange={(e) => setTagType(e.target.value as 'campaign' | 'client')}
            className="text-xs border border-[var(--color-border)] rounded-md px-2 py-1.5 focus:ring-1 focus:ring-[var(--color-behance-blue)] focus:border-[var(--color-behance-blue)]"
          >
            <option value="campaign">Campaign</option>
            <option value="client">Client</option>
          </select>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Tag name..."
            className="flex-1 text-xs border border-[var(--color-border)] rounded-md px-2 py-1.5 focus:ring-1 focus:ring-[var(--color-behance-blue)] focus:border-[var(--color-behance-blue)]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') setIsAdding(false);
            }}
            autoFocus
          />
          <button
            onClick={handleAdd}
            disabled={!inputValue.trim()}
            className="text-xs bg-[var(--color-behance-blue)] text-white px-3 py-1.5 rounded-md hover:bg-[var(--color-accent-hover)] disabled:opacity-40 transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => { setIsAdding(false); setInputValue(''); }}
            className="text-xs dash-text-secondary hover:dash-text px-2 py-1.5"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

