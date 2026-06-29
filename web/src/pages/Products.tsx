import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  assetUrl,
  ImageRole,
  ImportFolderInfo,
  Product,
  ProductMeta,
  ProductStatus,
  ProductType,
} from "../api";
import BatchImport from "../components/BatchImport";
import CollectionPicker, { resolveCollectionValue } from "../components/CollectionPicker";
import Pagination from "../components/Pagination";
import ProductTypeTabs from "../components/ProductTypeTabs";
import SelectionBar from "../components/SelectionBar";
import { useUrlParams } from "../hooks/useUrlParams";
import { useSelectionSet } from "../hooks/useSelectionSet";
import { selectableCardClass, selectableRowClass } from "../lib/selectionStyles";
import {
  nameFromFilename,
  suggestName,
  suggestNextId,
  typeLabel,
} from "../lib/productTypes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Upload, Image, FolderOpen, Trash2, Save } from "lucide-react";

const ROLES: ImageRole[] = ["anchor", "detail", "analysis_only", "archived"];
const STATUSES: (ProductStatus | "")[] = ["", "draft", "ready", "generated"];
const LIST_DEFAULTS = { page: "1", page_size: "12" };

export default function Products() {
  const { params, setParams } = useUrlParams(LIST_DEFAULTS);
  const page = Number(params.page) || 1;
  const pageSize = Number(params.page_size) || 12;

  const [productData, setProductData] = useState<Awaited<ReturnType<typeof api.listProducts>> | null>(null);
  const [meta, setMeta] = useState<ProductMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    type: "ring" as ProductType,
    collectionSelect: "",
    newCollection: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const products = productData?.items ?? [];

  const [typeFilter, setTypeFilter] = useState<ProductType | "">("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatus | "">("");

  const [form, setForm] = useState({
    name: "",
    type: "ring" as ProductType,
    collectionSelect: "",
    newCollection: "",
  });

  const [orphans, setOrphans] = useState<ImportFolderInfo[]>([]);
  const [importType, setImportType] = useState<ProductType>("ring");
  const [importCollectionSelect, setImportCollectionSelect] = useState("");
  const [importNewCollection, setImportNewCollection] = useState("");
  const {
    selected: selectedOrphans,
    toggle: toggleOrphan,
    toggleAll: toggleAllOrphans,
    clear: clearOrphanSelection,
  } = useSelectionSet<string>();

  const existingIds = useMemo(() => {
    const ids = products.map((p) => p.id);
    if (selected && !ids.includes(selected.id)) ids.push(selected.id);
    return ids;
  }, [products, selected]);
  const collections = meta?.collections ?? [];

  const suggestedId = useMemo(
    () => suggestNextId(existingIds, form.type),
    [existingIds, form.type]
  );
  const suggestedName = useMemo(() => {
    const fb = suggestName(form.type, suggestedId);
    return form.name ? nameFromFilename(form.name, fb) : fb;
  }, [form.type, form.name, suggestedId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, m, scan] = await Promise.all([
        api.listProducts({
          type: typeFilter || undefined,
          collection: collectionFilter || undefined,
          status: statusFilter || undefined,
          page,
          page_size: pageSize,
        }),
        api.getProductMeta(),
        api.scanImportFolders(),
      ]);
      setProductData(prods);
      setMeta(m);
      setOrphans(scan);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, collectionFilter, statusFilter, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (collections.length && !form.collectionSelect) {
      setForm((f) => ({ ...f, collectionSelect: collections[0] }));
      setImportCollectionSelect(collections[0]);
    }
  }, [collections, form.collectionSelect]);

  useEffect(() => {
    if (!selected) return;
    setEditForm({
      name: selected.name,
      type: selected.type,
      collectionSelect: selected.collection && collections.includes(selected.collection)
        ? selected.collection
        : collections[0] ?? "",
      newCollection: selected.collection && !collections.includes(selected.collection)
        ? selected.collection
        : "",
    });
  }, [selected, collections]);

  async function handleSaveProduct() {
    if (!selected) return;
    const collection = resolveCollectionValue(editForm.collectionSelect, editForm.newCollection);
    if (!collection) {
      toast.error("Collection is required");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateProduct(selected.id, {
        name: editForm.name.trim() || selected.name,
        type: editForm.type,
        collection,
      });
      setSelected(updated);
      toast.success("Product updated");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct() {
    if (!selected) return;
    if (!window.confirm(`Delete product "${selected.name}" (${selected.id})? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    try {
      await api.deleteProduct(selected.id);
      setSelected(null);
      toast.success("Product deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteImage(filename: string) {
    if (!selected) return;
    if (!window.confirm(`Delete image "${filename}" from this product?`)) return;
    try {
      const updated = await api.deleteProductImage(selected.id, filename);
      setSelected(updated);
      toast.success("Image deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const collection = resolveCollectionValue(form.collectionSelect, form.newCollection);
    if (!collection) {
      toast.error("Collection is required");
      return;
    }
    try {
      const p = await api.createProduct({
        id: suggestedId,
        name: suggestedName,
        type: form.type,
        collection,
      });
      setForm({ name: "", type: form.type, collectionSelect: form.collectionSelect, newCollection: "" });
      setSelected(p);
      toast.success(`Created ${p.id}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!selected || !files?.length) return;
    try {
      for (const file of Array.from(files)) {
        await api.uploadImage(selected.id, file, "analysis_only");
      }
      const updated = await api.getProduct(selected.id);
      setSelected(updated);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleRoleChange(filename: string, role: ImageRole) {
    if (!selected) return;
    try {
      const updated = await api.updateImageRole(selected.id, filename, role);
      setSelected(updated);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleImportOrphans() {
    const collection = resolveCollectionValue(importCollectionSelect, importNewCollection);
    if (!collection) {
      toast.error("Collection is required for import");
      return;
    }
    if (!selectedOrphans.size) return;
    try {
      const result = await api.importFolders({
        folder_ids: Array.from(selectedOrphans),
        type: importType,
        collection,
      });
      if (result.errors.length) toast.error(result.errors.join("; "));
      if (result.created.length) {
        toast.success(`Imported ${result.created.length} product(s)`);
        setSelected(result.created[0]);
        clearOrphanSelection();
        await load();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  }

  function anchorImage(product: Product) {
    return product.images.find((i) => i.role === "anchor") ?? product.images[0];
  }

  return (
    <div>
      <h2>Products</h2>
      <p className="text-muted-foreground mb-4">
        Upload raw photos, assign one anchor per product, then mark ready for generation.
      </p>
      {error && <p className="error">{error}</p>}
      {success && (
        <p className="success-msg">{success}</p>
      )}

      <ProductTypeTabs
        value={typeFilter}
        onChange={(v) => {
          setTypeFilter(v);
          setParams({ page: "1" });
        }}
        counts={meta?.counts_by_type}
        total={meta?.total}
      />

      <div className="card flex gap-4 items-end flex-wrap" style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <label className="text-sm font-medium mb-1 block">Collection filter</label>
          <Select value={collectionFilter} onValueChange={(v) => {
            setCollectionFilter(v);
            setParams({ page: "1" });
          }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All collections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All collections</SelectItem>
              {collections.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Status</label>
          <Select value={statusFilter} onValueChange={(v) => {
            setStatusFilter(v as ProductStatus | "");
            setParams({ page: "1" });
          }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s || "all"} value={s}>{s || "All statuses"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <BatchImport
        collections={collections}
        existingIds={existingIds}
        defaultType={form.type}
        defaultCollection={collections[0]}
        onCreated={(created) => {
          toast.success(`Created ${created.length} product(s)`);
          setSelected(created[0]);
          load();
        }}
        onError={(msg) => toast.error(msg)}
      />

      {orphans.length > 0 && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h3>Import from disk</h3>
          <p className="text-muted-foreground text-sm">
            Folders in raw/jewelry/ not yet in the manifest.
          </p>
          <div className="flex gap-4 items-end flex-wrap">
            <div>
              <label className="text-sm font-medium mb-1 block">Type</label>
              <Select value={importType} onValueChange={(v) => setImportType(v as ProductType)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["ring", "bracelet", "earrings", "necklace", "half_set", "full_set", "general"] as const).map(
                    (t) => (
                      <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>
                    )
                  )}
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
              onSelectAllOnPage={() => toggleAllOrphans(orphans.map((o) => o.folder_id))}
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
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm border-none bg-transparent"
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
        </div>
      )}

      <div className="card" style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
        <h3>Single product</h3>
        <form onSubmit={handleCreate}>
          <div className="flex gap-4 items-end flex-wrap">
            <div>
              <label className="text-sm font-medium mb-1 block" htmlFor="product-name">
                Display name (optional)
              </label>
              <Input
                id="product-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={suggestedName}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Type</label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ProductType })}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["ring", "bracelet", "earrings", "necklace", "half_set", "full_set", "general"] as const).map(
                    (t) => (
                      <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>
                    )
                  )}
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
          <p className="text-muted-foreground text-sm mb-3">
            Will create: <strong>{suggestedId}</strong> — {suggestedName}
          </p>
          <Button type="submit" variant="secondary">
            <Plus className="mr-2 h-4 w-4" />
            Create product
          </Button>
        </form>
      </div>

      {loading ? (
        <Loading variant="skeleton-grid" message="Loading products..." />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products match filters"
          description="Try adjusting your filters or create a new product to get started."
          icon={<Image className="h-16 w-16" />}
        />
      ) : (
        <>
          {productData && (
            <Pagination
              page={productData.page}
              pageSize={productData.page_size}
              total={productData.total}
              totalPages={productData.total_pages}
              onPageChange={(p) => setParams({ page: String(p) })}
              onPageSizeChange={(s) => setParams({ page: "1", page_size: String(s) })}
              position="top"
            />
          )}
        <div className="grid" style={{ marginTop: "0.75rem" }}>
          {products.map((p) => {
            const thumb = anchorImage(p);
            return (
              <div
                key={p.id}
                className={selectableCardClass(selected?.id === p.id, "card cursor-pointer")}
                onClick={() => setSelected(p)}
              >
                {thumb ? (
                  <img className="thumb" src={assetUrl(thumb.path)} alt={p.name} />
                ) : p.approved_output ? (
                  <img className="thumb" src={assetUrl(p.approved_output)} alt={`${p.name} canonical`} />
                ) : p.last_output ? (
                  <img className="thumb" src={assetUrl(p.last_output)} alt={`${p.name} latest`} />
                ) : (
                  <div className="thumb" />
                )}
                <h3 style={{ marginTop: "0.75rem" }}>{p.name}</h3>
                <p className="text-muted-foreground text-sm m-0">
                  {p.id} · {typeLabel(p.type)}
                  {p.collection && ` · ${p.collection}`}
                </p>
                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
                  <Badge variant={p.status === "ready" ? "default" : "secondary"}>{p.status}</Badge>
                  {p.approved_output && (
                    <Badge variant="default">canonical</Badge>
                  )}
                  {p.review_status && (
                    <Badge
                      variant={
                        p.review_status === "approved"
                          ? "default"
                          : p.review_status === "rejected"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {p.review_status}
                    </Badge>
                  )}
                </div>
                {(p.approved_output || p.last_output) && (
                  <Link
                    to={`/catalog?review=&type=${p.type}`}
                    className="inline-block mt-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button variant="secondary" size="sm">
                      View in catalog
                    </Button>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
          {productData && (
            <Pagination
              page={productData.page}
              pageSize={productData.page_size}
              total={productData.total}
              totalPages={productData.total_pages}
              onPageChange={(p) => setParams({ page: String(p) })}
              onPageSizeChange={(s) => setParams({ page: "1", page_size: String(s) })}
              position="bottom"
            />
          )}
        </>
      )}

      {selected && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3>{selected.name}</h3>
              <p className="text-muted-foreground m-0">
                {selected.id} · {selected.images.length} image(s) — assign exactly one anchor to mark ready
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={handleDeleteProduct}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete product
            </Button>
          </div>

          <div className="card bg-secondary/30 p-4 mb-4">
            <h4 className="text-sm font-medium mb-3">Edit product</h4>
            <div className="flex gap-4 items-end flex-wrap">
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Type</label>
                <Select
                  value={editForm.type}
                  onValueChange={(v) => setEditForm({ ...editForm, type: v as ProductType })}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["ring", "bracelet", "earrings", "necklace", "half_set", "full_set", "general"] as const).map(
                      (t) => (
                        <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <CollectionPicker
                collections={collections}
                value={editForm.collectionSelect}
                onChange={(v) => setEditForm({ ...editForm, collectionSelect: v })}
                newValue={editForm.newCollection}
                onNewValueChange={(v) => setEditForm({ ...editForm, newCollection: v })}
                required
              />
              <Button type="button" disabled={saving} onClick={handleSaveProduct}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>

          <div
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleUpload(e.dataTransfer.files);
            }}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <span>Drop images here or click to upload</span>
            <input
              id="file-input"
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => handleUpload(e.target.files)}
            />
          </div>

          <table style={{ marginTop: "1rem" }}>
            <thead>
              <tr>
                <th>Preview</th>
                <th>File</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {selected.images.map((img) => (
                <tr key={img.filename}>
                  <td>
                    <img
                      src={assetUrl(img.path)}
                      alt=""
                      style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 4 }}
                    />
                  </td>
                  <td>{img.filename}</td>
                  <td>
                    <Select
                      value={img.role}
                      onValueChange={(v) => handleRoleChange(img.filename, v as ImageRole)}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${img.filename}`}
                      onClick={() => handleDeleteImage(img.filename)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
