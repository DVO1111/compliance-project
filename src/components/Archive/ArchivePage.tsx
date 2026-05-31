import { useState, useMemo, useCallback, useEffect } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { FileText, CheckSquare, Square, Download, X, Loader2 } from 'lucide-react';
import { SkeletonLine, SkeletonCard } from '../Dashboard/ui/Skeleton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { recordAuditEvent } from '../../lib/auditService';
import { useArchiveData } from '../../hooks/useArchiveData';
import type { ContentWithReport, FolderWithContent } from '../../hooks/useArchiveData';
import { generateAuditZip } from '../../lib/auditExportService';
import FolderSidebar from './FolderSidebar';
import FolderBreadcrumb from './FolderBreadcrumb';
import SearchToolbar from './SearchToolbar';
import DocumentCard from './DocumentCard';
import DocumentDetailModal from './DocumentDetailModal';
import PasswordPromptModal from '../Common/PasswordPromptModal';
import { secureDeleteContent } from '../../lib/secureDeletionService';
import { logger } from '../../lib/logger';

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

const OPEN_KEY = 'cc_open_content_id';
const CORRECTION_OPEN_KEY = 'cc_open_correction_content_id';

export default function ArchivePage() {
  const { user, profile } = useAuth();
  const companyId = (profile as any)?.company_id as string | undefined;

  const {
    content,
    folders,
    allTags,
    loading,
    createFolder,
    renameFolder,
    deleteFolder,
    moveToFolder,
    addTag,
    removeTag,
    requestLegalSignoff,
  } = useArchiveData();

  const [localContent, setLocalContent] = useState<ContentWithReport[]>([]);
  useEffect(() => {
    setLocalContent(content || []);
  }, [content]);

  const [selectedFolder, setSelectedFolder] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [signoffFilter, setSignoffFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    return (localStorage.getItem('archive-view') as 'list' | 'grid') || 'list';
  });
  const [selectedContent, setSelectedContent] = useState<ContentWithReport | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // ── Multi-Select state ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // ── Secure Deletion state ──
  const [deleteTargetId, setDeleteTargetId] = useState<string | string[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSecureDelete = async (password: string) => {
    if (!deleteTargetId || !user || !companyId) return;
    setIsDeleting(true);
    try {
      const ids = Array.isArray(deleteTargetId) ? deleteTargetId : [deleteTargetId];

      for (const id of ids) {
        const res = await secureDeleteContent(id, password, companyId, user.id);
        if (!res.success) {
          throw new Error(res.error || 'Failed to delete content');
        }
      }

      // Update local state
      setLocalContent(prev => prev.filter(c => !ids.includes(c.id)));
      if (!Array.isArray(deleteTargetId) && selectedContent?.id === deleteTargetId) {
        setSelectedContent(null);
      }
      if (Array.isArray(deleteTargetId)) {
        setSelectMode(false);
        setSelectedIds(new Set());
      }
      setDeleteTargetId(null);
    } catch (err: any) {
      alert(`Deletion failed: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('archive-view', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!selectedContent) return;
    const fresh = localContent.find((c) => c.id === selectedContent.id);
    if (fresh) setSelectedContent(fresh);
  }, [localContent, selectedContent]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const flatFolders = useMemo(() => flattenFolders(folders), [folders]);

  // ✅ NEW: Realtime sync so Marketing sees "in_review" instantly
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`archive-content:${companyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'content_submissions', filter: `company_id=eq.${companyId}` },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;

          setLocalContent((prev) =>
            prev.map((item) =>
              item.id === updated.id
                ? ({
                  ...item,
                  ...updated,
                  report: (item as any).report,
                  tags: (item as any).tags,
                } as any)
                : item
            )
          );

          setSelectedContent((prev) =>
            prev?.id === updated.id
              ? ({
                ...prev,
                ...updated,
                report: (prev as any).report,
                tags: (prev as any).tags,
              } as any)
              : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const openById = useCallback(
    async (id: string) => {
      const existing = localContent.find((c) => c.id === id);
      if (existing) {
        setSelectedContent(existing);
        localStorage.removeItem(OPEN_KEY);
        return;
      }

      if (!companyId) return;

      const { data, error } = await supabase
        .from('content_submissions')
        .select('*')
        .eq('id', id)
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) {
        logger.error('Failed to fetch content by id:', error);
        return;
      }

      if (!data?.id) return;

      const merged = data as any as ContentWithReport;

      setLocalContent((prev) => {
        if (prev.some((x) => x.id === merged.id)) return prev;
        return [merged, ...prev];
      });

      setSelectedContent(merged);
      localStorage.removeItem(OPEN_KEY);
    },
    [localContent, companyId]
  );

  useEffect(() => {
    const handler = (e: any) => {
      const id = e?.detail?.id as string | undefined;
      if (!id) return;
      openById(id);
    };

    window.addEventListener('open-document', handler as any);
    return () => window.removeEventListener('open-document', handler as any);
  }, [openById]);

  useEffect(() => {
    const pending = localStorage.getItem(OPEN_KEY);
    if (!pending) return;
    openById(pending);
  }, [openById]);

  const goToCorrectionEditor = useCallback((contentId: string) => {
    localStorage.setItem(CORRECTION_OPEN_KEY, contentId);
    window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'correction-editor' } }));
    window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'correction-editor' } }));
  }, []);

  const publishContent = useCallback(
    async (contentId: string) => {
      if (!user) return;

      if (!companyId) {
        alert('Publish blocked: company not set on profile');
        return;
      }

      const current = localContent.find((c) => c.id === contentId);
      if (!current) {
        alert('Publish failed: item not found in local list.');
        return;
      }

      if (current.signoff_status !== 'signed_off') {
        alert(`Publish blocked: item is "${current.signoff_status}", not "signed_off".`);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('content_submissions')
          .update({
            signoff_status: 'published',
            published_at: new Date().toISOString(),
            published_by: user.id,
          })
          .eq('id', contentId)
          .eq('company_id', companyId)
          .eq('signoff_status', 'signed_off')
          .select('id, signoff_status, published_at, published_by')
          .maybeSingle();

        if (error) {
          logger.error('Publish update error:', error);
          alert(`Publish failed: ${error.message}`);
          return;
        }

        if (!data?.id) {
          alert('Publish did not apply. The record may no longer be signed_off, or company_id mismatch.');
          return;
        }

        await recordAuditEvent({
          userId: user.id,
          action: 'publish',
          entityType: 'content_submission',
          entityId: contentId,
          companyId: companyId!,
          metadata: { from_status: 'signed_off', to_status: 'published' },
        });

        setLocalContent((prev) =>
          prev.map((item) =>
            item.id === contentId
              ? ({
                ...item,
                signoff_status: 'published' as any,
                published_at: data.published_at,
                published_by: data.published_by,
              } as any)
              : item
          )
        );

        setSelectedContent((prev) =>
          prev?.id === contentId
            ? ({
              ...prev,
              signoff_status: 'published' as any,
              published_at: data.published_at,
              published_by: data.published_by,
            } as any)
            : prev
        );
      } catch (e: any) {
        logger.error('Publish crashed:', e);
        alert(`Publish crashed: ${e?.message ?? 'Unknown error'}`);
      }
    },
    [user, companyId, localContent]
  );

  const filteredContent = useMemo(() => {
    let filtered = [...localContent];

    if (selectedFolder === 'all') {
      filtered = filtered.filter((item) => !item.folder_id);
    } else {
      const childIds = new Set<string>();
      const collectChildren = (parentId: string) => {
        childIds.add(parentId);
        flatFolders
          .filter((f) => f.parent_folder_id === parentId)
          .forEach((f) => collectChildren(f.id));
      };
      collectChildren(selectedFolder);
      filtered = filtered.filter((item) => item.folder_id && childIds.has(item.folder_id));
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((item) => {
        if (item.title.toLowerCase().includes(term)) return true;
        if (item.content_topic.toLowerCase().includes(term)) return true;
        if (item.tags?.some((t) => t.tag_name.toLowerCase().includes(term))) return true;
        if (item.report) {
          if ((item.report.flagged_phrases as unknown as any[])?.some((p: any) => p.phrase.toLowerCase().includes(term))) return true;
          if ((item.report.issues as unknown as any[])?.some((i: any) => i.issue.toLowerCase().includes(term))) return true;
        }
        return false;
      });
    }

    if (statusFilter !== 'all') filtered = filtered.filter((item) => item.status === statusFilter);
    if (platformFilter !== 'all') filtered = filtered.filter((item) => item.platform === platformFilter);
    if (tagFilter !== 'all') filtered = filtered.filter((item) => item.tags?.some((t) => t.tag_name === tagFilter));
    if (signoffFilter !== 'all') filtered = filtered.filter((item) => item.signoff_status === signoffFilter);

    filtered.sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
    return filtered;
  }, [localContent, selectedFolder, searchTerm, statusFilter, platformFilter, tagFilter, signoffFilter, flatFolders]);

  const rootCount = useMemo(() => localContent.filter((c) => !c.folder_id).length, [localContent]);

  const draggingItem = useMemo(() => (draggingId ? localContent.find((c) => c.id === draggingId) : null), [
    draggingId,
    localContent,
  ]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const contentId = event.active.data.current?.contentId;
    if (contentId) setDraggingId(contentId);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingId(null);
      const contentId = event.active.data.current?.contentId;
      const overId = event.over?.id?.toString();
      if (!contentId || !overId) return;

      if (overId === 'folder-root') {
        moveToFolder(contentId, null);
      } else if (overId.startsWith('folder-')) {
        const folderId = overId.replace('folder-', '');
        moveToFolder(contentId, folderId);
      }
    },
    [moveToFolder]
  );

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      await deleteFolder(folderId);
      if (selectedFolder === folderId) setSelectedFolder('all');
    },
    [deleteFolder, selectedFolder]
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <SkeletonLine className="h-7 w-48" />
            <SkeletonLine className="h-4 w-72" />
          </div>
          <SkeletonLine className="h-9 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
          {/* Folder sidebar skeleton */}
          <div className="dash-card rounded-xl border dash-border p-4 space-y-3">
            <SkeletonLine className="h-4 w-24" />
            {[...Array(5)].map((_, i) => (
              <SkeletonLine key={i} className="h-8 rounded-lg" />
            ))}
          </div>
          {/* Content grid skeleton */}
          <div className="space-y-4">
            <SkeletonLine className="h-10 rounded-xl" />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <SkeletonCard key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold dash-text">Content Archive</h2>
            <p className="text-sm dash-text-secondary mt-1">Organize, tag, and manage documents with compliance reports</p>
          </div>
          <button
            onClick={() => {
              setSelectMode(!selectMode);
              if (selectMode) setSelectedIds(new Set());
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${selectMode
              ? 'bg-[var(--color-behance-blue)] text-white shadow-sm'
              : 'dash-card border dash-border dash-text-secondary hover:dash-surface-alt'
              }`}
          >
            {selectMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            {selectMode ? 'Exit Select' : 'Select Mode'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
          <FolderSidebar
            folders={folders}
            selectedFolder={selectedFolder}
            onSelectFolder={setSelectedFolder}
            rootCount={rootCount}
            onCreateFolder={createFolder}
            onRenameFolder={renameFolder}
            onDeleteFolder={handleDeleteFolder}
          />

          <div className="space-y-4">
            <SearchToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              platformFilter={platformFilter}
              onPlatformFilterChange={setPlatformFilter}
              tagFilter={tagFilter}
              onTagFilterChange={setTagFilter}
              allTags={allTags}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              signoffFilter={signoffFilter}
              onSignoffFilterChange={setSignoffFilter}
            />

            <FolderBreadcrumb selectedFolder={selectedFolder} folders={folders} onNavigate={setSelectedFolder} />

            {filteredContent.length === 0 ? (
              <div className="dash-card rounded-xl border dash-border/60 shadow-sm">
                <div className="text-center py-16">
                  <FileText className="w-10 h-10 dash-text-tertiary mx-auto mb-3" />
                  <p className="text-sm dash-text-secondary">No documents found</p>
                  <p className="text-xs dash-text-tertiary mt-1">Try adjusting your search or filters</p>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredContent.map((item) => (
                  <DocumentCard
                    key={item.id}
                    item={item}
                    viewMode="grid"
                    onClick={() => setSelectedContent(item)}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={(id) => {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        next.has(id) ? next.delete(id) : next.add(id);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="dash-card rounded-xl border dash-border/60 shadow-sm overflow-hidden">
                {filteredContent.map((item) => (
                  <DocumentCard
                    key={item.id}
                    item={item}
                    viewMode="list"
                    onClick={() => setSelectedContent(item)}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={(id) => {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        next.has(id) ? next.delete(id) : next.add(id);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <DragOverlay>
        {draggingItem && (
          <div className="dash-card rounded-lg shadow-xl border border-[var(--color-behance-blue)]/30 px-4 py-2 max-w-xs">
            <p className="text-sm font-medium dash-text truncate">{draggingItem.title}</p>
            <p className="text-xs dash-text-secondary">{draggingItem.platform}</p>
          </div>
        )}
      </DragOverlay>

      {selectedContent && (
        <DocumentDetailModal
          item={selectedContent}
          onClose={() => setSelectedContent(null)}
          onAddTag={async (cid, name, type) => {
            await addTag(cid, name, type);
          }}
          onRemoveTag={async (tid) => {
            await removeTag(tid);
          }}
          onRequestSignoff={async (cid) => {
            await requestLegalSignoff(cid);
          }}
          onPublish={async (cid) => {
            await publishContent(cid);
          }}
          onEditCorrect={(cid) => {
            setSelectedContent(null);
            goToCorrectionEditor(cid);
          }}
          onDelete={(cid) => setDeleteTargetId(cid)}
        />
      )}

      {/* ── Secure Password Prompt ── */}
      <PasswordPromptModal
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleSecureDelete}
        isLoading={isDeleting}
        title="Secure Deletion Verification"
        description="Deleting this content will remove it from your archive and move it to the Secret Vault for IT/Executive review. Please enter your account password to authorize this."
        confirmLabel="Authorize Deletion"
      />

      {/* ── Floating Selection Toolbar ── */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 dash-card rounded-2xl shadow-2xl border dash-border animate-in slide-in-from-bottom-4">
          <span className="text-sm font-semibold dash-text">
            {selectedIds.size} selected
          </span>

          <div className="w-px h-6 bg-[var(--color-surface-alt)]" />

          <button
            onClick={() => {
              const allIds = filteredContent.map(c => c.id);
              setSelectedIds(new Set(allIds));
            }}
            className="text-xs font-medium text-[var(--color-behance-blue)] hover:underline"
          >
            Select All ({filteredContent.length})
          </button>

          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs font-medium dash-text-secondary hover:underline"
          >
            Deselect All
          </button>

          <div className="w-px h-6 bg-[var(--color-surface-alt)]" />

          <button
            onClick={async () => {
              setExporting(true);
              try {
                const items = localContent.filter(c => selectedIds.has(c.id));
                await generateAuditZip(items);
              } catch (err) {
                logger.error('Audit export failed:', err);
                alert('Export failed. Please try again.');
              } finally {
                setExporting(false);
              }
            }}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-behance-blue)] text-white text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors shadow-sm disabled:opacity-60"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {exporting ? 'Exporting…' : 'Export for Audit'}
          </button>

          <button
            onClick={() => setDeleteTargetId(Array.from(selectedIds))}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-danger)] text-white text-sm font-semibold hover:opacity-90 transition-colors shadow-sm"
          >
            Delete Selected
          </button>

          <button
            onClick={() => {
              setSelectMode(false);
              setSelectedIds(new Set());
            }}
            className="p-1.5 dash-text-tertiary hover:dash-text-secondary hover:dash-surface-alt rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </DndContext>
  );
}

