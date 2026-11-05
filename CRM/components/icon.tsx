import { ICONS } from "@/lib/icons-data";
import { EXTRA_ICONS } from "@/lib/icons-extra";

/** Jobber Atlantis icons (MIT, see lib/ICONS-LICENSE.txt) plus a few drawn to match. Draws nothing for an unknown name. */
export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const ic = ICONS[name] ?? EXTRA_ICONS[name];
  if (!ic) return null;
  return (
    <svg className={className ? `ic ${className}` : "ic"} width={size} height={size} viewBox={ic.vb} fill="currentColor" aria-hidden="true">
      {ic.paths.map((p, i) =>
        p.stroke ? (
          <path key={i} d={p.d} transform={p.transform} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path key={i} d={p.d} transform={p.transform} />
        ),
      )}
    </svg>
  );
}
