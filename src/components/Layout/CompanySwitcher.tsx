/**
 * The workspace switcher in the application header.
 *
 * It exists because `company_members` has always allowed one person to
 * belong to several companies, while the interface only ever showed the one
 * their profile row named. The second membership was real in the database
 * and unreachable on screen.
 *
 * WHAT IT OFFERS, AND WHY THAT IS THE WHOLE LIST
 * ----------------------------------------------
 * Exactly the rows `app_my_companies()` returned for this session — the
 * companies the server says the caller is an ACTIVE member of. It does not
 * read ids out of storage, out of the URL, or out of anything the client
 * assembled, so a company cannot appear here merely because its id is known.
 *
 * It also hides itself when there is nothing to choose, which is the common
 * case: one workspace, no control, no explaining what it is for.
 *
 * Styling follows BrandScopeSelector — the same header-dropdown pattern and
 * the same design tokens — because this is the second control of that kind
 * and they should not look like two different products.
 */
import { useState, useEffect, useRef } from 'react';
import { Building2, ChevronDown, Check, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../lib/logger';

export default function CompanySwitcher() {
  const {
    companies, activeCompanyId, defaultCompanyId, companiesError,
    switchingCompany, switchCompany,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  //  Close on Escape — this is a menu, and a menu that only closes by
  //  clicking elsewhere is a keyboard trap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  /*
   *  NOTHING TO CHOOSE, NOTHING TO SHOW.
   *
   *  One workspace is the ordinary case and it gets no control: a dropdown
   *  with a single entry invites a click that cannot do anything. An empty
   *  list means the profile has not loaded yet, or this database predates
   *  20261215000000 and has no app_my_companies() — in both cases the app
   *  behaves exactly as it did before this component existed.
   *
   *  The ONE exception is a failure to read the list on an account that is
   *  known to have a default workspace: staying silent there would show the
   *  person a single-workspace product and let them conclude their other
   *  company had been taken away. A failure says so.
   */
  if (companies.length <= 1) {
    if (!companiesError || !defaultCompanyId) return null;
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)]
                   bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text-tertiary)]"
        title={`Your workspace list could not be read: ${companiesError}`}
      >
        <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-warning,#b45309)]" />
        <span>Workspaces unavailable</span>
      </div>
    );
  }

  const active = companies.find((c) => c.company_id === activeCompanyId);
  const label = active?.company_name ?? 'Choose a workspace';

  const choose = async (companyId: string) => {
    setOpen(false);
    setError(null);
    const { error: switchError } = await switchCompany(companyId);
    if (switchError) {
      //  Shown in place rather than thrown away. A refused or failed switch
      //  leaves the previous workspace active — see switchCompany — so the
      //  message explains why the screen did not change.
      logger.warn('workspace switch refused or failed');
      setError(switchError.message);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={switchingCompany}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Workspace: ${label}. Change workspace`}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)]
                   bg-[var(--color-surface)] hover:bg-[var(--color-surface-alt)] text-sm font-medium
                   text-[var(--color-text-secondary)] transition-all duration-150 shadow-sm
                   disabled:opacity-60 disabled:cursor-wait"
      >
        {switchingCompany
          ? <Loader2 className="w-4 h-4 animate-spin text-[var(--color-purple)]" />
          : <Building2 className="w-4 h-4 text-[var(--color-purple)]" />}
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {error && (
        <div
          role="alert"
          className="absolute right-0 top-full mt-1 w-72 px-3 py-2 rounded-lg z-50
                     bg-[var(--color-surface)] border border-[var(--color-danger,#dc2626)]
                     text-xs text-[var(--color-danger,#dc2626)] shadow-lg"
        >
          {error}
        </div>
      )}

      {open && !error && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-72 bg-[var(--color-surface)] rounded-xl
                     border border-[var(--color-border)] shadow-xl z-50 py-1 max-h-80 overflow-y-auto
                     animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Your workspaces
          </div>

          {companies.map((c) => {
            const isActive = c.company_id === activeCompanyId;
            return (
              <button
                key={c.company_id}
                type="button"
                role="menuitem"
                onClick={() => { if (!isActive) void choose(c.company_id); else setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left
                            hover:bg-[var(--color-surface-alt)]
                            ${isActive
                              ? 'bg-[var(--color-purple)]/10 text-[var(--color-purple)] font-medium'
                              : 'text-[var(--color-text-secondary)]'}`}
              >
                <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-400 to-purple-500
                                flex items-center justify-center text-[9px] text-white font-bold shrink-0">
                  {c.company_name.charAt(0).toUpperCase()}
                </div>
                <span className="truncate flex-1">{c.company_name}</span>
                {/*  The role is per company and worth showing: it is the
                     thing most likely to differ between two workspaces. */}
                {c.role && (
                  <span className="text-[10px] text-[var(--color-text-tertiary)] shrink-0 capitalize">
                    {c.role.replace(/_/g, ' ')}
                  </span>
                )}
                {c.company_id === defaultCompanyId && (
                  <span className="text-[9px] uppercase tracking-wide text-[var(--color-text-tertiary)] shrink-0">
                    default
                  </span>
                )}
                {isActive && <Check className="w-3.5 h-3.5 text-[var(--color-purple)] shrink-0" />}
              </button>
            );
          })}

          {companiesError && (
            <>
              <div className="border-t border-[var(--color-border)] my-1" />
              <div className="px-3 py-2 text-[11px] text-[var(--color-text-tertiary)]">
                This list may be out of date — it could not be refreshed.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
