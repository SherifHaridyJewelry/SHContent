import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  position?: "top" | "bottom" | "both";
}

function PaginationBar({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [12, 24, 48],
}: PaginationProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="pagination flex items-center justify-between flex-wrap gap-3">
      <span className="text-sm text-muted-foreground">
        {total === 0 ? "No items" : `${start}–${end} of ${total}`}
      </span>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Prev
        </Button>
        <span className="text-sm">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default function Pagination(props: PaginationProps) {
  const { position = "top" } = props;
  const showTop = position === "top" || position === "both";
  const showBottom = position === "bottom" || position === "both";

  return (
    <>
      {showTop && <PaginationBar {...props} />}
      {showTop && showBottom && <div className="h-3" />}
      {showBottom && <PaginationBar {...props} />}
    </>
  );
}
