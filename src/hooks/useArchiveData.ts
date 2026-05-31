import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../lib/database.types';
import { recordAuditEvent } from '../lib/auditService';
import { logger } from '../lib/logger';

type ContentSubmission = Database['public']['Tables']['content_submissions']['Row'];
type ComplianceReport = Database['public']['Tables']['compliance_reports']['Row'];
type ContentFolder = Database['public']['Tables']['content_folders']['Row'];
type DocumentTag = Database['public']['Tables']['document_tags']['Row'];

export interface ContentWithReport extends ContentSubmission {
  report?: ComplianceReport;
  tags?: DocumentTag[];
}

export interface FolderWithContent extends ContentFolder {
  content_count: number;
  children?: FolderWithContent[];
}

export function useArchiveData() {
  const { user } = useAuth();
  const [content, setContent] = useState<ContentWithReport[]>([]);
  const [folders, setFolders] = useState<FolderWithContent[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadContent = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [submissionsResult, foldersResult, tagsResult] = await Promise.all([
      supabase
        .from('content_submissions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('content_folders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('document_tags')
        .select('*')
        .eq('user_id', user.id),
    ]);

    const submissions = submissionsResult.data || [];
    const folderData = foldersResult.data || [];
    const tagData = tagsResult.data || [];

    let reports: ComplianceReport[] = [];
    if (submissions.length > 0) {
      const ids = submissions.map((s) => s.id);
      const { data: reportData } = await supabase
        .from('compliance_reports')
        .select('*')
        .in('content_id', ids);
      reports = reportData || [];
    }

    const reportMap = new Map(reports.map((r) => [r.content_id, r]));
    const tagsByContent = new Map<string, DocumentTag[]>();
    tagData.forEach((tag) => {
      const existing = tagsByContent.get(tag.content_id) || [];
      existing.push(tag);
      tagsByContent.set(tag.content_id, existing);
    });

    const contentWithReports: ContentWithReport[] = submissions.map((s) => ({
      ...s,
      report: reportMap.get(s.id),
      tags: tagsByContent.get(s.id) || [],
    }));

    setContent(contentWithReports);

    const uniqueTags = [...new Set(tagData.map((t) => t.tag_name))];
    setAllTags(uniqueTags);

    const foldersWithCounts: FolderWithContent[] = folderData.map((folder) => ({
      ...folder,
      content_count: submissions.filter((c) => c.folder_id === folder.id).length,
    }));

    const buildTree = (parentId: string | null): FolderWithContent[] => {
      return foldersWithCounts
        .filter((f) => f.parent_folder_id === parentId)
        .map((f) => ({
          ...f,
          children: buildTree(f.id),
        }));
    };

    setFolders(buildTree(null));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const createFolder = async (name: string, parentId: string | null = null) => {
    if (!user) return;
    const { error } = await supabase.from('content_folders').insert({
      user_id: user.id,
      name: name.trim(),
      parent_folder_id: parentId,
    });
    if (!error) await loadContent();
    return error;
  };

  const renameFolder = async (folderId: string, newName: string) => {
    const { error } = await supabase
      .from('content_folders')
      .update({ name: newName.trim() })
      .eq('id', folderId);
    if (!error) await loadContent();
    return error;
  };

  const deleteFolder = async (folderId: string) => {
    await supabase
      .from('content_submissions')
      .update({ folder_id: null })
      .eq('folder_id', folderId);

    await supabase
      .from('content_folders')
      .update({ parent_folder_id: null })
      .eq('parent_folder_id', folderId);

    const { error } = await supabase
      .from('content_folders')
      .delete()
      .eq('id', folderId);
    if (!error) await loadContent();
    return error;
  };

  const moveToFolder = async (contentId: string, folderId: string | null) => {
    const { error } = await supabase
      .from('content_submissions')
      .update({ folder_id: folderId })
      .eq('id', contentId);
    if (!error) await loadContent();
    return error;
  };

  const addTag = async (contentId: string, tagName: string, tagType: 'campaign' | 'client') => {
    if (!user) return;
    const { error } = await supabase.from('document_tags').insert({
      content_id: contentId,
      user_id: user.id,
      tag_name: tagName.trim(),
      tag_type: tagType,
    });
    if (!error) await loadContent();
    return error;
  };

  const removeTag = async (tagId: string) => {
    const { error } = await supabase
      .from('document_tags')
      .delete()
      .eq('id', tagId);
    if (!error) await loadContent();
    return error;
  };

  const requestLegalSignoff = async (contentId: string) => {
    if (!user) return;

    // Need company_id for isolation + to match LegalReviewPage queue query
    const { data: myProfile, error: profErr } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profErr) return profErr;

    const companyId = (myProfile as any)?.company_id as string | undefined;
    if (!companyId) {
      return new Error('Company not set on profile. Please complete onboarding or re-login.');
    }

    // ✅ Must have corrected version saved before sending to Legal
    const { data: row, error: fetchErr } = await supabase
      .from('content_submissions')
      .select('id, corrected_text, signoff_status, company_id')
      .eq('id', contentId)
      .maybeSingle();

    if (fetchErr) return fetchErr;

    const corrected = ((row as any)?.corrected_text as string) ?? '';
    if (!corrected || corrected.trim().length === 0) {
      return new Error('Please save a corrected version before requesting Legal sign-off.');
    }

    const allowedStatuses = ['analyzed', 'draft', 'amend_requested'];
    const now = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from('content_submissions')
      .update({
        signoff_status: 'awaiting_legal',
        submitted_for_legal_at: now,
        submitted_for_legal_by: user.id,
        is_locked: true,
        locked_at: now,
        locked_by: user.id,
      })
      .eq('id', contentId)
      .eq('company_id', companyId)
      .in('signoff_status', allowedStatuses as any)
      .select('id')
      .maybeSingle();

    if (updateError) return updateError;

    if (!updated?.id) {
      return new Error('You can only request Legal sign-off after the document has been analyzed/edited.');
    }

    // Notify legal team
    const { error: rpcError } = await (supabase as any).rpc('notify_legal_review_request', {
      p_content_id: contentId,
    });

    if (rpcError) logger.error('notify_legal_review_request failed:', rpcError);

    // Audit trail — immutable, hash-chained entry
    await recordAuditEvent({
      userId: user.id,
      action: 'request_legal_signoff',
      entityType: 'content_submission',
      entityId: contentId,
      companyId,
      metadata: { timestamp: now },
    });

    await loadContent();
    return null;
  };

  return {
    content,
    folders,
    allTags,
    loading,
    reload: loadContent,
    createFolder,
    renameFolder,
    deleteFolder,
    moveToFolder,
    addTag,
    removeTag,
    requestLegalSignoff,
  };
}
