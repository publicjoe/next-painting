// Shared decorative icons. All are aria-hidden: the parent button carries the accessible name.
interface IconProps {
  className?: string;
}

export function TrashIcon({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

/** Empty-state illustration. Sizing and colour come from the className. */
export function EmptyBoxIcon({ className, strokeWidth = 1 }: IconProps & { strokeWidth?: number }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

/** Six-dot grip, the visual for a drag handle. */
export function GripIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
      {[5, 11].flatMap(x => [3, 8, 13].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.25} />))}
    </svg>
  );
}

/** Three vertical dots, the visual for a row's Move menu button. */
export function MoreIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
      {[3, 8, 13].map(y => <circle key={y} cx={8} cy={y} r={1.25} />)}
    </svg>
  );
}
