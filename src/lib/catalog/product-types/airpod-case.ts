/**
 * AirPods cases — compatibility + a three-style price axis.
 *
 * Unlike the other flat-priced device lines, AirPods sell Case Only, Case +
 * Charm and Charm Only (no grip). Those three styles read PRICE_TABLE — the
 * same ledger as iPhone cases — so a currency or bundle change cannot drift
 * between the two lines.
 */
import {
  AIRPODS_STYLES,
  DEFAULT_STYLE,
  STYLE_OPTION_NAME,
  getAirpodsBasePrice,
  getAirpodsStylePrice,
} from "@/lib/pricing";
import type { ProductTypeConfig } from "../types";
import { AIRPODS_MODEL_OPTION_NAME, AIRPODS_MODELS } from "../airpods";

export const airpodCaseType: ProductTypeConfig = {
  id: "airpod_case",
  label: "AirPods Case",
  description:
    "AirPods / AirPods Pro cases — Case, Case + Charm or Charm Only; buyer picks fit.",
  enabled: true,
  noun: "Case",
  options: [
    {
      name: AIRPODS_MODEL_OPTION_NAME,
      values: [...AIRPODS_MODELS],
      role: "compatibility",
    },
    {
      name: STYLE_OPTION_NAME,
      values: [...AIRPODS_STYLES],
      role: "price",
    },
  ],
  mediaTagAxis: STYLE_OPTION_NAME,
  getBasePrice: getAirpodsBasePrice,
  getPriceFromOptions: (selected, currency) =>
    getAirpodsStylePrice(selected[STYLE_OPTION_NAME] ?? DEFAULT_STYLE, currency),
};
