/**
 * The Criateur icon toolkit — page 06 · ICONOGRAPHY of the Product Design
 * file, as code.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * --------------------------------
 * It is not artwork. Every icon in the toolkit is a Lucide glyph, named
 * explicitly in its Figma component description ("department — Lucide
 * building-2"). The project already depends on lucide-react, so the only
 * thing actually missing in code was the MAPPING: a Criateur semantic
 * name to the glyph that draws it. That mapping is the toolkit, and this
 * file is it.
 *
 * Importing a glyph directly still works and is not wrong. What this adds
 * is that `icon('quality/dispensing')` is the design's own name, so a
 * screen says what it means rather than which picture it drew, and when
 * the toolkit reassigns a glyph the change lands in one place.
 *
 * THE SPEC, FROM THE TOOLKIT'S OWN SPEC PANEL
 * -------------------------------------------
 *   SIZES   16 px for tables, buttons, badges and inputs
 *           20 px for navigation, page headers and empty-state tiles
 *   STROKE  1.5 px at 16 · 1.75 px at 20. Weight is set in pixels for
 *           each size, NOT scaled down from the 24 master.
 *   GRID    24-unit source grid, 2-unit padding, round caps and joins,
 *           no fills on outline icons
 *   COLOUR  strokes bind to the icon colour variables; override with
 *           icon/strong, icon/accent or status/* as needed
 *   STATE   an icon never carries state on its own. Pair it with a label
 *           or a status badge.
 *
 * The stroke rule is the one a careless implementation loses: Lucide's
 * default strokeWidth is 2 and scales with the box, so rendering the
 * 24-grid glyph at 16 px gives a visibly heavier line than the toolkit
 * asks for. ICON_SIZES below sets both numbers together for that reason,
 * and `iconProps` is the only sanctioned way to get them.
 *
 * VERSION DIVERGENCE — READ BEFORE ADDING AN ICON
 * -----------------------------------------------
 * The toolkit names its source as lucide-static 0.400.0. This project is
 * on lucide-react 0.344.0, and FOUR of the names the toolkit uses do not
 * exist at 0.344 — the glyphs do, under their older names. They are
 * mapped to those older names below and collected in
 * RENAMED_SINCE_TOOLKIT, so that an upgrade has a checklist rather than
 * a search and the list cannot drift out of sight.
 *
 * A fifth, `signature`, does not exist under ANY name in 0.344. It is
 * mapped to PenLine and flagged in APPROXIMATED. That is a deliberate
 * substitution and not a match; it is the one icon on this page whose
 * drawing differs from the design.
 */

import type { LucideIcon } from 'lucide-react';
import {
  // ── Navigation ────────────────────────────────────────────────────
  LayoutGrid, Activity, MessageSquare, Sparkles, FlaskConical,
  ClipboardList, Route, Book, Package, Factory, Scale, BarChart3,
  Settings, LogOut,
  // ── Actions and interface ─────────────────────────────────────────
  Search, Bell, ChevronDown, ChevronRight, ChevronLeft, X, Plus,
  RefreshCw, Upload, Download, Filter, Calendar, Clock, History, Pencil,
  Trash2, Eye, EyeOff, Copy, Link, ExternalLink, Check, Send, Paperclip,
  Share2, ArrowUpRight, Menu,
  // ── People and access ─────────────────────────────────────────────
  User, Users, UserPlus, KeyRound, Shield, ShieldCheck, Lock, Monitor,
  Building2, MapPin, Landmark, Globe,
  // ── Regulatory ────────────────────────────────────────────────────
  FileUp, FolderOpen, Award, Pill, GitCompare, CalendarClock, Ship,
  Layers, FileText,
  // ── Manufacturing and quality ─────────────────────────────────────
  PackageOpen, Boxes, TestTube, Microscope, FileCheck, QrCode,
  ListOrdered, ClipboardCheck, Weight, Network, Gauge, FileWarning,
  BadgeCheck, Ban, Percent, Ruler, Thermometer, SprayCan, Droplets, Bug,
  GraduationCap, ArrowLeftRight, Store, ShieldAlert, ScrollText, Inbox,
  Siren, AlertOctagon,
  // ── Lifecycle ─────────────────────────────────────────────────────
  Undo2,
  // ── Renamed in Lucide after the toolkit was drawn ─────────────────
  CheckCircle,      // 0.400 calls this circle-check
  MoreHorizontal,   // 0.400 calls this ellipsis
  HelpCircle,       // 0.400 calls this circle-help
  Unlock,           // 0.400 calls this lock-open
  PenLine,          // stands in for signature, which 0.344 does not have
} from 'lucide-react';

/** The toolkit's two sizes, each with the stroke width it is drawn at.
 *  Never scale one from the other. */
export const ICON_SIZES = {
  /** Tables, buttons, badges, inputs. */
  sm: { size: 16, strokeWidth: 1.5 },
  /** Navigation, page headers, empty-state tiles. */
  md: { size: 20, strokeWidth: 1.75 },
} as const;

export type IconSize = keyof typeof ICON_SIZES;

/** Spread onto a Lucide component so both numbers travel together:
 *  `<Icon {...iconProps('sm')} />`. Passing a bare `size` is the bug this
 *  prevents, because strokeWidth then stays at Lucide's default 2. */
export function iconProps(size: IconSize = 'sm') {
  return { ...ICON_SIZES[size], absoluteStrokeWidth: true };
}

/**
 * The toolkit. Keys are the Figma component names with the `icon/` prefix
 * dropped, so `icon/quality/dispensing` is `quality/dispensing`.
 */
export const ICONS = {
  // ── Navigation ────────────────────────────────────────────────────
  'nav/dashboard': LayoutGrid,
  'nav/compliance-report': Activity,
  'nav/team-chat': MessageSquare,
  'nav/ai-insights': Sparkles,
  'nav/batch-release': FlaskConical,
  'nav/deviation-capa': ClipboardList,
  'nav/change-control': Route,
  'nav/sop-library': Book,
  'nav/supplier-qual': Package,
  'nav/gmp-inspection': Factory,
  'nav/policies': Scale,
  'nav/my-policies': CheckCircle,
  'nav/grc-posture': BarChart3,
  'nav/settings': Settings,
  'nav/log-out': LogOut,

  // ── Actions and interface ─────────────────────────────────────────
  'action/search': Search,
  'action/notifications': Bell,
  'action/chevron-down': ChevronDown,
  'action/chevron-right': ChevronRight,
  'action/chevron-left': ChevronLeft,
  'action/close': X,
  'action/add': Plus,
  'action/refresh': RefreshCw,
  'action/upload': Upload,
  'action/download': Download,
  'action/filter': Filter,
  'action/calendar': Calendar,
  'action/time': Clock,
  'action/history': History,
  'action/edit': Pencil,
  'action/delete': Trash2,
  'action/view': Eye,
  'action/hide': EyeOff,
  'action/copy': Copy,
  'action/link': Link,
  'action/external-link': ExternalLink,
  'action/more': MoreHorizontal,
  'action/check': Check,
  'action/send': Send,
  'action/attach': Paperclip,
  'action/export': Share2,
  'action/open': ArrowUpRight,
  'action/help': HelpCircle,
  /** Mobile navigation drawer trigger (RESP-01). */
  'action/menu': Menu,

  // ── People and access ─────────────────────────────────────────────
  'access/user': User,
  'access/users': Users,
  'access/invite': UserPlus,
  'access/credentials': KeyRound,
  'access/role': Shield,
  'access/verified': ShieldCheck,
  'access/locked': Lock,
  'access/unlocked': Unlock,
  'access/session': Monitor,
  'access/department': Building2,
  'access/site': MapPin,
  'access/regulator': Landmark,
  'access/jurisdiction': Globe,

  // ── Regulatory ────────────────────────────────────────────────────
  'regulatory/submission': FileUp,
  'regulatory/dossier': FolderOpen,
  'regulatory/licence': Award,
  'regulatory/product': Pill,
  'regulatory/variation': GitCompare,
  'regulatory/renewal': CalendarClock,
  'regulatory/import-permit': Ship,
  'regulatory/regulation': Layers,
  'regulatory/obligation': FileText,

  // ── Manufacturing and quality ─────────────────────────────────────
  'quality/material-receipt': PackageOpen,
  'quality/material-lot': Boxes,
  'quality/sampling': TestTube,
  'quality/qc-testing': Microscope,
  'quality/coa': FileCheck,
  'quality/qr-verify': QrCode,
  'quality/master-formula': ListOrdered,
  'quality/line-clearance': ClipboardCheck,
  'quality/dispensing': Weight,
  'quality/genealogy': Network,
  'quality/in-process-control': Gauge,
  'quality/deviation': FileWarning,
  'quality/release': BadgeCheck,
  'quality/reject': Ban,
  'quality/yield': Percent,
  'quality/calibration': Ruler,
  'quality/environmental': Thermometer,
  'quality/cleaning': SprayCan,
  'quality/water': Droplets,
  'quality/pest-control': Bug,
  'quality/training': GraduationCap,
  'quality/changeover': ArrowLeftRight,
  'quality/customer': Store,
  'quality/risk': ShieldAlert,
  'quality/audit-trail': ScrollText,
  'quality/tasks': Inbox,
  'quality/crisis': Siren,

  // ── Lifecycle ─────────────────────────────────────────────────────
  'lifecycle/signature': PenLine,
  'lifecycle/returned': Undo2,
  'lifecycle/state-history': History,
  'lifecycle/lock-record': Lock,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Look up a toolkit icon. Returns undefined for an unknown name rather
 *  than throwing, so a bad key is a missing icon and not a blank screen. */
export function icon(name: IconName): LucideIcon {
  return ICONS[name];
}

/**
 * The four glyphs the toolkit names one way and lucide-react 0.344 names
 * another. Listed so an upgrade has a checklist rather than a search.
 * Left as data, not a comment, because a comment would not survive the
 * next person's find-and-replace.
 */
export const RENAMED_SINCE_TOOLKIT: ReadonlyArray<{
  toolkit: string; here: string; icons: IconName[];
}> = [
  { toolkit: 'circle-check', here: 'CheckCircle',    icons: ['nav/my-policies'] },
  { toolkit: 'ellipsis',     here: 'MoreHorizontal', icons: ['action/more'] },
  { toolkit: 'circle-help',  here: 'HelpCircle',     icons: ['action/help'] },
  { toolkit: 'lock-open',    here: 'Unlock',         icons: ['access/unlocked'] },
];

/**
 * Icons whose drawing is NOT the one the toolkit specifies, because no
 * equivalent exists at this Lucide version. Each is a visible difference
 * from the design and should be revisited on an upgrade.
 */
export const APPROXIMATED: ReadonlyArray<{
  name: IconName; wanted: string; using: string; why: string;
}> = [
  {
    name: 'lifecycle/signature',
    wanted: 'signature',
    using: 'PenLine',
    why: 'lucide-react 0.344 has no signature glyph under any name. PenLine is the nearest in the same family; it is a substitution, not a match.',
  },
];

/**
 * Status colours, from the toolkit's Status section. Each state pairs a
 * colour with a DISTINCT SHAPE, so states stay legible in greyscale and
 * to colour-blind readers — which is why quarantined/on-hold is an
 * octagon rather than another coloured circle.
 *
 * The toolkit marks this mapping PROPOSED, pending Brand Design's
 * confirmation under Week 2 item 01, so treat the hexes as provisional.
 * An icon never carries state alone: always pair it with a label.
 */
export const STATUS_ICONS = {
  /** Compliant · released · approved */
  released:    { icon: CheckCircle,  colour: '#12A05A', token: 'status/success' },
  /** Due soon · pending · awaiting */
  pending:     { icon: Clock,        colour: '#F08128', token: 'status/warning' },
  /** Overdue · at risk */
  overdue:     { icon: ShieldAlert,  colour: '#C62F1E', token: 'status/danger'  },
  /** Failed · rejected */
  rejected:    { icon: Ban,          colour: '#C62F1E', token: 'status/danger'  },
  /** Quarantined · on hold — an OCTAGON, which is the whole point of the
   *  section: it must not be another coloured circle, and it must not
   *  reuse the reject glyph either. */
  on_hold:     { icon: AlertOctagon, colour: '#183470', token: 'status/info'    },
  /** Draft · not started */
  draft:       { icon: MoreHorizontal, colour: '#6E6E73', token: 'status/neutral' },
  /** Information · guidance */
  info:        { icon: HelpCircle,   colour: '#183470', token: 'status/info'    },
} as const;

export type StatusKey = keyof typeof STATUS_ICONS;
