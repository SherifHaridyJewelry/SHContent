/** Match scripts/naming.py helpers for client-side lookups and labels. */

const PRODUCT_ID_PATTERN =
  /^(?:half_set|full_set|ring|bracelet|earrings|necklace|general)\d{2,}$/;

export function parseProductIdFromOutput(stem: string): string | null {
  const parsed = parseOutputName(stem);
  if (parsed) return parsed.productId;

  const parts = stem.split("_");
  if (parts.length >= 2 && (parts[0] === "catalog" || parts[0] === "product")) {
    return parts[1];
  }
  return null;
}

export function parseOutputName(stem: string): {
  prefix: string;
  productId: string;
  templateSlug: string;
  runId: string | null;
} | null {
  const runMatch = stem.match(/^(.+)_([a-f0-9]{8})$/);
  const runId = runMatch ? runMatch[2] : null;
  const withoutRun = runMatch ? runMatch[1] : stem;

  const match = withoutRun.match(
    /^(catalog|product)_((?:half_set|full_set|ring|bracelet|earrings|necklace|general)\d{2,})(?:_(.+))?$/
  );
  if (!match) return null;

  return {
    prefix: match[1],
    productId: match[2],
    templateSlug: match[3] ?? "",
    runId,
  };
}

export function formatProductIdLabel(productId: string): string {
  for (const prefix of ["half_set", "full_set"]) {
    if (productId.startsWith(prefix)) {
      const suffix = productId.slice(prefix.length);
      if (/^\d+$/.test(suffix)) {
        const label = prefix
          .split("_")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
        return `${label} ${suffix}`;
      }
    }
  }
  const match = productId.match(/^([a-z]+)(\d+)$/);
  if (match) {
    return `${match[1].charAt(0).toUpperCase()}${match[1].slice(1)} ${match[2]}`;
  }
  return productId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatTemplateSlugLabel(slug: string): string {
  if (!slug) return "Default";
  return slug
    .replace(/_4x5$/, " 4:5")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatScenePlateLabel(stem: string): string {
  if (stem.startsWith("scene_plate_")) {
    return stem
      .slice("scene_plate_".length)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return stem.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatGenerationLabel(
  stem: string,
  productLabel?: string | null
): string {
  if (stem.startsWith("scene_plate_")) {
    return formatScenePlateLabel(stem);
  }

  const parsed = parseOutputName(stem);
  if (parsed) {
    const name = productLabel || formatProductIdLabel(parsed.productId);
    const template = formatTemplateSlugLabel(parsed.templateSlug);
    if (parsed.runId) {
      return `${name} · ${template} · ${parsed.runId}`;
    }
    return `${name} · ${template}`;
  }

  return productLabel || stem.replace(/_/g, " ");
}

export function isKnownProductId(value: string): boolean {
  return PRODUCT_ID_PATTERN.test(value);
}
