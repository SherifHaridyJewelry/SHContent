import { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface SelectionBarProps {
  count: number;
  children?: ReactNode;
  onClearAll?: () => void;
  onSelectAllOnPage?: () => void;
  selectAllLabel?: string;
  actions?: ReactNode;
}

export default function SelectionBar({
  count,
  children,
  onClearAll,
  onSelectAllOnPage,
  selectAllLabel = "Select all on page",
  actions,
}: SelectionBarProps) {
  if (count === 0) return null;

  return (
    <div className="card selection-bar flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold tabular-nums">{count} selected</span>
      {children && (
        <div className="flex max-w-full flex-wrap items-center gap-1.5">
          {children}
        </div>
      )}
      {onSelectAllOnPage && (
        <Button type="button" variant="outline" size="sm" onClick={onSelectAllOnPage}>
          {selectAllLabel}
        </Button>
      )}
      {onClearAll && (
        <Button type="button" variant="secondary" size="sm" onClick={onClearAll}>
          Clear
        </Button>
      )}
      {actions && (
        <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
