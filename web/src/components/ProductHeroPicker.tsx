import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, assetUrl, CatalogItem, Product } from "../api";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/Loading";
import { toast } from "sonner";
import { Star } from "lucide-react";

interface ProductHeroPickerProps {
  product: Product;
  onProductUpdated: (product: Product) => void;
}

export default function ProductHeroPicker({
  product,
  onProductUpdated,
}: ProductHeroPickerProps) {
  const [kept, setKept] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const loadKept = useCallback(async () => {
    setLoading(true);
    try {
      const catalog = await api.listCatalog({
        page: 1,
        page_size: 100,
        product_id: product.id,
        review_status: "approved",
        sort: "newest",
        scene_plates_only: false,
      });
      setKept(catalog.items.filter((i) => !i.is_scene_plate));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load kept images");
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => {
    loadKept().catch(() => undefined);
  }, [loadKept]);

  async function selectHero(item: CatalogItem) {
    setBusyPath(item.output_path);
    try {
      const result = await api.setCanonicalOutput({
        product_id: product.id,
        output_path: item.output_path,
      });
      if (result.product) onProductUpdated(result.product);
      setKept((prev) =>
        prev.map((i) => ({
          ...i,
          is_canonical: i.output_path === item.output_path,
        }))
      );
      toast.success("Hero updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set hero");
    } finally {
      setBusyPath(null);
    }
  }

  async function clearHero() {
    setBusyPath("__clear__");
    try {
      const result = await api.setCanonicalOutput({
        product_id: product.id,
        output_path: null,
      });
      if (result.product) onProductUpdated(result.product);
      setKept((prev) => prev.map((i) => ({ ...i, is_canonical: false })));
      toast.message("Hero cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clear hero");
    } finally {
      setBusyPath(null);
    }
  }

  const heroPath = product.approved_output;

  return (
    <div className="card mb-4 hero-picker">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h4 className="mb-1 text-sm font-medium">Product hero</h4>
          <p className="m-0 text-xs text-muted-foreground">
            Pick one image from the kept shortlist. Optional — use when you need a
            default thumbnail or web primary.
          </p>
        </div>
        {heroPath && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!busyPath}
            onClick={() => clearHero().catch(() => undefined)}
          >
            Clear
          </Button>
        )}
      </div>

      {heroPath ? (
        <div className="hero-picker-current mb-3">
          <img src={assetUrl(heroPath)} alt="Current hero" />
          <span>
            <Star className="h-3 w-3" />
            Current hero
          </span>
        </div>
      ) : (
        <p className="hero-picker-empty mb-3 text-xs text-muted-foreground">
          No hero selected yet.
        </p>
      )}

      {loading ? (
        <Loading variant="skeleton" message="Loading kept images..." />
      ) : kept.length === 0 ? (
        <div className="space-y-2">
          <p className="m-0 text-sm text-muted-foreground">
            No kept images yet. Review pending outputs first, then choose a hero here.
          </p>
          <Button asChild size="sm" variant="secondary">
            <Link to="/outputs?tab=pending">Review pending</Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {kept.length} kept · click to set as hero
          </p>
          <div className="hero-picker-grid">
            {kept.map((item) => {
              const isHero = item.output_path === heroPath || item.is_canonical;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`hero-picker-tile${isHero ? " is-hero" : ""}`}
                  disabled={!!busyPath || isHero}
                  onClick={() => selectHero(item).catch(() => undefined)}
                >
                  <img
                    src={assetUrl(item.output_path)}
                    alt={item.output_label ?? "Kept output"}
                    loading="lazy"
                  />
                  {isHero ? (
                    <span className="hero-picker-badge">Hero</span>
                  ) : (
                    <span className="hero-picker-badge muted">Set hero</span>
                  )}
                  {busyPath === item.output_path && (
                    <span className="hero-picker-busy">Saving…</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            <Button asChild size="sm" variant="ghost">
              <Link to={`/outputs?tab=gallery&product=${product.id}&review=approved`}>
                Open kept in gallery
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
