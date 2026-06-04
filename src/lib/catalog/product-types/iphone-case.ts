import {
  DEFAULT_STYLE,
  STYLES,
  STYLE_OPTION_NAME,
  MODEL_OPTION_NAME,
  IPHONE_MODELS,
  getBasePrice,
  getStylePrice,
} from "@/lib/pricing";
import type { ProductTypeConfig } from "../types";

export const iphoneCaseType: ProductTypeConfig = {
  id: "iphone_case",
  label: "iPhone Case",
  description: "Clear / kawaii phone cases with iPhone model + style bundles.",
  enabled: true,
  noun: "Case",
  options: [
    { name: MODEL_OPTION_NAME, values: [...IPHONE_MODELS], role: "compatibility" },
    { name: STYLE_OPTION_NAME, values: [...STYLES], role: "price" },
  ],
  mediaTagAxis: STYLE_OPTION_NAME,
  getBasePrice,
  getPriceFromOptions: (selected, currency) =>
    getStylePrice(selected[STYLE_OPTION_NAME] ?? DEFAULT_STYLE, currency),
};
