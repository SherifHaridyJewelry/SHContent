import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  ImportFolderInfo,
  Product,
  ProductType,
} from "../api";
import BatchImport from "./BatchImport";
import CollectionPicker, {
  NEW_COLLECTION,
  resolveCollectionValue,
} from "./CollectionPicker";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderOpen, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type ImportTab = "batch" | "disk" | "single";

const TABS: { id: ImportTab; label: string; short: string }[] = [
  { id: "batch", label: "Batch upload", short: "Upload" },
  { id: "disk", label: "Disk folders", short: "Disk" },
  { id: "single", label: "Single product", short: "Single" },
];

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
  const [localError, setLocalError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

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
    setLocalError(null);
    setTab("batch");
    const initialCollection =
      collections[0] ?? NEW_COLLECTION;
    setForm((f) => ({
      ...f,
      collectionSelect: f.collectionSelect || initialCollection,
      newCollection: "",
    }));
    setImportCollectionSelect((prev) => prev || initialCollection);
    setImportNewCollection("");
    clearOrphanSelection();
  }, [open, collections, clearOrphanSelection]);

  const suggestedId = useMemo(
    () => suggestNextId(existingIds, form.type),
    [existingIds, form.type]
  );
  const suggestedName = useMemo(() => {
    const fb = suggestName(form.type, suggestedId);
    return form.name ? nameFromFilename(form.name, fb) : fb;
  }, [form.type, form.name, suggestedId]);

  function reportError(msg: string) {
    setLocalError(msg);
    onError(msg);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const collection = resolveCollectionValue(form.collectionSelect, form.newCollection);
    if (!collection) {
      reportError("Choose a collection or enter a new collection name.");
      return;
    }
    setCreating(true);
    setLocalError(null);
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
      reportError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleImportOrphans() {
    const collection = resolveCollectionValue(
      importCollectionSelect,
      importNewCollection
    );
    if (!collection) {
      reportError("Choose a collection or enter a new collection name.");
      return;
    }
    if (!selectedOrphans.size) return;
    setImporting(true);
    setLocalError(null);
    try {
      const result = await api.importFolders({
        folder_ids: Array.from(selectedOrphans),
        type: importType,
        collection,
      });
      if (result.errors.length) reportError(result.errors.join("; "));
      if (result.created.length) {
        clearOrphanSelection();
        onCreated(result.created);
        onImported();
        onOpenChange(false);
      }
    } catch (err) {
      reportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="import-dialog flex max-h-[min(92dvh,900px)] w-[calc(100vw-1.5rem)] max-w-2xl min-w-0 flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 pb-3 pt-5 pr-12 text-left sm:px-6 sm:pt-6">
          <DialogTitle>Import products</DialogTitle>
          <DialogDescription>
            Upload photos, register folders on disk, or create an empty SKU.
          </DialogDescription>
        </DialogHeader>

        <div
          className="import-tabs shrink-0 grid grid-cols-3 gap-1 border-b border-border bg-muted/40 p-2"
          role="tablist"
          aria-label="Import method"
        >
          {TABS.map((t) => {
            const count =
              t.id === "disk" && orphans.length > 0 ? orphans.length : null;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={cn(
                  "import-tab rounded-md px-2 py-2.5 text-center text-sm font-medium transition-colors",
                  tab === t.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  setTab(t.id);
                  setLocalError(null);
                }}
              >
                <span className="sm:hidden">
                  {t.short}
                  {count != null ? ` (${count})` : ""}
                </span>
                <span className="hidden sm:inline">
                  {t.label}
                  {count != null ? ` (${count})` : ""}
                </span>
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {localError && (
            <div
              className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {localError}
            </div>
          )}

          {tab === "batch" && (
            <BatchImport
              collections={collections}
              existingIds={existingIds}
              defaultType={form.type}
              defaultCollection={collections[0] ?? NEW_COLLECTION}
              onCreated={(created) => {
                onCreated(created);
                onOpenChange(false);
              }}
              onError={reportError}
            />
          )}

          {tab === "disk" && (
            <div className="space-y-4">
              {orphans.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No unregistered folders in <code className="text-xs">raw/jewelry/</code>.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Drop product folders on the server, or use Batch upload instead.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Folders on disk that are not in the product library yet.
                  </p>
                  <div className="grid gap-3">
                    <div className="space-y-1.5">
                      <Label>Type</Label>
                      <Select
                        value={importType}
                        onValueChange={(v) => setImportType(v as ProductType)}
                      >
                        <SelectTrigger className="w-full">
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
                      fullWidth
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
                  <ul className="m-0 max-h-64 list-none space-y-1 overflow-y-auto p-0">
                    {orphans.map((o) => {
                      const isOrphanSelected = selectedOrphans.has(o.folder_id);
                      return (
                        <li key={o.folder_id}>
                          <button
                            type="button"
                            className={selectableRowClass(
                              isOrphanSelected,
                              "flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-left text-sm"
                            )}
                            onClick={() => toggleOrphan(o.folder_id)}
                          >
                            <Checkbox checked={isOrphanSelected} tabIndex={-1} aria-hidden />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {o.folder_id}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {o.image_count} images
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <DialogFooter className="gap-2 border-0 p-0 sm:justify-stretch">
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      disabled={!selectedOrphans.size || importing}
                      onClick={handleImportOrphans}
                    >
                      <FolderOpen className="mr-2 h-4 w-4" />
                      {importing
                        ? "Importing…"
                        : `Import ${selectedOrphans.size || ""} folder${selectedOrphans.size === 1 ? "" : "s"}`}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}

          {tab === "single" && (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="import-product-name">Display name (optional)</Label>
                  <Input
                    id="import-product-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={suggestedName}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm({ ...form, type: v as ProductType })}
                  >
                    <SelectTrigger className="w-full">
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
                  fullWidth
                />
              </div>
              <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                Will create: <strong className="text-foreground">{suggestedId}</strong> —{" "}
                {suggestedName}
              </p>
              <DialogFooter className="gap-2 border-0 p-0 sm:justify-stretch">
                <Button type="submit" className="w-full sm:w-auto" disabled={creating}>
                  <Plus className="mr-2 h-4 w-4" />
                  {creating ? "Creating…" : "Create product"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
