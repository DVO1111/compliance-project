/**
 * CF-02 — Settings home.
 *
 * One place that lists every configuration area the viewer may open,
 * which is CF-01's closing conclusion: "Every area is now reachable
 * from one Settings home (CF-02)".
 *
 * ── IT GRANTS NOTHING ──
 *
 * Each card is drawn only if the viewer already holds that page's own
 * existing permission — the predicates live in
 * `lib/navigation/settingsSections.ts` and are the sidebar gates this
 * screen replaces, copied verbatim. The screen has no permission of its
 * own, and opening a card lands on the real page, which re-checks in
 * `App.tsx` before rendering. So a card is a shortcut, never an
 * authority: visibility here is not access.
 *
 * ── WHY IT CAN LOOK EMPTY-ISH AND THAT IS RIGHT ──
 *
 * A viewer holding one section sees one card. That is the point of
 * consolidating rather than granting: previously a person allowed to
 * see Billing and nothing else had to reach it through a sidebar entry
 * guarded by role administration.
 */

import { Settings as SettingsIcon, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getPermissions } from '../../lib/permissions';
import {
  SETTINGS_AREAS, permittedSettingsSections,
  type SettingsSection,
} from '../../lib/navigation/settingsSections';

function go(page: SettingsSection['page']) {
  //  The same mechanism every other in-app jump uses, so this screen
  //  needs no routing props of its own.
  window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page } }));
}

export default function SettingsHomePage() {
  const { profile } = useAuth();
  const p = profile as (Record<string, unknown> & { role?: string | null }) | null;

  const perms = getPermissions({
    profileRole: (p?.role as string | undefined) ?? null,
    customPermissions: (p?.custom_permissions as never) ?? null,
    moduleAccess: (p?.module_access as string[] | undefined) ?? null,
    industryType: (p?.industry_type as string | undefined) ?? null,
  });

  const sections = permittedSettingsSections(perms, {
    role: (p?.role as string | undefined) ?? null,
    organization_id: (p?.organization_id as string | undefined) ?? null,
  });

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <SettingsIcon size={22} strokeWidth={1.5} className="dash-text-tertiary shrink-0" />
          <h1 className="text-2xl font-semibold dash-text-primary">Settings</h1>
        </div>
        <p className="text-sm dash-text-tertiary max-w-2xl">
          Every setting for this workspace, in one place. Only the areas you can
          open are listed.
        </p>
      </header>

      {sections.length === 0 ? (
        //  Reached only by a direct URL: the rail entry is not drawn when
        //  there is nothing behind it. Says which it is, because "empty"
        //  and "not allowed" are different states and collapsing them is
        //  how somebody concludes a feature is missing.
        <div className="dash-card border dash-border rounded-2xl p-6">
          <p className="text-sm dash-text-secondary">
            You do not have access to any settings area in this workspace. This is
            not an empty workspace — it means none of these areas is assigned to
            your role. Ask an administrator if you need one.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {SETTINGS_AREAS.map((area) => {
            const inArea = sections.filter((s) => s.area === area);
            if (inArea.length === 0) return null;
            return (
              <section key={area}>
                <h2
                  className="text-[10px] font-bold uppercase tracking-widest px-1 mb-3"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {area}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {inArea.map((s) => (
                    <button
                      key={s.page}
                      onClick={() => go(s.page)}
                      className="dash-card border dash-border rounded-2xl p-4 text-left hover:dash-surface-alt transition-colors group flex items-start gap-3 min-h-[76px]"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium dash-text-primary mb-1">
                          {s.label}
                        </span>
                        <span className="block text-xs dash-text-tertiary leading-relaxed">
                          {s.description}
                        </span>
                      </span>
                      <ChevronRight
                        size={16}
                        strokeWidth={2}
                        className="dash-text-tertiary shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform"
                        aria-hidden
                      />
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
