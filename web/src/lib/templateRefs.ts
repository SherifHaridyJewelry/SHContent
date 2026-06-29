export type ReferenceMode = "none" | "job" | "product";

export interface SelectableReference {
  url: string;
  source: "style" | "scene";
  sceneKey: string | null;
  label: string;
  thumbnailPath: string | null;
}

export function buildSelectableReferences(
  template: Record<string, unknown>,
  _plates?: unknown[]
): SelectableReference[] {
  const options: SelectableReference[] = [];
  const seen = new Set<string>();

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

  const sceneRefs = (template.scene_references as Record<string, string[]> | undefined) ?? {};
  for (const [key, urls] of Object.entries(sceneRefs)) {
    for (const url of urls ?? []) {
      if (!url.startsWith("http") || seen.has(url)) continue;
      seen.add(url);
      options.push({
        url,
        source: "scene",
        sceneKey: key,
        label: `Scene ref: ${key}`,
        thumbnailPath: url,
      });
    }
  }

  return options;
}

export function referenceLabel(
  options: SelectableReference[],
  url: string | null | undefined
): string | null {
  if (!url) return null;
  return options.find((o) => o.url === url)?.label ?? url;
}