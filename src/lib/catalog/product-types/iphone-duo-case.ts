/**
 * iPhone Duo cases — the foldable's own line.
 *
 * The numbered iPhone cases do not fit this mould, so Duo is not a value on
 * the iPhone Model axis. It is its own product type and its own device
 * section. Duo sells Case Only, at the same price as an iPhone Case Only.
 * Grips and charms stay on the numbered iPhone line.
 */
import {
  DEFAULT_STYLE,
  STYLE_OPTION_NAME,
  getBasePrice,
  getStylePrice,
} from "@/lib/pricing";
import type { ProductTypeConfig } from "../types";

export const iphoneDuoCaseType: ProductTypeConfig = {
  id: "iphone_duo_case",
  label: "iPhone Duo Case",
  description:
    "Cases cut for iPhone Duo only. Case Only, at the iPhone Case Only price. Not offered on the numbered iPhone listings.",
  enabled: true,
  noun: "Case",
  options: [
    { name: STYLE_OPTION_NAME, values: [DEFAULT_STYLE], role: "price" },
  ],
  mediaTagAxis: STYLE_OPTION_NAME,
  getBasePrice,
  getPriceFromOptions: (selected, currency) =>
    getStylePrice(selected[STYLE_OPTION_NAME] ?? DEFAULT_STYLE, currency),
};
