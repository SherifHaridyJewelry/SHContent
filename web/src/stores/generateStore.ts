import { create } from "zustand";
import { GenerationModel, ProductType, ReferenceMode } from "../api";

type JobRefChoice = "none" | "job";

interface GenerateStoreState {
  selectedProductIds: string[];
  /** Focused template (scene-ref picker + library link). */
  template: string;
  /** One or more templates to run for the same product set. */
  selectedTemplates: string[];
  analyze: boolean;
  model: GenerationModel;
  typeFilter: ProductType | "";
  collectionFilter: string;
  jobRefChoice: JobRefChoice;
  jobRefUrl: string;
  productRefs: Record<string, string>;
  showPerProductRefs: boolean;
  toggleProduct: (id: string) => void;
  setSelectedProductIds: (ids: string[]) => void;
  clearSelection: () => void;
  removeFromSelection: (ids: string[]) => void;
  setTemplate: (template: string) => void;
  toggleTemplate: (template: string) => void;
  setSelectedTemplates: (templates: string[]) => void;
  setAnalyze: (analyze: boolean) => void;
  setModel: (model: GenerationModel) => void;
  setTypeFilter: (type: ProductType | "") => void;
  setCollectionFilter: (collection: string) => void;
  setJobRefChoice: (choice: JobRefChoice) => void;
  setJobRefUrl: (url: string) => void;
  setProductRef: (productId: string, url: string) => void;
  setShowPerProductRefs: (show: boolean) => void;
  resetTemplateRefs: () => void;
  buildReferencePayload: (selectedIds: Set<string>) => {
    reference_mode: ReferenceMode;
    selected_ref_url?: string;
    product_refs?: Record<string, string>;
  };
}

const DEFAULT_TEMPLATE = "jewelry_catalog_4x5";

export const useGenerateStore = create<GenerateStoreState>((set, get) => ({
  selectedProductIds: [],
  template: DEFAULT_TEMPLATE,
  selectedTemplates: [DEFAULT_TEMPLATE],
  analyze: true,
  model: "nano-banana-2",
  typeFilter: "",
  collectionFilter: "",
  jobRefChoice: "none",
  jobRefUrl: "",
  productRefs: {},
  showPerProductRefs: false,

  toggleProduct: (id) => {
    set((state) => {
      const setIds = new Set(state.selectedProductIds);
      if (setIds.has(id)) setIds.delete(id);
      else setIds.add(id);
      return { selectedProductIds: Array.from(setIds) };
    });
  },

  setSelectedProductIds: (ids) => set({ selectedProductIds: ids }),

  clearSelection: () =>
    set({ selectedProductIds: [], productRefs: {}, showPerProductRefs: false }),

  removeFromSelection: (ids) => {
    const remove = new Set(ids);
    set((state) => ({
      selectedProductIds: state.selectedProductIds.filter((id) => !remove.has(id)),
      productRefs: Object.fromEntries(
        Object.entries(state.productRefs).filter(([id]) => !remove.has(id))
      ),
    }));
  },

  setTemplate: (template) =>
    set((state) => {
      const selected = state.selectedTemplates.includes(template)
        ? state.selectedTemplates
        : [...state.selectedTemplates, template];
      return { template, selectedTemplates: selected };
    }),

  toggleTemplate: (name) =>
    set((state) => {
      const has = state.selectedTemplates.includes(name);
      if (has) {
        if (state.selectedTemplates.length <= 1) return state;
        const selectedTemplates = state.selectedTemplates.filter((t) => t !== name);
        const template =
          state.template === name ? selectedTemplates[0] : state.template;
        return { selectedTemplates, template };
      }
      return {
        selectedTemplates: [...state.selectedTemplates, name],
        template: name,
      };
    }),

  setSelectedTemplates: (templates) => {
    if (!templates.length) return;
    set((state) => ({
      selectedTemplates: templates,
      template: templates.includes(state.template) ? state.template : templates[0],
    }));
  },

  setAnalyze: (analyze) => set({ analyze }),

  setModel: (model) => set({ model }),

  setTypeFilter: (typeFilter) => set({ typeFilter }),

  setCollectionFilter: (collectionFilter) => set({ collectionFilter }),

  setJobRefChoice: (jobRefChoice) =>
    set({
      jobRefChoice,
      jobRefUrl: jobRefChoice === "none" ? "" : get().jobRefUrl,
    }),

  setJobRefUrl: (jobRefUrl) => set({ jobRefUrl }),

  setProductRef: (productId, url) => {
    set((state) => {
      const next = { ...state.productRefs };
      if (!url) delete next[productId];
      else next[productId] = url;
      return { productRefs: next };
    });
  },

  setShowPerProductRefs: (showPerProductRefs) => set({ showPerProductRefs }),

  resetTemplateRefs: () =>
    set({
      jobRefChoice: "none",
      jobRefUrl: "",
      productRefs: {},
    }),

  buildReferencePayload: (selectedIds) => {
    const { jobRefChoice, jobRefUrl, productRefs } = get();
    const activeProductRefs = Object.fromEntries(
      Object.entries(productRefs).filter(([id, url]) => selectedIds.has(id) && url)
    );
    if (jobRefChoice === "job" && jobRefUrl) {
      return { reference_mode: "job" as const, selected_ref_url: jobRefUrl };
    }
    if (Object.keys(activeProductRefs).length > 0) {
      return { reference_mode: "product" as const, product_refs: activeProductRefs };
    }
    return { reference_mode: "none" as const };
  },
}));
