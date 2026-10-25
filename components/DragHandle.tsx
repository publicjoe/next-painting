import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { GripIcon } from './icons';

interface DragHandleProps {
  /** Spoken name, for example "Drag Orks". */
  label: string;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
}

/**
 * The six-dot grip that starts a drag. Only the grip starts one, and only the
 * grip has touch-action: none, so a finger elsewhere still scrolls the sidebar.
 * At least 24 by 24 CSS px for WCAG 2.2 SC 2.5.8. dnd-kit's attributes give it
 * the keyboard instructions (aria-describedby) and its pressed state.
 */
export function DragHandle({ label, attributes, listeners, setActivatorNodeRef }: DragHandleProps) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      className="inline-flex min-h-6 min-w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-zinc-400 hover:text-zinc-200 active:cursor-grabbing"
    >
      <GripIcon />
    </button>
  );
}
