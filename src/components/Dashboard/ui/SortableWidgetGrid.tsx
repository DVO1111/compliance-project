import { useState } from "react";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    type DragStartEvent,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    rectSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { WidgetConfig } from "../../../hooks/useDashboardLayout";

/* ── Sortable Item Wrapper ─────────────────────── */

function SortableWidget({
    widget,
    isDragOverlay,
}: {
    widget: WidgetConfig;
    isDragOverlay?: boolean;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: widget.id });

    let colClass = "col-span-12"; // Mobile default
    if (widget.colSpan === 3) {
        colClass += " md:col-span-12 xl:col-span-12";
    } else if (widget.colSpan === 2) {
        colClass += " md:col-span-12 xl:col-span-8"; // Tablet full width, Desktop 2/3
    } else {
        colClass += " md:col-span-6 xl:col-span-4"; // Tablet half width, Desktop 1/3
    }

    const style = isDragOverlay
        ? {}
        : {
            transform: CSS.Transform.toString(transform),
            transition,
        };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative group/drag ${colClass} ${isDragging ? "opacity-30 scale-[0.98]" : ""
                } ${isDragOverlay ? "opacity-95 shadow-2xl scale-[1.02] rotate-1" : ""}`}
        >
            {/* Drag Handle */}
            <button
                {...attributes}
                {...listeners}
                className="absolute top-2 left-2 z-20 p-1.5 rounded-lg
          bg-[var(--color-surface-alt)] border border-[var(--color-border)]
          opacity-0 group-hover/drag:opacity-100 transition-all duration-200
          hover:bg-[var(--color-border)] cursor-grab active:cursor-grabbing
          shadow-sm"
                title="Drag to reorder"
                aria-label="Drag to reorder widget"
            >
                <GripVertical className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
            </button>

            {widget.render()}
        </div>
    );
}

/* ── Grid Container ────────────────────────────── */

interface SortableWidgetGridProps {
    widgets: WidgetConfig[];
    onMove: (activeId: string, overId: string) => void;
}

export default function SortableWidgetGrid({
    widgets,
    onMove,
}: SortableWidgetGridProps) {
    const [activeWidget, setActiveWidget] = useState<WidgetConfig | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        const found = widgets.find((w) => w.id === String(event.active.id));
        setActiveWidget(found ?? null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveWidget(null);
        if (over && active.id !== over.id) {
            onMove(String(active.id), String(over.id));
        }
    };

    const gridCols = "grid-cols-12 items-stretch";

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <SortableContext
                items={widgets.map((w) => w.id)}
                strategy={rectSortingStrategy}
            >
                <div className={`grid ${gridCols} gap-4`}>
                    {widgets.map((widget) => (
                        <SortableWidget key={widget.id} widget={widget} />
                    ))}
                </div>
            </SortableContext>

            <DragOverlay dropAnimation={null}>
                {activeWidget ? (
                    <SortableWidget widget={activeWidget} isDragOverlay />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
