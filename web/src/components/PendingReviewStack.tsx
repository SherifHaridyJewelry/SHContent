import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, assetUrl, CatalogItem } from "../api";
import { formatGenerationLabel } from "../lib/outputNaming";
import { anchorPathFromItem } from "../lib/reviewUi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { toast } from "sonner";
import {
  Check,
  Eye,
  RotateCcw,
  SkipForward,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const SWIPE_THRESHOLD = 110;
const EXIT_DISTANCE = 480;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.35;

type SwipeAction = "approve" | "reject" | "skip";

interface UndoEntry {
  item: CatalogItem;
  action: SwipeAction;
}

interface PendingReviewStackProps {
  onMeta?: (pending: number, total: number) => void;
}

function itemLabel(item: CatalogItem): string {
  return (
    item.output_label ??
    item.product_name ??
    formatGenerationLabel(
      item.output_path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? ""
    )
  );
}

export default function PendingReviewStack({ onMeta }: PendingReviewStackProps) {
  const [queue, setQueue] = useState<CatalogItem[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [sessionReviewed, setSessionReviewed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1.8);
  const [zoomPan, setZoomPan] = useState({ x: 0, y: 0 });
  const [zoomSrc, setZoomSrc] = useState<"generated" | "raw">("generated");
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [exit, setExit] = useState<{
    x: number;
    y: number;
    action: SwipeAction;
  } | null>(null);

  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const exitRef = useRef(exit);
  exitRef.current = exit;
  const zoomOpenRef = useRef(false);
  zoomOpenRef.current = zoomOpen;
  const zoomPanDrag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const currentRef = useRef<CatalogItem | null>(null);
  const queueRef = useRef<CatalogItem[]>([]);
  const onMetaRef = useRef(onMeta);
  onMetaRef.current = onMeta;
  const catalogTotalRef = useRef(0);
  const totalPendingRef = useRef(0);
  const loadingRef = useRef(false);
  const initialLoadDone = useRef(false);

  const applyMeta = useCallback((count: number, total: number) => {
    setTotalPending(count);
    totalPendingRef.current = count;
    catalogTotalRef.current = total;
    onMetaRef.current?.(count, total);
  }, []);

  const fetchPendingPage = useCallback(async () => {
    const catalog = await api.listCatalog({
      page: 1,
      page_size: 48,
      review_status: "pending",
      sort: "newest",
      exclude_scene_plates: true,
    });
    const pending = catalog.items;
    // Meta pending already excludes scene refs (product review queue only).
    const count = catalog.meta.counts_by_review?.pending ?? catalog.total;
    applyMeta(count, catalog.meta.total);
    return pending;
  }, [applyMeta]);

  const loadQueue = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      // Only show skeleton on the first load — never flash it again.
      if (!opts?.silent && !initialLoadDone.current) {
        setLoading(true);
      }
      try {
        const pending = await fetchPendingPage();
        setQueue(pending);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load pending");
      } finally {
        initialLoadDone.current = true;
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [fetchPendingPage]
  );

  useEffect(() => {
    loadQueue().catch(() => undefined);
  }, [loadQueue]);

  queueRef.current = queue;
  const current = queue[0] ?? null;
  currentRef.current = current;
  const nextCards = queue.slice(1, 4);

  const hint = useMemo(() => {
    if (!drag.active && !exit) return null;
    const x = exit?.x ?? drag.x;
    if (x > 40) return "approve";
    if (x < -40) return "reject";
    return null;
  }, [drag, exit]);

  const pushUndo = useCallback((entry: UndoEntry) => {
    setUndoStack((u) => [entry, ...u].slice(0, 12));
  }, []);

  const closeZoom = useCallback(() => {
    setZoomOpen(false);
    setZoomScale(1.8);
    setZoomPan({ x: 0, y: 0 });
    zoomPanDrag.current = null;
  }, []);

  const openZoom = useCallback((src: "generated" | "raw" = "generated") => {
    setZoomSrc(src);
    setZoomScale(1.8);
    setZoomPan({ x: 0, y: 0 });
    setZoomOpen(true);
  }, []);

  const nudgeZoom = useCallback((delta: number) => {
    setZoomScale((s) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s + delta)));
  }, []);

  useEffect(() => {
    closeZoom();
    setShowCompare(false);
  }, [current?.output_path, closeZoom]);

  const commitAction = useCallback(
    async (item: CatalogItem, action: SwipeAction) => {
      if (action === "skip") {
        pushUndo({ item, action });
        setShowCompare(false);
        closeZoom();

        // Last local card: rotate alone does nothing — pull remaining pending in.
        if (queueRef.current.length <= 1 && totalPendingRef.current > 1) {
          setBusy(true);
          try {
            const pending = await fetchPendingPage();
            const others = pending.filter((i) => i.output_path !== item.output_path);
            setQueue(others.length ? [...others, item] : [item]);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to load more pending");
            setQueue([item]);
          } finally {
            setBusy(false);
            setExit(null);
            setDrag({ x: 0, y: 0, active: false });
          }
          return;
        }

        setQueue((prev) => {
          if (!prev.length || prev[0].output_path !== item.output_path) return prev;
          return [...prev.slice(1), prev[0]];
        });
        setExit(null);
        setDrag({ x: 0, y: 0, active: false });
        return;
      }

      setBusy(true);
      try {
        const status = action === "approve" ? "approved" : "rejected";
        await api.setCatalogReview({
          output_path: item.output_path,
          status,
          set_canonical: false,
          product_id: item.product_id ?? undefined,
          task_id: item.task_id ?? undefined,
        });
        const nextPending = Math.max(0, totalPendingRef.current - 1);
        applyMeta(nextPending, catalogTotalRef.current);
        setSessionReviewed((n) => n + 1);
        pushUndo({ item, action });
        closeZoom();

        const nextQueue = queueRef.current.filter(
          (i) => i.output_path !== item.output_path
        );
        if (nextQueue.length === 0 && nextPending > 0) {
          const pending = await fetchPendingPage();
          setQueue(pending.filter((i) => i.output_path !== item.output_path));
        } else {
          setQueue(nextQueue);
        }

        toast.success(
          action === "approve"
            ? `Kept · ${itemLabel(item)}`
            : `Rejected · ${itemLabel(item)}`
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Review failed");
      } finally {
        setBusy(false);
        setShowCompare(false);
        setExit(null);
        setDrag({ x: 0, y: 0, active: false });
      }
    },
    [applyMeta, closeZoom, fetchPendingPage, pushUndo]
  );

  const animateOut = useCallback(
    (action: SwipeAction) => {
      const item = currentRef.current;
      if (!item || busyRef.current || exitRef.current) return;
      const x =
        action === "approve" ? EXIT_DISTANCE : action === "reject" ? -EXIT_DISTANCE : 0;
      const y = action === "skip" ? -EXIT_DISTANCE * 0.55 : dragRef.current.y * 0.2;
      setExit({ x, y, action });
      window.setTimeout(() => {
        commitAction(item, action).catch(() => undefined);
      }, 220);
    },
    [commitAction]
  );

  const undoLast = useCallback(async () => {
    const last = undoStack[0];
    if (!last || busyRef.current) return;
    setBusy(true);
    try {
      if (last.action === "skip") {
        setQueue((prev) => {
          const without = prev.filter((i) => i.output_path !== last.item.output_path);
          return [last.item, ...without];
        });
      } else {
        await api.setCatalogReview({
          output_path: last.item.output_path,
          status: "pending",
          set_canonical: false,
          product_id: last.item.product_id ?? undefined,
          task_id: last.item.task_id ?? undefined,
        });
        setQueue((prev) => [last.item, ...prev]);
        setTotalPending((n) => {
          const next = n + 1;
          onMetaRef.current?.(next, catalogTotalRef.current);
          return next;
        });
        setSessionReviewed((n) => Math.max(0, n - 1));
      }
      setUndoStack((u) => u.slice(1));
      toast.message("Undone");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Undo failed");
    } finally {
      setBusy(false);
    }
  }, [undoStack]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!currentRef.current) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return;
      const key = e.key.toLowerCase();

      if (zoomOpenRef.current) {
        if (key === "escape" || key === "z") {
          e.preventDefault();
          closeZoom();
        } else if (key === "+" || key === "=") {
          e.preventDefault();
          nudgeZoom(ZOOM_STEP);
        } else if (key === "-" || key === "_") {
          e.preventDefault();
          nudgeZoom(-ZOOM_STEP);
        }
        return;
      }

      if (busyRef.current || exitRef.current) return;
      if (key === "a" || key === "arrowright") {
        e.preventDefault();
        animateOut("approve");
      } else if (key === "r" || key === "arrowleft") {
        e.preventDefault();
        animateOut("reject");
      } else if (key === "s" || key === "arrowup") {
        e.preventDefault();
        animateOut("skip");
      } else if (key === "c" || key === " ") {
        e.preventDefault();
        setShowCompare((v) => !v);
      } else if (key === "z") {
        e.preventDefault();
        openZoom("generated");
      } else if (key === "u") {
        e.preventDefault();
        undoLast().catch(() => undefined);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [animateOut, closeZoom, nudgeZoom, openZoom, undoLast]);

  function onPointerDown(e: React.PointerEvent) {
    if (busy || exit || !current || zoomOpen) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerStart.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, active: true });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointerStart.current || !drag.active) return;
    setDrag({
      x: e.clientX - pointerStart.current.x,
      y: e.clientY - pointerStart.current.y,
      active: true,
    });
  }

  function onPointerUp() {
    if (!pointerStart.current) return;
    const { x, y } = dragRef.current;
    pointerStart.current = null;
    if (x > SWIPE_THRESHOLD) {
      animateOut("approve");
      return;
    }
    if (x < -SWIPE_THRESHOLD) {
      animateOut("reject");
      return;
    }
    if (y < -SWIPE_THRESHOLD) {
      animateOut("skip");
      return;
    }
    setDrag({ x: 0, y: 0, active: false });
  }

  if (loading) {
    return <Loading variant="skeleton" message="Loading pending reviews..." />;
  }

  if (!current) {
    return (
      <EmptyState
        title="Queue clear"
        description="No product outputs left to review. Scene references are managed on Templates — browse the gallery or start a new Studio batch."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="secondary">
              <Link to="/outputs?tab=gallery">Open gallery</Link>
            </Button>
            <Button asChild>
              <Link to="/studio?tab=batch">Go to Studio</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const tx = exit?.x ?? drag.x;
  const ty = exit?.y ?? drag.y;
  const rot = Math.max(-14, Math.min(14, tx / 18));
  const leaving = !!exit;
  const anchor = anchorPathFromItem(current);

  return (
    <div className="review-deck">
      <div className="review-deck-meta">
        <div>
          <p className="review-deck-progress">
            {queue.length} in deck
            {totalPending > queue.length && (
              <span className="text-muted-foreground"> · {totalPending} pending total</span>
            )}
            {sessionReviewed > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · {sessionReviewed} reviewed this session
              </span>
            )}
          </p>
          <p className="review-deck-hint text-muted-foreground">
            Right = keep for shortlist · Left = reject · Up = skip · Hero is chosen later
            on the product
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!undoStack.length || busy}
          onClick={() => undoLast().catch(() => undefined)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Undo
        </Button>
      </div>

      <div className="review-deck-stage">
        {nextCards
          .slice()
          .reverse()
          .map((item, revIdx) => {
            const depth = nextCards.length - revIdx;
            return (
              <div
                key={item.id}
                className="review-card review-card-back"
                style={{
                  transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`,
                  zIndex: 10 - depth,
                }}
                aria-hidden
              >
                <img
                  src={assetUrl(item.output_path)}
                  alt=""
                  className="review-card-image"
                  loading="lazy"
                />
              </div>
            );
          })}

        <div
          className={`review-card review-card-front${leaving ? " review-card-exit" : ""}${
            drag.active ? " review-card-dragging" : ""
          }`}
          style={{
            transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg)`,
            zIndex: 20,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="review-card-media">
          {hint === "approve" && <div className="review-stamp approve">Keep</div>}
          {hint === "reject" && <div className="review-stamp reject">Reject</div>}
            {showCompare ? (
              <div className="review-compare">
                <div
                  className="review-compare-pane"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (anchor) openZoom("raw");
                  }}
                >
                  <span>Raw</span>
                  {anchor ? (
                    <img src={assetUrl(anchor)} alt="Raw anchor" draggable={false} />
                  ) : (
                    <p className="review-compare-empty">No raw anchor linked</p>
                  )}
                </div>
                <div
                  className="review-compare-pane"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    openZoom("generated");
                  }}
                >
                  <span>Generated</span>
                  <img
                    src={assetUrl(current.output_path)}
                    alt={itemLabel(current)}
                    draggable={false}
                  />
                </div>
              </div>
            ) : (
              <img
                src={assetUrl(current.output_path)}
                alt={itemLabel(current)}
                className="review-card-image"
                draggable={false}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  openZoom("generated");
                }}
              />
            )}
            <button
              type="button"
              className="review-zoom-fab"
              aria-label="Zoom image"
              onClick={(e) => {
                e.stopPropagation();
                openZoom("generated");
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          <div className="review-card-body">
            <div className="review-card-title-row">
              <h3>{itemLabel(current)}</h3>
              <div className="review-card-title-actions">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openZoom("generated");
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                  Zoom
                </Button>
                <Button
                  type="button"
                  variant={showCompare ? "default" : "secondary"}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCompare((v) => !v);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {showCompare ? "Solo" : "Compare"}
                </Button>
              </div>
            </div>
            <div className="review-card-tags">
              {current.product_type && (
                <Badge variant="secondary">{current.product_type}</Badge>
              )}
              {current.collection && (
                <Badge variant="secondary">{current.collection}</Badge>
              )}
              {current.template && (
                <Badge variant="outline">{current.template}</Badge>
              )}
            </div>
            <p className="review-card-sub">
              {current.product_id ? (
                <>
                  Product <code>{current.product_id}</code>
                  {" · Keep adds to shortlist (hero chosen later)"}
                </>
              ) : (
                "No product link · Keep marks reviewed only"
              )}
              {current.timestamp && <> · {current.timestamp.slice(0, 19)}</>}
            </p>
          </div>
        </div>
      </div>

      <div className="review-deck-actions">
        <button
          type="button"
          className="review-action reject"
          disabled={busy || leaving}
          aria-label="Reject"
          onClick={() => animateOut("reject")}
        >
          <X className="h-6 w-6" />
          <span>Reject</span>
        </button>
        <button
          type="button"
          className="review-action skip"
          disabled={busy || leaving}
          aria-label="Skip"
          onClick={() => animateOut("skip")}
        >
          <SkipForward className="h-5 w-5" />
          <span>Skip</span>
        </button>
        <button
          type="button"
          className="review-action approve"
          disabled={busy || leaving}
          aria-label="Keep"
          onClick={() => animateOut("approve")}
        >
          <Check className="h-6 w-6" />
          <span>Keep</span>
        </button>
      </div>

      <p className="review-deck-keys text-muted-foreground">
        Keys: A / → keep · R / ← reject · S / ↑ skip · C compare · Z zoom · U undo
      </p>

      {zoomOpen && (
        <div
          className="review-zoom-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Zoomed output"
          onClick={closeZoom}
          onWheel={(e) => {
            e.preventDefault();
            nudgeZoom(e.deltaY < 0 ? ZOOM_STEP * 0.5 : -ZOOM_STEP * 0.5);
          }}
        >
          <div
            className="review-zoom-toolbar"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="review-zoom-toolbar-left">
              <span className="review-zoom-label">
                {zoomSrc === "raw" ? "Raw" : "Generated"} · {Math.round(zoomScale * 100)}%
              </span>
              {anchor && (
                <div className="review-zoom-src-toggle">
                  <button
                    type="button"
                    className={zoomSrc === "generated" ? "active" : undefined}
                    onClick={() => {
                      setZoomSrc("generated");
                      setZoomPan({ x: 0, y: 0 });
                    }}
                  >
                    Generated
                  </button>
                  <button
                    type="button"
                    className={zoomSrc === "raw" ? "active" : undefined}
                    onClick={() => {
                      setZoomSrc("raw");
                      setZoomPan({ x: 0, y: 0 });
                    }}
                  >
                    Raw
                  </button>
                </div>
              )}
            </div>
            <div className="review-zoom-toolbar-right">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={zoomScale <= ZOOM_MIN}
                onClick={() => nudgeZoom(-ZOOM_STEP)}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={zoomScale >= ZOOM_MAX}
                onClick={() => nudgeZoom(ZOOM_STEP)}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={closeZoom}>
                Close
              </Button>
            </div>
          </div>
          <div
            className="review-zoom-stage"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              zoomPanDrag.current = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                originX: zoomPan.x,
                originY: zoomPan.y,
              };
            }}
            onPointerMove={(e) => {
              const dragState = zoomPanDrag.current;
              if (!dragState || dragState.pointerId !== e.pointerId) return;
              setZoomPan({
                x: dragState.originX + (e.clientX - dragState.startX),
                y: dragState.originY + (e.clientY - dragState.startY),
              });
            }}
            onPointerUp={() => {
              zoomPanDrag.current = null;
            }}
            onPointerCancel={() => {
              zoomPanDrag.current = null;
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (zoomScale > 1.2) {
                setZoomScale(1);
                setZoomPan({ x: 0, y: 0 });
              } else {
                setZoomScale(2.4);
              }
            }}
          >
            <img
              src={assetUrl(
                zoomSrc === "raw" && anchor ? anchor : current.output_path
              )}
              alt={itemLabel(current)}
              className="review-zoom-image"
              draggable={false}
              style={{
                transform: `translate(${zoomPan.x}px, ${zoomPan.y}px) scale(${zoomScale})`,
              }}
            />
          </div>
          <p className="review-zoom-hint text-muted-foreground">
            Scroll to zoom · drag to pan · double-click toggle · Esc / Z close
          </p>
        </div>
      )}
    </div>
  );
}
