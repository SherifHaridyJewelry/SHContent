import { ReactNode } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { selectableCardClass } from "@/lib/selectionStyles"
import { Eye } from "lucide-react"

interface SelectableImageCardProps {
  imageSrc: string
  imageAlt: string
  label: ReactNode
  checked: boolean
  onToggle: () => void
  onPreview?: () => void
  footer?: ReactNode
  actions?: ReactNode
  onImageError?: (e: React.SyntheticEvent<HTMLImageElement>) => void
  className?: string
}

export default function SelectableImageCard({
  imageSrc,
  imageAlt,
  label,
  checked,
  onToggle,
  onPreview,
  footer,
  actions,
  onImageError,
  className,
}: SelectableImageCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "card catalog-card relative cursor-pointer",
        selectableCardClass(checked),
        className
      )}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggle()
        }
      }}
      aria-pressed={checked}
    >
      <div className="flex items-center justify-between gap-2 mb-2 min-h-[18px]">
        <Checkbox
          checked={checked}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none shrink-0"
        />
        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {onPreview && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Preview image"
              onClick={onPreview}
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}
          {actions}
        </div>
      </div>
      <img
        className="thumb"
        src={imageSrc}
        alt={imageAlt}
        onError={onImageError}
      />
      <div className="mt-3 text-base">{label}</div>
      {footer}
    </div>
  )
}
