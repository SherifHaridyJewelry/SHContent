import type { ProductType } from "../api";

export const PRODUCT_TYPES: ProductType[] = [
  "ring",
  "twin_rings",
  "bracelet",
  "earrings",
  "necklace",
  "half_set",
  "full_set",
  "general",
];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  ring: "Ring",
  twin_rings: "Twin rings",
  bracelet: "Bracelet",
  earrings: "Earrings",
  necklace: "Necklace",
  half_set: "Half set",
  full_set: "Full set",
  general: "General",
};

export function typeLabel(type: ProductType | string): string {
  return PRODUCT_TYPE_LABELS[type as ProductType] ?? String(type);
}

/** Suggest next id client-side for preview (server allocates authoritatively on submit). */
export function suggestNextId(
  existingIds: string[],
  productType: ProductType
): string {
  const prefix = productType;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const id of existingIds) {
    const m = id.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const n = max + 1;
  return `${prefix}${n.toString().padStart(2, "0")}`;
}

export function suggestName(productType: ProductType, productId: string): string {
  const m = productId.match(new RegExp(`^${productType}(\\d+)$`));
  const suffix = m ? m[1] : "";
  const label = typeLabel(productType);
  return suffix ? `${label} ${suffix}` : productId;
}

export function nameFromFilename(filename: string, fallback: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  let cleaned = stem.replace(/^IMG[_-]?/i, "");
  cleaned = cleaned.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length < 2) return fallback;
  // Camera timestamps and other numeric-only stems aren't useful display names
  if (/^[\d\s_-]+$/.test(cleaned)) return fallback;
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}
