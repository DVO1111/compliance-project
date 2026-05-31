// src/lib/versionService.ts
// Content version tracking + line-level diff for the collaborative review workflow
import { supabase } from './supabase';

/* ── Types ─────────────────────────────────────────────── */

export interface ContentVersion {
  id: string;
  submission_id: string;
  version_number: number;
  content_text: string;
  corrected_text: string;
  snapshot_by: string;
  created_at: string;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  lineNumber: number | null; // null for removed lines in "new" column
  text: string;
}

export interface DiffResult {
  oldVersion: number;
  newVersion: number;
  oldLines: DiffLine[];
  newLines: DiffLine[];
  stats: { added: number; removed: number; unchanged: number };
}

/* ── Create version snapshot ───────────────────────────── */

export async function createVersion(opts: {
  submissionId: string;
  contentText: string;
  correctedText?: string;
  snapshotBy: string;
}): Promise<ContentVersion> {
  // Get current version number
  const { data: existing } = await (supabase as any)
    .from('content_versions')
    .select('version_number')
    .eq('submission_id', opts.submissionId)
    .order('version_number', { ascending: false })
    .limit(1);

  const nextVersion = existing && existing.length > 0
    ? (existing[0] as any).version_number + 1
    : 1;

  const { data, error } = await (supabase as any)
    .from('content_versions')
    .insert({
      submission_id: opts.submissionId,
      version_number: nextVersion,
      content_text: opts.contentText,
      corrected_text: opts.correctedText || '',
      snapshot_by: opts.snapshotBy,
    })
    .select('*')
    .single();

  if (error) throw error;

  // Update submission's current version number
  await (supabase as any)
    .from('content_submissions')
    .update({ current_version_number: nextVersion })
    .eq('id', opts.submissionId);

  return data as ContentVersion;
}

/* ── Fetch version history ─────────────────────────────── */

export async function getVersionHistory(
  submissionId: string
): Promise<ContentVersion[]> {
  const { data, error } = await (supabase as any)
    .from('content_versions')
    .select('*')
    .eq('submission_id', submissionId)
    .order('version_number', { ascending: true });

  if (error) return [];
  return (data || []) as ContentVersion[];
}

/* ── Line diff (LCS-based) ─────────────────────────────── */

export function computeLineDiff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result: { type: 'added' | 'removed' | 'unchanged'; text: string }[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'unchanged', text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', text: oldLines[i - 1] });
      i--;
    }
  }

  // Build left/right columns with line numbers
  const leftLines: DiffLine[] = [];
  const rightLines: DiffLine[] = [];
  let leftLineNo = 1;
  let rightLineNo = 1;
  let stats = { added: 0, removed: 0, unchanged: 0 };

  for (const entry of result) {
    if (entry.type === 'unchanged') {
      leftLines.push({ type: 'unchanged', lineNumber: leftLineNo++, text: entry.text });
      rightLines.push({ type: 'unchanged', lineNumber: rightLineNo++, text: entry.text });
      stats.unchanged++;
    } else if (entry.type === 'removed') {
      leftLines.push({ type: 'removed', lineNumber: leftLineNo++, text: entry.text });
      rightLines.push({ type: 'removed', lineNumber: null, text: '' });
      stats.removed++;
    } else {
      leftLines.push({ type: 'added', lineNumber: null, text: '' });
      rightLines.push({ type: 'added', lineNumber: rightLineNo++, text: entry.text });
      stats.added++;
    }
  }

  return {
    oldVersion: 0,
    newVersion: 0,
    oldLines: leftLines,
    newLines: rightLines,
    stats,
  };
}
