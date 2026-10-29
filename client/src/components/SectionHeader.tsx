import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * SectionHeader — one consistent header for every content section.
 * Icon + pixel-font title on the left, optional meta/actions on the right.
 */
export default function SectionHeader({
  icon: Icon,
  title,
  meta,
}: {
  icon?: LucideIcon;
  title: string;
  meta?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-4 h-4 text-primary shrink-0" />}
        <h2
          className="text-sm font-bold uppercase tracking-wider truncate"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h2>
      </div>
      {meta && <div className="text-xs text-muted-foreground shrink-0">{meta}</div>}
    </div>
  );
}
