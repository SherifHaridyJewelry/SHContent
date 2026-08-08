import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const NEW_COLLECTION = "__new__";

interface CollectionPickerProps {
  collections: string[];
  value: string;
  onChange: (collection: string) => void;
  newValue: string;
  onNewValueChange: (value: string) => void;
  label?: string;
  required?: boolean;
  allowEmpty?: boolean;
  fullWidth?: boolean;
}

export function resolveCollectionValue(
  selection: string,
  newValue: string
): string | undefined {
  if (selection === NEW_COLLECTION) {
    const trimmed = newValue.trim();
    return trimmed || undefined;
  }
  return selection || undefined;
}

export default function CollectionPicker({
  collections,
  value,
  onChange,
  newValue,
  onNewValueChange,
  label = "Collection",
  required = false,
  allowEmpty = false,
  fullWidth = false,
}: CollectionPickerProps) {
  const isNew = value === NEW_COLLECTION;
  const selectValue = value || (allowEmpty ? "__empty__" : "__placeholder__");

  return (
    <div className={cn("collection-picker", fullWidth && "collection-picker--full")}>
      <div className={fullWidth ? "w-full" : undefined}>
        <Label className="mb-1 block">
          {label}
          {required && " *"}
        </Label>
        <Select
          value={selectValue}
          onValueChange={(v) => {
            if (v === "__empty__") onChange("");
            else if (v === "__placeholder__") onChange("");
            else onChange(v);
          }}
        >
          <SelectTrigger className={fullWidth ? "w-full" : "w-[200px]"}>
            <SelectValue placeholder="Select collection…" />
          </SelectTrigger>
          <SelectContent>
            {allowEmpty && <SelectItem value="__empty__">— None —</SelectItem>}
            {!allowEmpty && !value && (
              <SelectItem value="__placeholder__" disabled>
                Select collection…
              </SelectItem>
            )}
            {collections.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
            <SelectItem value={NEW_COLLECTION}>— New collection —</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isNew && (
        <div className={cn("mt-2", fullWidth && "w-full")}>
          <Label className="mb-1 block">New collection name</Label>
          <Input
            required={required}
            value={newValue}
            onChange={(e) => onNewValueChange(e.target.value)}
            placeholder="e.g. Zahya"
            className={fullWidth ? "w-full" : undefined}
          />
        </div>
      )}
    </div>
  );
}

export { NEW_COLLECTION };
