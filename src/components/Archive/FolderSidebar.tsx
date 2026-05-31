import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  Folder, FolderPlus, FileText, ChevronRight, ChevronDown,
  Trash2, Pencil, Check, X, Plus,
} from 'lucide-react';
import type { FolderWithContent } from '../../hooks/useArchiveData';

interface FolderSidebarProps {
  folders: FolderWithContent[];
  selectedFolder: string;
  onSelectFolder: (id: string) => void;
  rootCount: number;
  onCreateFolder: (name: string, parentId: string | null) => Promise<unknown>;
  onRenameFolder: (id: string, name: string) => Promise<unknown>;
  onDeleteFolder: (id: string) => Promise<unknown>;
}

function DroppableFolder({
  folder,
  selectedFolder,
  onSelectFolder,
  expandedFolders,
  toggleExpand,
  editingId,
  setEditingId,
  editName,
  setEditName,
  onRename,
  onDelete,
  depth,
}: {
  folder: FolderWithContent;
  selectedFolder: string;
  onSelectFolder: (id: string) => void;
  expandedFolders: Set<string>;
  toggleExpand: (id: string) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editName: string;
  setEditName: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  depth: number;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `folder-${folder.id}` });
  const hasChildren = folder.children && folder.children.length > 0;
  const isExpanded = expandedFolders.has(folder.id);
  const isSelected = selectedFolder === folder.id;
  const isEditing = editingId === folder.id;

  return (
    <div ref={setNodeRef}>
      <div
        className={`group flex items-center gap-1 rounded-lg transition-all duration-150 cursor-pointer
          ${isSelected ? 'bg-[var(--color-behance-blue)]/10 text-[var(--color-behance-blue)]' : 'dash-text hover:dash-surface-alt'}
          ${isOver ? 'ring-2 ring-[var(--color-behance-blue)] bg-[var(--color-info-soft)]' : ''}
        `}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          <button onClick={() => toggleExpand(folder.id)} className="p-1 shrink-0">
            {isExpanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-5.5 shrink-0" />
        )}

        <button
          onClick={() => onSelectFolder(folder.id)}
          className="flex-1 flex items-center gap-2 py-2 pr-2 min-w-0"
        >
          <Folder className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[var(--color-behance-blue)]' : 'dash-text-tertiary'}`} />
          {isEditing ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="flex-1 text-sm dash-card border border-[var(--color-border)] rounded px-1.5 py-0.5 focus:ring-1 focus:ring-[var(--color-behance-blue)]"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRename(folder.id, editName);
                if (e.key === 'Escape') setEditingId(null);
              }}
              autoFocus
            />
          ) : (
            <span className="text-sm truncate">{folder.name}</span>
          )}
          <span className="ml-auto text-[10px] dash-text-tertiary tabular-nums shrink-0">
            {folder.content_count}
          </span>
        </button>

        {isEditing ? (
          <div className="flex items-center gap-0.5 pr-1">
            <button onClick={() => onRename(folder.id, editName)} className="p-1 text-[var(--color-success)] hover:bg-[var(--color-success-soft)] rounded">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setEditingId(null)} className="p-1 dash-text-tertiary hover:dash-surface-alt rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); setEditingId(folder.id); setEditName(folder.name); }}
              className="p-1 dash-text-tertiary hover:text-[var(--color-behance-blue)] hover:bg-[var(--color-info-soft)] rounded"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
              className="p-1 dash-text-tertiary hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] rounded"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {folder.children!.map((child) => (
            <DroppableFolder
              key={child.id}
              folder={child}
              selectedFolder={selectedFolder}
              onSelectFolder={onSelectFolder}
              expandedFolders={expandedFolders}
              toggleExpand={toggleExpand}
              editingId={editingId}
              setEditingId={setEditingId}
              editName={editName}
              setEditName={setEditName}
              onRename={onRename}
              onDelete={onDelete}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FolderSidebar({
  folders,
  selectedFolder,
  onSelectFolder,
  rootCount,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: FolderSidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { isOver: isOverRoot, setNodeRef: setRootRef } = useDroppable({ id: 'folder-root' });

  const toggleExpand = (id: string) => {
    const next = new Set(expandedFolders);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedFolders(next);
  };

  const handleRename = async (id: string, name: string) => {
    if (name.trim()) {
      await onRenameFolder(id, name);
    }
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
  };

  const confirmDelete = async () => {
    if (deletingId) {
      await onDeleteFolder(deletingId);
      setDeletingId(null);
    }
  };

  const handleCreate = async () => {
    if (newFolderName.trim()) {
      const parentId = selectedFolder !== 'all' ? selectedFolder : null;
      await onCreateFolder(newFolderName, parentId);
      setNewFolderName('');
      setShowNewFolder(false);
    }
  };

  return (
    <>
      <div className="dash-card rounded-xl shadow-sm border dash-border/60 p-3 h-fit">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold dash-text-secondary uppercase tracking-wider">Folders</h3>
          <button
            onClick={() => setShowNewFolder(!showNewFolder)}
            className="p-1 dash-text-tertiary hover:text-[var(--color-behance-blue)] hover:bg-[var(--color-info-soft)] rounded transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>

        {showNewFolder && (
          <div className="mb-3 flex items-center gap-1.5">
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name..."
              className="flex-1 text-sm border border-[var(--color-border)] rounded-md px-2 py-1.5
                focus:ring-1 focus:ring-[var(--color-behance-blue)] focus:border-[var(--color-behance-blue)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
              }}
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={!newFolderName.trim()}
              className="p-1.5 bg-[var(--color-behance-blue)] text-white rounded-md hover:bg-[var(--color-accent-hover)] disabled:opacity-40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="space-y-0.5">
          <div ref={setRootRef}>
            <button
              onClick={() => onSelectFolder('all')}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-all text-sm
                ${selectedFolder === 'all' ? 'bg-[var(--color-behance-blue)]/10 text-[var(--color-behance-blue)] font-medium' : 'dash-text hover:dash-surface-alt'}
                ${isOverRoot ? 'ring-2 ring-[var(--color-behance-blue)] bg-[var(--color-info-soft)]' : ''}
              `}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>All Content</span>
              <span className="ml-auto text-[10px] dash-text-tertiary tabular-nums">{rootCount}</span>
            </button>
          </div>

          {folders.map((folder) => (
            <DroppableFolder
              key={folder.id}
              folder={folder}
              selectedFolder={selectedFolder}
              onSelectFolder={onSelectFolder}
              expandedFolders={expandedFolders}
              toggleExpand={toggleExpand}
              editingId={editingId}
              setEditingId={setEditingId}
              editName={editName}
              setEditName={setEditName}
              onRename={handleRename}
              onDelete={handleDelete}
              depth={0}
            />
          ))}
        </div>
      </div>

      {deletingId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="dash-card rounded-xl max-w-sm w-full shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold dash-text mb-2">Delete folder?</h3>
              <p className="text-sm dash-text-secondary">
                Documents inside will be moved to "All Content." Sub-folders will become root folders.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 px-4 py-2 text-sm dash-text border border-[var(--color-border)] rounded-lg hover:dash-surface-alt transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 text-sm bg-[var(--color-danger)] text-white rounded-lg hover:opacity-90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

