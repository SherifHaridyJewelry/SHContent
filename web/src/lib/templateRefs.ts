export type ReferenceMode = "none" | "job" | "product";

export interface SelectableReference {
  url: string;
  source: "style" | "scene";
  sceneKey: string | null;
  label: string;
  thumbnailPath: string | null;
}

const SCENE_KEY_ORDER = [
  "default",
  "ring",
  "twin_rings",
  "bracelet",
  "earrings",
  "necklace",
  "half_set",
  "full_set",
  "general",
];

function sceneKeyLabel(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function buildSelectableReferences(
  template: Record<string, unknown>,
  _plates?: unknown[]
): SelectableReference[] {
  const options: SelectableReference[] = [];
  const seen = new Set<string>();

  const sceneRefs =
    (template.scene_references as Record<string, string[]> | undefined) ?? {};
  const orderedKeys = [
    ...SCENE_KEY_ORDER.filter((k) => k in sceneRefs),
    ...Object.keys(sceneRefs).filter((k) => !SCENE_KEY_ORDER.includes(k)),
  ];
  for (const key of orderedKeys) {
    for (const url of sceneRefs[key] ?? []) {
      if (!url.startsWith("http") || seen.has(url)) continue;
      seen.add(url);
      options.push({
        url,
        source: "scene",
        sceneKey: key,
        label: `Empty set · ${sceneKeyLabel(key)}`,
        thumbnailPath: url,
      });
    }
  }

  const styleRefs = (template.style_references as string[] | undefined) ?? [];
  styleRefs.forEach((url, i) => {
    if (!url.startsWith("http") || seen.has(url)) return;
    seen.add(url);
    options.push({
      url,
      source: "style",
      sceneKey: null,
      label: `Style reference ${i + 1}`,
      thumbnailPath: null,
    });
  });

  return options;
}

/** Strip the "Empty set · " prefix for compact UI labels. */
export function shortReferenceLabel(label: string): string {
  return label.replace(/^Empty set ·\s*/i, "");
}

/** Prefer default scene ref, else first scene ref. */
export function preferredSceneRefUrl(
  options: SelectableReference[]
): string | null {
  const scenes = options.filter((o) => o.source === "scene");
  if (!scenes.length) return null;
  return (
    scenes.find((o) => o.sceneKey === "default")?.url ?? scenes[0]?.url ?? null
  );
}

export function referenceLabel(
  options: SelectableReference[],
  url: string | null | undefined
): string | null {
  if (!url) return null;
  return options.find((o) => o.url === url)?.label ?? url;
}
