import { ChevronRight, Home } from 'lucide-react';
import type { FolderWithContent } from '../../hooks/useArchiveData';

interface FolderBreadcrumbProps {
  selectedFolder: string;
  folders: FolderWithContent[];
  onNavigate: (folderId: string) => void;
}

function flattenFolders(folders: FolderWithContent[]): FolderWithContent[] {
  const result: FolderWithContent[] = [];
  const traverse = (list: FolderWithContent[]) => {
    list.forEach((f) => {
      result.push(f);
      if (f.children) traverse(f.children);
    });
  };
  traverse(folders);
  return result;
}

function buildPath(folderId: string, flatList: FolderWithContent[]): FolderWithContent[] {
  const path: FolderWithContent[] = [];
  let current = flatList.find((f) => f.id === folderId);
  while (current) {
    path.unshift(current);
    current = current.parent_folder_id
      ? flatList.find((f) => f.id === current!.parent_folder_id)
      : undefined;
  }
  return path;
}

export default function FolderBreadcrumb({ selectedFolder, folders, onNavigate }: FolderBreadcrumbProps) {
  if (selectedFolder === 'all') return null;

  const flat = flattenFolders(folders);
  const path = buildPath(selectedFolder, flat);

  if (path.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-sm dash-text-secondary mb-4">
      <button
        onClick={() => onNavigate('all')}
        className="flex items-center gap-1 hover:text-[var(--color-behance-blue)] transition-colors"
      >
        <Home className="w-3.5 h-3.5" />
        <span>All Content</span>
      </button>
      {path.map((folder) => (
        <span key={folder.id} className="flex items-center gap-1">
          <ChevronRight className="w-3.5 h-3.5 dash-text-tertiary" />
          <button
            onClick={() => onNavigate(folder.id)}
            className={`hover:text-[var(--color-behance-blue)] transition-colors ${
              folder.id === selectedFolder ? 'dash-text font-medium' : ''
            }`}
          >
            {folder.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

