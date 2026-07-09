import ProductTypeTabs from "./ProductTypeTabs";
import { ProductStatus, ProductType } from "../api";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES: (ProductStatus | "")[] = ["", "draft", "ready", "generated"];

interface ProductFilterBarProps {
  typeFilter: ProductType | "";
  onTypeChange: (type: ProductType | "") => void;
  collectionFilter: string;
  onCollectionChange: (collection: string) => void;
  collections: string[];
  statusFilter?: ProductStatus | "";
  onStatusChange?: (status: ProductStatus | "") => void;
  typeCounts?: Record<string, number>;
  typeTotal?: number;
  showStatus?: boolean;
}

export default function ProductFilterBar({
  typeFilter,
  onTypeChange,
  collectionFilter,
  onCollectionChange,
  collections,
  statusFilter = "",
  onStatusChange,
  typeCounts,
  typeTotal,
  showStatus = true,
}: ProductFilterBarProps) {
  return (
    <div className="mb-6 space-y-4">
      <ProductTypeTabs
        value={typeFilter}
        onChange={onTypeChange}
        counts={typeCounts}
        total={typeTotal}
      />
      <div className="card filter-panel flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide">
            Collection
          </Label>
          <Select
            value={collectionFilter || "all"}
            onValueChange={(v) => onCollectionChange(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All collections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All collections</SelectItem>
              {collections.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showStatus && onStatusChange && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide">
              Status
            </Label>
            <Select
              value={statusFilter || "all"}
              onValueChange={(v) =>
                onStatusChange(v === "all" ? "" : (v as ProductStatus))
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s || "all"} value={s || "all"}>
                    {s || "All statuses"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
