import { cn } from "@/lib/utils"

export function selectableRowClass(selected: boolean, className?: string) {
  return cn(
    "selectable-row",
    selected && "selectable-row--selected",
    className
  )
}

export function selectableCardClass(selected: boolean, className?: string) {
  return cn(
    "selectable-card",
    selected && "selectable-card--selected",
    className
  )
}
