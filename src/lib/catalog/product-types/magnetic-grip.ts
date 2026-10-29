/**
 * Magnetic grips — a grip sold on its own, not a style of a phone case.
 *
 * The price is the iPhone case price (Case Only) in every currency. A phone
 * case that happens to include a grip stays an iPhone case.
 */
import { getBasePrice } from "@/lib/pricing";
import type { ProductTypeConfig } from "../types";

export const magneticGripType: ProductTypeConfig = {
  id: "magnetic_grip",
  label: "Magnetic Grip",
  description:
    "A magnetic grip sold on its own, at the same price as an iPhone case.",
  enabled: true,
  noun: "Grip",
  options: [],
  getBasePrice,
  getPriceFromOptions: (_selected, currency) => getBasePrice(currency),
};
