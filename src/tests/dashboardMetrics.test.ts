/**
 * Dashboard metrics — schema-reference regression tests.
 *
 * Three KPI queries on this page were wrong against the real schema and
 * had been wrong in production, because supabase-js resolves a failed
 * query with `{ data: null, error }` rather than rejecting: nothing
 * inspected `.error`, `?? []` turned the failure into an empty result,
 * and the cards rendered a confident zero.
 *
 * "Overdue Obligations: 0 · All on track · green" on a compliance
 * dashboard, because the table name was wrong, is the worst way this
 * page can fail. These tests read the component source and assert the
 * three references, so a rename cannot quietly reintroduce them.
 *
 * Source-level assertions are used deliberately: the queries are inline
 * in a React component, and the repo has no DOM test environment. The
 * column and table names below were verified against a Postgres instance
 * with all migrations applied.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(
  resolve(HERE, '../components/Dashboard/DashboardPage.tsx'),
  'utf8',
);

/** Source with `//` line comments stripped — the file discusses the old
 *  names in prose, and prose must not satisfy or break an assertion. */
const CODE = SRC.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

describe('risks query', () => {
  it('selects risk_level, the column that exists', () => {
    expect(CODE).toMatch(/\.select\(['"]risk_level, status['"]\)/);
  });

  it('does not select a bare `level` column', () => {
    // `level` does not exist on risks; selecting it makes PostgREST
    // reject the whole request, so open_risks read 0 for every company
    expect(CODE).not.toMatch(/\.select\(['"]level,/);
  });

  it('does not filter on a status value that is not in the vocabulary', () => {
    // risks.status is identified | mitigating | monitored | closed
    expect(CODE).not.toContain("'resolved'");
  });
});

describe('obligations query', () => {
  it('queries regulatory_obligations', () => {
    expect(CODE).toContain(".from('regulatory_obligations')");
  });

  it('never queries a bare `obligations` table', () => {
    // public.obligations does not exist. This is the reference that made
    // the card say "All on track" regardless of reality.
    expect(CODE).not.toMatch(/\.from\('obligations'\)/);
  });

  it('does not filter on a status value that is not in the vocabulary', () => {
    // regulatory_obligations.status is identified | implemented | monitored
    expect(CODE).not.toContain("'completed'");
  });
});

describe('licence alerts query', () => {
  it('reads status alongside expiry_date', () => {
    expect(CODE).toMatch(/\.select\(['"]expiry_date, status['"]\)/);
  });

  it('excludes certificates that are not in force', () => {
    // A superseded licence keeps its original past expiry by design
    // (see 20260921000000), so counting by date alone added 1 to
    // "expired" for every renewal, permanently.
    expect(CODE).toContain("'(draft,renewed,discontinued)'");
  });
});

describe('failed fetches are surfaced, not zeroed', () => {
  it('inspects .error on each result rather than trusting settle status', () => {
    expect(CODE).toMatch(/res\.value\?\.error/);
  });

  it('records which sources failed', () => {
    expect(CODE).toContain('setFailedSources');
  });

  it('renders an em dash rather than 0 for a failed source', () => {
    expect(CODE).toMatch(/failedSources\.has\(source\)/);
    expect(CODE).toMatch(/text:\s*["']—["']/);
  });

  it('does not colour a failed metric green', () => {
    // green + "All on track" is precisely the false reassurance being fixed
    for (const m of ['mRisks', 'mObligations', 'mControls', 'mCapas', 'mLicences']) {
      const re = new RegExp(`${m}\\.failed\\s*\\?\\s*["']yellow["']`);
      expect(CODE, `${m} should fall back to yellow, not green`).toMatch(re);
    }
  });

  it('logs every failed fetch', () => {
    expect(CODE).toMatch(/logger\.error\(`Dashboard metric/);
    expect(CODE).toMatch(/logger\.error\(`Dashboard activity check/);
  });
});
