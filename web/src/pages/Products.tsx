import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  assetUrl,
  ImageRole,
  ImportFolderInfo,
  Product,
  ProductStatus,
  ProductType,
} from "../api";
import CollectionPicker, { resolveCollectionValue } from "../components/CollectionPicker";
import ImportDialog from "../components/ImportDialog";
import PageHeader from "../components/PageHeader";
import Pagination from "../components/Pagination";
import ProductFilterBar from "../components/ProductFilterBar";
import ProductHeroPicker from "../components/ProductHeroPicker";
import SelectionBar from "../components/SelectionBar";
import { useSelectionSet } from "../hooks/useSelectionSet";
import { useUrlParams } from "../hooks/useUrlParams";
import { PRODUCT_TYPES, typeLabel } from "../lib/productTypes";
import { selectableCardClass } from "../lib/selectionStyles";
import { useGenerateStore } from "../stores/generateStore";
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
import { Image, Save, Trash2, Upload, X } from "lucide-react";

const ROLES: ImageRole[] = ["anchor", "detail", "analysis_only", "archived"];

const LIST_DEFAULTS = {
  page: "1",
  page_size: "12",
  type: "",
  collection: "",
  status: "",
  product: "",
};

export default function Products() {
  const navigate = useNavigate();
  const { params, setParams } = useUrlParams(LIST_DEFAULTS);
  const page = Number(params.page) || 1;
  const pageSize = Number(params.page_size) || 12;
  const typeFilter = (params.type || "") as ProductType | "";
  const collectionFilter = params.collection || "";
  const statusFilter = (params.status || "") as ProductStatus | "";

  const setSelectedProductIds = useGenerateStore((s) => s.setSelectedProductIds);
  const selectedProductIds = useGenerateStore((s) => s.selectedProductIds);
  const {
    selected: batchIds,
    toggle: toggleBatchId,
    toggleAll: toggleAllBatch,
    clear: clearBatch,
  } = useSelectionSet<string>();

  const [productData, setProductData] = useState<Awaited<
    ReturnType<typeof api.listProducts>
  > | null>(null);
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof api.getProductMeta>> | null>(
    null
  );
  const [orphans, setOrphans] = useState<ImportFolderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Product | null>(null);
  const [deepLinkTried, setDeepLinkTried] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    type: "ring" as ProductType,
    collectionSelect: "",
    newCollection: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const products = productData?.items ?? [];
  const collections = meta?.collections ?? [];

  const existingIds = useMemo(() => {
    if (meta?.ids?.length) return meta.ids;
    const ids = products.map((p) => p.id);
    if (selected && !ids.includes(selected.id)) ids.push(selected.id);
    return ids;
  }, [meta?.ids, products, selected]);

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, collectionFilter, statusFilter, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = params.product;
    if (!id || deepLinkTried) return;
    setDeepLinkTried(true);
    const onPage = products.find((p) => p.id === id);
    if (onPage) {
      setSelected(onPage);
      return;
    }
    api
      .getProduct(id)
      .then((p) => setSelected(p))
      .catch(() => toast.error(`Product ${id} not found`));
  }, [params.product, products, deepLinkTried]);

  useEffect(() => {
    if (!selected) return;
    setEditForm({
      name: selected.name,
      type: selected.type,
      collectionSelect:
        selected.collection && collections.includes(selected.collection)
          ? selected.collection
          : collections[0] ?? "",
      newCollection:
        selected.collection && !collections.includes(selected.collection)
          ? selected.collection
          : "",
    });
    if (params.product !== selected.id) {
      setParams({ product: selected.id });
    }
  }, [selected, collections]);

  function closeDrawer() {
    setSelected(null);
    setParams({ product: "" });
  }

  async function handleSaveProduct() {
    if (!selected) return;
    const collection = resolveCollectionValue(
      editForm.collectionSelect,
      editForm.newCollection
    );
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
    if (
      !window.confirm(
        `Delete product "${selected.name}" (${selected.id})? This cannot be undone.`
      )
    ) {
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

  async function handleUpload(files: FileList | null) {
    if (!selected || !files?.length) return;
    try {
      const hasAnchor = selected.images.some((i) => i.role === "anchor");
      const list = Array.from(files);
      for (let i = 0; i < list.length; i++) {
        const role: ImageRole =
          !hasAnchor && i === 0 ? "anchor" : "analysis_only";
        await api.uploadImage(selected.id, list[i], role);
      }
      const updated = await api.getProduct(selected.id);
      setSelected(updated);
      await load();
      toast.success(
        !hasAnchor
          ? "Uploaded — first image set as anchor"
          : `Uploaded ${list.length} image(s)`
      );
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

  function readinessNote(product: Product): string {
    const anchors = product.images.filter((i) => i.role === "anchor");
    if (anchors.length === 1) {
      return "Ready for Studio — exactly one anchor is set.";
    }
    if (anchors.length === 0) {
      return "Draft — assign exactly one image as anchor to make this product generatable.";
    }
    return "Draft — multiple anchors found. Keep only one anchor role.";
  }

  const studioBatchIds = useMemo(
    () => new Set(selectedProductIds),
    [selectedProductIds]
  );

  function openStudioBatch() {
    navigate("/studio?tab=batch");
  }

  function addToStudioBatch(product: Product) {
    if (studioBatchIds.has(product.id)) {
      openStudioBatch();
      return;
    }
    const next = new Set(selectedProductIds);
    next.add(product.id);
    setSelectedProductIds(Array.from(next));
    toast.success(`Added ${product.name} to Studio batch`);
    openStudioBatch();
  }

  function addBatchToStudio() {
    const ids = Array.from(batchIds);
    if (!ids.length) return;
    const already = ids.filter((id) => studioBatchIds.has(id));
    const fresh = ids.filter((id) => !studioBatchIds.has(id));
    if (fresh.length === 0) {
      clearBatch();
      openStudioBatch();
      return;
    }
    const next = new Set(selectedProductIds);
    for (const id of fresh) next.add(id);
    setSelectedProductIds(Array.from(next));
    clearBatch();
    if (already.length > 0) {
      toast.success(
        `Added ${fresh.length} product(s) (${already.length} already in Studio batch)`
      );
    } else {
      toast.success(`Added ${fresh.length} product(s) to Studio batch`);
    }
    openStudioBatch();
  }

  const batchAlreadyInStudio =
    batchIds.size > 0 && Array.from(batchIds).every((id) => studioBatchIds.has(id));
  const batchFreshCount = Array.from(batchIds).filter(
    (id) => !studioBatchIds.has(id)
  ).length;

  const pageIds = useMemo(() => products.map((p) => p.id), [products]);

  function cardThumb(product: Product): { path: string; alt: string } | null {
    const anchor = product.images.find((i) => i.role === "anchor");
    if (anchor) return { path: anchor.path, alt: `${product.name} anchor` };
    if (product.last_output)
      return { path: product.last_output, alt: `${product.name} latest` };
    if (product.images[0])
      return { path: product.images[0].path, alt: product.name };
    return null;
  }

  return (
    <div className={selected ? "with-detail-drawer" : undefined}>
      <PageHeader
        title="Products"
        description="Import SKUs, set one anchor photo, then send ready products to Studio. Pick a hero later from kept outputs."
        actions={
          <Button onClick={() => setImportOpen(true)}>
            Import
          </Button>
        }
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        collections={collections}
        existingIds={existingIds}
        orphans={orphans}
        onCreated={(created) => {
          toast.success(`Created ${created.length} product(s)`);
          setSelected(created[0]);
          load();
        }}
        onError={(msg) => toast.error(msg)}
        onImported={() => load()}
      />

      <ProductFilterBar
        typeFilter={typeFilter}
        onTypeChange={(v) => setParams({ type: v, page: "1" })}
        collectionFilter={collectionFilter}
        onCollectionChange={(v) => setParams({ collection: v, page: "1" })}
        collections={collections}
        statusFilter={statusFilter}
        onStatusChange={(v) => setParams({ status: v, page: "1" })}
        typeCounts={meta?.counts_by_type}
        typeTotal={meta?.total}
      />

      <SelectionBar
        count={batchIds.size}
        onClearAll={clearBatch}
        onSelectAllOnPage={() => toggleAllBatch(pageIds)}
        actions={
          <Button size="sm" disabled={!batchIds.size} onClick={addBatchToStudio}>
            {batchAlreadyInStudio
              ? "Open in Studio"
              : batchFreshCount < batchIds.size
                ? `Add ${batchFreshCount} more to Studio`
                : `Add ${batchIds.size || ""} to Studio`}
          </Button>
        }
      />

      {loading ? (
        <Loading variant="skeleton-grid" message="Loading products..." />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products match filters"
          description="Import photos or create a SKU, set an anchor, then generate in Studio."
          icon={<Image className="h-16 w-16" />}
          action={
            <Button onClick={() => setImportOpen(true)}>Import products</Button>
          }
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
          <div className="grid mt-3">
            {products.map((p) => {
              const thumb = cardThumb(p);
              const checked = batchIds.has(p.id);
              const generatable = p.status === "ready" || p.status === "generated";
              return (
                <div
                  key={p.id}
                  className={selectableCardClass(
                    selected?.id === p.id || checked,
                    "card cursor-pointer relative"
                  )}
                  onClick={() => setSelected(p)}
                >
                  <div
                    className="absolute left-2 top-2 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleBatchId(p.id)}
                      aria-label={`Select ${p.name}`}
                    />
                  </div>
                  {thumb ? (
                    <img className="thumb" src={assetUrl(thumb.path)} alt={thumb.alt} />
                  ) : (
                    <div className="thumb" />
                  )}
                  <h3 className="mt-3 text-base">{p.name}</h3>
                  <p className="m-0 text-xs text-muted-foreground">
                    {p.id} · {typeLabel(p.type)}
                    {p.collection && ` · ${p.collection}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant={p.status === "ready" ? "default" : "secondary"}>
                      {p.status}
                    </Badge>
                    {p.approved_output ? (
                      <Badge variant="default">Hero</Badge>
                    ) : (
                      <Badge variant="outline">No hero</Badge>
                    )}
                  </div>
                  {generatable && (
                    <p className="mt-2 mb-0 text-xs text-muted-foreground">
                      Ready for Studio
                      {!p.approved_output ? " · pick hero when you have kept shots" : ""}
                    </p>
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
        <aside className="detail-drawer product-drawer">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h3 className="m-0">{selected.name}</h3>
              <p className="m-0 text-sm text-muted-foreground">
                {selected.id} · {selected.images.length} image(s)
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Close"
              onClick={closeDrawer}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="mb-4 text-sm text-muted-foreground">{readinessNote(selected)}</p>

          <div className="mb-4 flex flex-wrap gap-2">
            {(selected.status === "ready" || selected.status === "generated") && (
              <Button
                size="sm"
                variant={studioBatchIds.has(selected.id) ? "secondary" : "default"}
                onClick={() => addToStudioBatch(selected)}
              >
                {studioBatchIds.has(selected.id) ? "Open in Studio" : "Add to Studio"}
              </Button>
            )}
            {!selected.approved_output && (
              <Button asChild size="sm" variant="secondary">
                <Link to={`/outputs?tab=gallery&product=${selected.id}&review=approved`}>
                  Pick hero from kept
                </Link>
              </Button>
            )}
            <Button asChild size="sm" variant="secondary">
              <Link to={`/outputs?tab=gallery&product=${selected.id}`}>
                View outputs
              </Link>
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={handleDeleteProduct}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>

          <div className="card mb-4 p-4">
            <h4 className="mb-3 text-sm font-medium">Photos</h4>
            <div
              className="dropzone mb-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleUpload(e.dataTransfer.files).catch(() => undefined);
              }}
              onClick={() => document.getElementById("product-file-input")?.click()}
            >
              <Upload className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <p className="m-0 text-sm text-muted-foreground">
                Drop images here — first upload becomes the anchor if none is set
              </p>
              <input
                id="product-file-input"
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => handleUpload(e.target.files).catch(() => undefined)}
              />
            </div>
            <div className="table-scroll">
              <table>
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
                          style={{
                            width: 48,
                            height: 48,
                            objectFit: "cover",
                            borderRadius: 4,
                          }}
                        />
                      </td>
                      <td className="text-xs">{img.filename}</td>
                      <td>
                        <Select
                          value={img.role}
                          onValueChange={(v) =>
                            handleRoleChange(img.filename, v as ImageRole)
                          }
                        >
                          <SelectTrigger className="w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
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
          </div>

          <ProductHeroPicker
            product={selected}
            onProductUpdated={(p) => {
              setSelected(p);
              setProductData((prev) =>
                prev
                  ? {
                      ...prev,
                      items: prev.items.map((item) => (item.id === p.id ? p : item)),
                    }
                  : prev
              );
            }}
          />

          <div className="card mb-4 bg-secondary/30 p-4">
            <h4 className="mb-3 text-sm font-medium">Edit product</h4>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Name</label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Type</label>
                <Select
                  value={editForm.type}
                  onValueChange={(v) =>
                    setEditForm({ ...editForm, type: v as ProductType })
                  }
                >
                  <SelectTrigger>
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
        </aside>
      )}
    </div>
  );
}
