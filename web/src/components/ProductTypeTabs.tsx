import type { ProductType } from "../api";
import { PRODUCT_TYPES, typeLabel } from "../lib/productTypes";
import { Button } from "@/components/ui/button"

interface ProductTypeTabsProps {
  value: ProductType | "";
  onChange: (type: ProductType | "") => void;
  counts?: Record<string, number>;
  total?: number;
}

export default function ProductTypeTabs({
  value,
  onChange,
  counts,
  total,
}: ProductTypeTabsProps) {
  return (
    <div className="type-tabs" role="tablist">
      <Button
        type="button"
        role="tab"
        variant="outline"
        size="sm"
        className={`type-tab ${value === "" ? "active" : ""}`}
        aria-selected={value === ""}
        onClick={() => onChange("")}
      >
        All
        {total !== undefined && <span className="type-tab-count">{total}</span>}
      </Button>
      {PRODUCT_TYPES.map((t) => (
        <Button
          key={t}
          type="button"
          role="tab"
          variant="outline"
          size="sm"
          className={`type-tab ${value === t ? "active" : ""}`}
          aria-selected={value === t}
          onClick={() => onChange(t)}
        >
          {typeLabel(t)}
          {counts && counts[t] !== undefined && (
            <span className="type-tab-count">{counts[t]}</span>
          )}
        </Button>
      ))}
    </div>
  );
}
