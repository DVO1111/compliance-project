import { useCallback, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";

/* ── Types ─────────────────────────────────────── */

export interface WidgetConfig {
  /** Unique stable id for this widget */
  id: string;
  /** How many columns this widget takes (out of 3) */
  colSpan: 1 | 2 | 3;
  /** Render function – receives no props since each widget manages its own data */
  render: () => React.ReactNode;
}

/* ── Helpers ─────────────────────────────────────── */

function storageKey(role: string) {
  return `dashboard-layout-${role}`;
}

function loadOrder(role: string): string[] | null {
  try {
    const raw = localStorage.getItem(storageKey(role));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveOrder(role: string, order: string[]) {
  try {
    localStorage.setItem(storageKey(role), JSON.stringify(order));
  } catch {
    // localStorage quota exceeded – silently ignore
  }
}

/* ── Hook ─────────────────────────────────────── */

export function useDashboardLayout(
  role: string,
  defaultWidgets: WidgetConfig[]
) {
  const defaultOrder = defaultWidgets.map((w) => w.id);

  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => {
    const saved = loadOrder(role);
    if (!saved) return defaultOrder;

    // Merge: keep saved order for IDs that still exist, append new ones
    const validIds = new Set(defaultOrder);
    const ordered = saved.filter((id) => validIds.has(id));
    const newIds = defaultOrder.filter((id) => !ordered.includes(id));
    return [...ordered, ...newIds];
  });

  const orderedWidgets: WidgetConfig[] = widgetOrder
    .map((id) => defaultWidgets.find((w) => w.id === id))
    .filter(Boolean) as WidgetConfig[];

  const moveWidget = useCallback(
    (activeId: string, overId: string) => {
      setWidgetOrder((prev) => {
        const oldIndex = prev.indexOf(activeId);
        const newIndex = prev.indexOf(overId);
        if (oldIndex === -1 || newIndex === -1) return prev;
        const next = arrayMove(prev, oldIndex, newIndex);
        saveOrder(role, next);
        return next;
      });
    },
    [role]
  );

  const resetLayout = useCallback(() => {
    localStorage.removeItem(storageKey(role));
    setWidgetOrder(defaultOrder);
  }, [role, defaultOrder]);

  return { orderedWidgets, widgetOrder, moveWidget, resetLayout };
}
