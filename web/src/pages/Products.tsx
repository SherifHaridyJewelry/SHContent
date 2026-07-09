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
import { useUrlParams } from "../hooks/useUrlParams";
import { typeLabel } from "../lib/productTypes";
import { selectableCardClass } from "../lib/selectionStyles";
import { useGenerateStore } from "../stores/generateStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const [productData, setProductData] = useState<Awaited<
    ReturnType<typeof api.listProducts>
  > | null>(null);
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof api.getProductMeta>> | null>(
    null
  );
  const [orphans, setOrphans] = useState<ImportFolderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Product | null>(null);
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
    const ids = products.map((p) => p.id);
    if (selected && !ids.includes(selected.id)) ids.push(selected.id);
    return ids;
  }, [products, selected]);

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
  }, [selected, collections]);

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

  function anchorImage(product: Product) {
    return product.images.find((i) => i.role === "anchor") ?? product.images[0];
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

  function addToStudioBatch(product: Product) {
    const next = new Set(selectedProductIds);
    next.add(product.id);
    setSelectedProductIds(Array.from(next));
    toast.success(`Added ${product.name} to Studio batch`);
    navigate("/studio?tab=batch");
  }

  return (
    <div className={selected ? "with-detail-drawer" : undefined}>
      <PageHeader
        title="Products"
        description="Import jewelry SKUs, assign one anchor photo per product. Status becomes ready automatically when an anchor is set."
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

      {loading ? (
        <Loading variant="skeleton-grid" message="Loading products..." />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products match filters"
          description="Import photos or create a SKU to start the catalog workflow."
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
              const thumb = anchorImage(p);
              return (
                <div
                  key={p.id}
                  className={selectableCardClass(
                    selected?.id === p.id,
                    "card cursor-pointer"
                  )}
                  onClick={() => setSelected(p)}
                >
                  {thumb ? (
                    <img className="thumb" src={assetUrl(thumb.path)} alt={p.name} />
                  ) : p.approved_output ? (
                    <img
                      className="thumb"
                      src={assetUrl(p.approved_output)}
                      alt={`${p.name} canonical`}
                    />
                  ) : p.last_output ? (
                    <img
                      className="thumb"
                      src={assetUrl(p.last_output)}
                      alt={`${p.name} latest`}
                    />
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
                    {p.approved_output && <Badge variant="default">canonical</Badge>}
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
              onClick={() => setSelected(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="mb-4 text-sm text-muted-foreground">{readinessNote(selected)}</p>

          <div className="mb-4 flex flex-wrap gap-2">
            {(selected.status === "ready" || selected.status === "generated") && (
              <Button size="sm" onClick={() => addToStudioBatch(selected)}>
                Add to Studio batch
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
                    {(
                      [
                        "ring",
                        "bracelet",
                        "earrings",
                        "necklace",
                        "half_set",
                        "full_set",
                        "general",
                      ] as const
                    ).map((t) => (
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

          <div
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleUpload(e.dataTransfer.files);
            }}
            onClick={() => document.getElementById("product-file-input")?.click()}
          >
            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <span>Drop images here or click to upload</span>
            <input
              id="product-file-input"
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => handleUpload(e.target.files)}
            />
          </div>

          <div className="table-scroll mt-4">
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
        </aside>
      )}
    </div>
  );
}
