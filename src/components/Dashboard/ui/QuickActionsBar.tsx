/**
 * QuickActionsBar
 *
 * Role-aware shortcut strip pinned below the sticky header.
 * For users with module_access (invited users), actions are filtered
 * to only show pages they have permission to reach.
 */

import {
  Upload, Scale, ShieldAlert, FileText,
  ClipboardList, UserPlus, BookOpen, PlusCircle
} from 'lucide-react';
import type { Permissions } from '../../../lib/permissions';

interface Action {
  label: string;
  icon: typeof Upload;
  page: string;
  payload?: Record<string, unknown>;
  accent?: boolean;
  /** Permission flag that must be true for this action to show */
  permKey?: keyof Permissions;
}

const ACTIONS_BY_ROLE: Record<string, Action[]> = {
  executive: [
    { label: 'Upload Content', icon: Upload, page: 'upload', accent: true, permKey: 'canUpload' },
    { label: 'Legal Review', icon: Scale, page: 'legal-review', permKey: 'canViewLegalReview' },
    { label: 'Risk Register', icon: ShieldAlert, page: 'risk-register', permKey: 'canViewGrcFrameworks' },
    { label: 'Obligations', icon: ClipboardList, page: 'obligations', permKey: 'canViewGrcFrameworks' },
    { label: 'Policies', icon: FileText, page: 'policies', permKey: 'canViewPolicies' },
    { label: 'Invite Member', icon: UserPlus, page: 'company-invites', permKey: 'canInvite' },
  ],
  compliance: [
    { label: 'Legal Review', icon: Scale, page: 'legal-review', accent: true, permKey: 'canViewLegalReview' },
    { label: 'Risk Register', icon: ShieldAlert, page: 'risk-register', permKey: 'canViewGrcFrameworks' },
    { label: 'Obligations', icon: ClipboardList, page: 'obligations', permKey: 'canViewGrcFrameworks' },
    { label: 'Policies', icon: FileText, page: 'policies', permKey: 'canViewPolicies' },
    { label: 'Audit Trail', icon: BookOpen, page: 'audit-trail', permKey: 'canViewAuditTrail' },
    { label: 'Upload Content', icon: Upload, page: 'upload', permKey: 'canUpload' },
  ],
  legal: [
    { label: 'Legal Review', icon: Scale, page: 'legal-review', accent: true, permKey: 'canViewLegalReview' },
    { label: 'Risk Register', icon: ShieldAlert, page: 'risk-register', permKey: 'canViewGrcFrameworks' },
    { label: 'Obligations', icon: ClipboardList, page: 'obligations', permKey: 'canViewGrcFrameworks' },
    { label: 'Policies', icon: FileText, page: 'policies', permKey: 'canViewPolicies' },
    { label: 'Audit Trail', icon: BookOpen, page: 'audit-trail', permKey: 'canViewAuditTrail' },
    { label: 'Upload Content', icon: Upload, page: 'upload', permKey: 'canUpload' },
  ],
  marketing: [
    { label: 'Upload Content', icon: Upload, page: 'upload', accent: true, permKey: 'canUpload' },
    { label: 'My Archive', icon: BookOpen, page: 'archive', permKey: 'canViewArchive' },
    { label: 'Legal Review', icon: Scale, page: 'legal-review', permKey: 'canViewLegalReview' },
    { label: 'Calendar', icon: ClipboardList, page: 'content-calendar' },
    { label: 'New Policy', icon: PlusCircle, page: 'policies', permKey: 'canViewPolicies' },
  ],
};

// Shown for users whose role doesn't match any of the above (e.g. module-access users).
// Filtered by permissions before display.
const DEFAULT_ACTIONS: Action[] = [
  { label: 'Upload Content', icon: Upload, page: 'upload', accent: true, permKey: 'canUpload' },
  { label: 'Legal Review', icon: Scale, page: 'legal-review', permKey: 'canViewLegalReview' },
  { label: 'Risk Register', icon: ShieldAlert, page: 'risk-register', permKey: 'canViewGrcFrameworks' },
  { label: 'Obligations', icon: ClipboardList, page: 'obligations', permKey: 'canViewGrcFrameworks' },
  { label: 'Policies', icon: FileText, page: 'policies', permKey: 'canViewPolicies' },
  { label: 'Audit Trail', icon: BookOpen, page: 'audit-trail', permKey: 'canViewAuditTrail' },
  { label: 'Vendors', icon: FileText, page: 'vendors', permKey: 'canViewVendors' },
];

interface QuickActionsBarProps {
  role: string;
  perms?: Partial<Permissions>;
}

export default function QuickActionsBar({ role, perms }: QuickActionsBarProps) {
  const rawActions = ACTIONS_BY_ROLE[role.toLowerCase()] ?? DEFAULT_ACTIONS;

  // When permissions are provided, hide actions the user can't reach.
  const actions = perms
    ? rawActions.filter(a => {
        if (!a.permKey) return true;                // no restriction
        return perms[a.permKey] !== false;           // show unless explicitly false
      })
    : rawActions;

  const navigate = (action: Action) => {
    window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: action.page, ...action.payload } }));
  };

  if (actions.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap max-w-[1600px] mx-auto">
      <span className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mr-1 hidden sm:block">
        Quick Actions
      </span>
      {actions.map(action => {
        const Icon = action.icon;
        return (
          <button
            key={action.page + action.label}
            onClick={() => navigate(action)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all hover:-translate-y-0.5 ${
              action.accent
                ? 'text-white border-transparent shadow-sm hover:shadow-md'
                : 'dash-text-secondary border-[var(--color-border)] hover:dash-text dash-card hover:bg-[var(--color-surface-alt)]'
            }`}
            style={action.accent ? { background: 'var(--color-accent)', borderColor: 'var(--color-accent)' } : undefined}
          >
            <Icon className="w-3.5 h-3.5" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
