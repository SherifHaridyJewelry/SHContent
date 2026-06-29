import { ReactNode } from "react"
import { Button } from "@/components/ui/button"

interface SelectionBarProps {
  count: number
  children?: ReactNode
  onClearAll?: () => void
  onSelectAllOnPage?: () => void
  selectAllLabel?: string
  actions?: ReactNode
}

export default function SelectionBar({
  count,
  children,
  onClearAll,
  onSelectAllOnPage,
  selectAllLabel = "Select all on page",
  actions,
}: SelectionBarProps) {
  if (count === 0) return null

  return (
    <div className="card flex flex-wrap items-center gap-2 selection-bar" style={{ marginBottom: "1rem" }}>
      <span className="text-sm font-medium">{count} selected</span>
      {children}
      {onSelectAllOnPage && (
        <Button type="button" variant="outline" size="sm" onClick={onSelectAllOnPage}>
          {selectAllLabel}
        </Button>
      )}
      {onClearAll && (
        <Button type="button" variant="secondary" size="sm" onClick={onClearAll}>
          Clear all
        </Button>
      )}
      {actions && <div className="ml-auto flex gap-2 items-center flex-wrap">{actions}</div>}
    </div>
  )
}
