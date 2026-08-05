import { useCallback, useEffect, useMemo, useState } from "react";
import { api, Product, ProductType } from "../api";
import CollectionPicker, { resolveCollectionValue } from "./CollectionPicker";
import {
  nameFromFilename,
  suggestName,
  suggestNextId,
} from "../lib/productTypes";
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { typeLabel, PRODUCT_TYPES } from "../lib/productTypes"

const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i;

export type BatchMode = "one_per_file" | "one_per_folder";

export interface BatchPreviewRow {
  key: string;
  label: string;
  imageCount: number;
  id: string;
  name: string;
  files: File[];
}

function groupFiles(files: File[], mode: BatchMode): Map<string, File[]> {
  const groups = new Map<string, File[]>();
  for (const file of files) {
    if (!IMAGE_RE.test(file.name)) continue;
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const normalized = rel.replace(/\\/g, "/");
    let key: string;
    if (mode === "one_per_folder" && normalized.includes("/")) {
      key = normalized.split("/")[0];
    } else {
      key = normalized.split("/").pop() || file.name;
    }
    const list = groups.get(key) ?? [];
    list.push(file);
    groups.set(key, list);
  }
  return groups;
}

function buildPreviewRows(
  files: File[],
  mode: BatchMode,
  productType: ProductType,
  existingIds: string[]
): BatchPreviewRow[] {
  const groups = groupFiles(files, mode);
  const reserved = new Set(existingIds);
  const rows: BatchPreviewRow[] = [];

  for (const [key, groupFiles] of [...groups.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const id = suggestNextId([...reserved], productType);
    reserved.add(id);
    const fallback = suggestName(productType, id);
    const name =
      mode === "one_per_folder"
        ? nameFromFilename(key, fallback)
        : fallback;
    rows.push({
      key,
      label: mode === "one_per_folder" ? key : groupFiles[0].name,
      imageCount: groupFiles.length,
      id,
      name,
      files: groupFiles,
    });
  }
  return rows;
}

interface BatchImportProps {
  collections: string[];
  existingIds: string[];
  defaultType?: ProductType;
  defaultCollection?: string;
  onCreated: (products: Product[]) => void;
  onError: (message: string) => void;
}

export default function BatchImport({
  collections,
  existingIds,
  defaultType = "ring",
  defaultCollection = "",
  onCreated,
  onError,
}: BatchImportProps) {
  const [productType, setProductType] = useState<ProductType>(defaultType);
  const [collectionSelect, setCollectionSelect] = useState(
    defaultCollection || (collections[0] ?? "")
  );
  const [newCollection, setNewCollection] = useState("");
  const [mode, setMode] = useState<BatchMode>("one_per_file");
  const [rows, setRows] = useState<BatchPreviewRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const allFiles = useMemo(() => rows.flatMap((r) => r.files), [rows]);

  const duplicateIds = useMemo(() => {
    const taken = new Set(existingIds.map((id) => id.toLowerCase()));
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const row of rows) {
      const id = row.id.trim().toLowerCase();
      if (!id) continue;
      if (taken.has(id) || seen.has(id)) dups.add(row.id.trim());
      seen.add(id);
    }
    return dups;
  }, [rows, existingIds]);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const files = Array.from(fileList);
      setRows(buildPreviewRows(files, mode, productType, existingIds));
    },
    [mode, productType, existingIds]
  );

  const updateRow = (key: string, field: "id" | "name", value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
    );
  };

  const rebuildPreview = useCallback(() => {
    if (!allFiles.length) return;
    const dt = new DataTransfer();
    allFiles.forEach((f) => dt.items.add(f));
    setRows(buildPreviewRows([...dt.files], mode, productType, existingIds));
  }, [allFiles, mode, productType, existingIds]);

  useEffect(() => {
    if (!rows.length) return;
    rebuildPreview();
    // Re-suggest IDs when type/mode/known IDs change; keep files.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when those inputs change
  }, [mode, productType, existingIds]);

  async function submit() {
    const collection = resolveCollectionValue(collectionSelect, newCollection);
    if (!collection) {
      onError("Collection is required");
      return;
    }
    if (!rows.length) {
      onError("Add images first");
      return;
    }
    if (duplicateIds.size) {
      onError(
        `Duplicate id: ${Array.from(duplicateIds).join("; Duplicate id: ")}. Click Refresh IDs or edit them.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("type", productType);
      fd.append("collection", collection);
      fd.append("mode", mode);
      fd.append("assign_anchor", "true");
      fd.append(
        "overrides",
        JSON.stringify(rows.map((r) => ({ key: r.key, id: r.id, name: r.name })))
      );
      for (const row of rows) {
        for (const file of row.files) {
          fd.append("files", file);
          const rel =
            (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
          fd.append("paths", rel);
        }
      }
      const result = await api.batchCreateProducts(fd);
      if (result.errors.length) {
        onError(result.errors.join("; "));
      }
      if (result.created.length) {
        onCreated(result.created);
        setRows([]);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Batch create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="batch-import card">
      <h3>Batch import</h3>
      <p className="text-muted-foreground text-sm mb-4">
        Set type and collection once, then drop multiple images or a folder of product subfolders.
        IDs and names are suggested automatically.
      </p>

      <div className="form-row">
        <div>
          <Label className="mb-1 block">Type</Label>
          <Select
            value={productType}
            onValueChange={(v) => setProductType(v as ProductType)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CollectionPicker
          collections={collections}
          value={collectionSelect}
          onChange={setCollectionSelect}
          newValue={newCollection}
          onNewValueChange={setNewCollection}
          required
        />
      </div>

      <div className="batch-mode-toggle mb-4 space-y-2">
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as BatchMode)}
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="one_per_file" id="batch-one-per-file" />
            <Label htmlFor="batch-one-per-file" className="font-normal cursor-pointer">
              One image = one product
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="one_per_folder" id="batch-one-per-folder" />
            <Label htmlFor="batch-one-per-folder" className="font-normal cursor-pointer">
              One folder = one product
            </Label>
          </div>
        </RadioGroup>
        {rows.length > 0 && (
          <Button variant="secondary" size="sm" onClick={rebuildPreview}>
            Refresh IDs
          </Button>
        )}
      </div>

      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        <p style={{ marginBottom: "0.75rem" }}>Drag &amp; drop images here, or</p>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Button asChild variant="secondary" className="cursor-pointer">
            <label>
              Select images
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
          </Button>
          {mode === "one_per_folder" && (
            <Button asChild variant="secondary" className="cursor-pointer">
              <label>
                Select folder
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  // @ts-expect-error non-standard directory picker attribute
                  webkitdirectory=""
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </label>
            </Button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <table style={{ marginTop: "1rem" }}>
            <thead>
              <tr>
                <th>Source</th>
                <th>Images</th>
                <th>ID</th>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isDup = duplicateIds.has(row.id.trim());
                return (
                <tr key={row.key}>
                  <td style={{ fontSize: "0.8rem" }}>{row.label}</td>
                  <td>{row.imageCount}</td>
                  <td>
                    <Input
                      value={row.id}
                      onChange={(e) => updateRow(row.key, "id", e.target.value)}
                      className={`w-full min-w-[100px]${isDup ? " border-destructive" : ""}`}
                      aria-invalid={isDup}
                    />
                    {isDup && (
                      <p className="m-0 mt-1 text-xs text-destructive">ID already used</p>
                    )}
                  </td>
                  <td>
                    <Input
                      value={row.name}
                      onChange={(e) => updateRow(row.key, "name", e.target.value)}
                      className="w-full min-w-[120px]"
                    />
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
          {duplicateIds.size > 0 && (
            <p className="mt-2 text-sm text-destructive">
              Fix duplicate IDs or click Refresh IDs before creating.
            </p>
          )}
          <Button
            type="button"
            className="mt-4"
            disabled={submitting || duplicateIds.size > 0}
            onClick={submit}
          >
            {submitting ? "Creating…" : `Create ${rows.length} product(s)`}
          </Button>
        </>
      )}
    </div>
  );
}
