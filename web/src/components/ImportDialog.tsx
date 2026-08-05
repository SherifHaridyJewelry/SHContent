import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  ImportFolderInfo,
  Product,
  ProductType,
} from "../api";
import BatchImport from "./BatchImport";
import CollectionPicker, { resolveCollectionValue } from "./CollectionPicker";
import SelectionBar from "./SelectionBar";
import { useSelectionSet } from "../hooks/useSelectionSet";
import {
  nameFromFilename,
  PRODUCT_TYPES,
  suggestName,
  suggestNextId,
  typeLabel,
} from "../lib/productTypes";
import { selectableRowClass } from "../lib/selectionStyles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderOpen, Plus } from "lucide-react";

type ImportTab = "batch" | "disk" | "single";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: string[];
  existingIds: string[];
  orphans: ImportFolderInfo[];
  onCreated: (products: Product[]) => void;
  onError: (msg: string) => void;
  onImported: () => void;
}

export default function ImportDialog({
  open,
  onOpenChange,
  collections,
  existingIds,
  orphans,
  onCreated,
  onError,
  onImported,
}: ImportDialogProps) {
  const [tab, setTab] = useState<ImportTab>("batch");

  const [form, setForm] = useState({
    name: "",
    type: "ring" as ProductType,
    collectionSelect: "",
    newCollection: "",
  });

  const [importType, setImportType] = useState<ProductType>("ring");
  const [importCollectionSelect, setImportCollectionSelect] = useState("");
  const [importNewCollection, setImportNewCollection] = useState("");
  const {
    selected: selectedOrphans,
    toggle: toggleOrphan,
    toggleAll: toggleAllOrphans,
    clear: clearOrphanSelection,
  } = useSelectionSet<string>();

  useEffect(() => {
    if (!open) return;
    if (collections.length && !form.collectionSelect) {
      setForm((f) => ({ ...f, collectionSelect: collections[0] }));
      setImportCollectionSelect(collections[0]);
    }
  }, [open, collections, form.collectionSelect]);

  const suggestedId = useMemo(
    () => suggestNextId(existingIds, form.type),
    [existingIds, form.type]
  );
  const suggestedName = useMemo(() => {
    const fb = suggestName(form.type, suggestedId);
    return form.name ? nameFromFilename(form.name, fb) : fb;
  }, [form.type, form.name, suggestedId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const collection = resolveCollectionValue(form.collectionSelect, form.newCollection);
    if (!collection) {
      onError("Collection is required");
      return;
    }
    try {
      const p = await api.createProduct({
        id: suggestedId,
        name: suggestedName,
        type: form.type,
        collection,
      });
      setForm({
        name: "",
        type: form.type,
        collectionSelect: form.collectionSelect,
        newCollection: "",
      });
      onCreated([p]);
      onOpenChange(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function handleImportOrphans() {
    const collection = resolveCollectionValue(
      importCollectionSelect,
      importNewCollection
    );
    if (!collection) {
      onError("Collection is required for import");
      return;
    }
    if (!selectedOrphans.size) return;
    try {
      const result = await api.importFolders({
        folder_ids: Array.from(selectedOrphans),
        type: importType,
        collection,
      });
      if (result.errors.length) onError(result.errors.join("; "));
      if (result.created.length) {
        clearOrphanSelection();
        onCreated(result.created);
        onImported();
        onOpenChange(false);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Import failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import products</DialogTitle>
          <DialogDescription>
            Batch upload photos, import folders from disk, or create a single SKU.
          </DialogDescription>
        </DialogHeader>

        <div className="studio-tabs mb-4">
          <button
            type="button"
            className={tab === "batch" ? "studio-tab active" : "studio-tab"}
            onClick={() => setTab("batch")}
          >
            Batch upload
          </button>
          <button
            type="button"
            className={tab === "disk" ? "studio-tab active" : "studio-tab"}
            onClick={() => setTab("disk")}
          >
            Disk folders{orphans.length > 0 ? ` (${orphans.length})` : ""}
          </button>
          <button
            type="button"
            className={tab === "single" ? "studio-tab active" : "studio-tab"}
            onClick={() => setTab("single")}
          >
            Single product
          </button>
        </div>

        {tab === "batch" && (
          <BatchImport
            collections={collections}
            existingIds={existingIds}
            defaultType={form.type}
            defaultCollection={collections[0]}
            onCreated={(created) => {
              onCreated(created);
              onOpenChange(false);
            }}
            onError={onError}
          />
        )}

        {tab === "disk" && (
          <div>
            {orphans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No unregistered folders in raw/jewelry/.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted-foreground">
                  Folders in raw/jewelry/ not yet in the product library.
                </p>
                <div className="mb-3 flex flex-wrap items-end gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Type</label>
                    <Select
                      value={importType}
                      onValueChange={(v) => setImportType(v as ProductType)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {typeLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <CollectionPicker
                    collections={collections}
                    value={importCollectionSelect}
                    onChange={setImportCollectionSelect}
                    newValue={importNewCollection}
                    onNewValueChange={setImportNewCollection}
                    required
                  />
                </div>
                {orphans.length > 1 && (
                  <SelectionBar
                    count={selectedOrphans.size}
                    onClearAll={clearOrphanSelection}
                    onSelectAllOnPage={() =>
                      toggleAllOrphans(orphans.map((o) => o.folder_id))
                    }
                    selectAllLabel="Select all folders"
                  />
                )}
                <ul className="list-none p-0">
                  {orphans.map((o) => {
                    const isOrphanSelected = selectedOrphans.has(o.folder_id);
                    return (
                      <li key={o.folder_id} className="mb-1">
                        <button
                          type="button"
                          className={selectableRowClass(
                            isOrphanSelected,
                            "flex w-full items-center gap-2 rounded-md border-none bg-transparent px-2 py-1.5 text-left text-sm"
                          )}
                          onClick={() => toggleOrphan(o.folder_id)}
                        >
                          <Checkbox checked={isOrphanSelected} tabIndex={-1} aria-hidden />
                          <span>
                            {o.folder_id} ({o.image_count} images)
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  type="button"
                  disabled={!selectedOrphans.size}
                  onClick={handleImportOrphans}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Import {selectedOrphans.size || ""} folder(s)
                </Button>
              </>
            )}
          </div>
        )}

        {tab === "single" && (
          <form onSubmit={handleCreate}>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="import-product-name">
                  Display name (optional)
                </label>
                <Input
                  id="import-product-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={suggestedName}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Type</label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v as ProductType })}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {typeLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <CollectionPicker
                collections={collections}
                value={form.collectionSelect}
                onChange={(v) => setForm({ ...form, collectionSelect: v })}
                newValue={form.newCollection}
                onNewValueChange={(v) => setForm({ ...form, newCollection: v })}
                required
              />
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Will create: <strong>{suggestedId}</strong> — {suggestedName}
            </p>
            <Button type="submit" variant="secondary">
              <Plus className="mr-2 h-4 w-4" />
              Create product
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
