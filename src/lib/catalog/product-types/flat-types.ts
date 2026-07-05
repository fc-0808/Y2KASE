/**
 * Flat-priced product types — every device line other than iPhone cases.
 *
 * These lines share one shape: a single *compatibility* axis (which device the
 * buyer owns) and a single flat price per product. The compatibility choice is
 * a free selection that does NOT change the price (mirroring how the iPhone
 * "Model" axis works), so `getPriceFromOptions` just returns the base price.
 *
 * Pricing here is the entry/base price; a per-product `listing.json` or a
 * `catalog.config.json` category rule can still override `price` at ingest.
 * The numbers below are sensible *starting points* — edit `USD_BASE` (and the
 * FX rates) to match your real pricing.
 *
 * Adding/realising a new device is a config change only: define it here, then
 * make sure the `devices.ts` taxonomy maps the device to this product type.
 */
import type { ProductTypeConfig, ProductTypeId } from "../types";

/**
 * Base price in USD per line. Other currencies are derived from these via
 * {@link FX_FROM_USD}. Tune freely — these are deliberate defaults, not magic.
 */
const USD_BASE: Record<string, number> = {
  airpod_case: 16.99,
  samsung_case: 18.49,
  pixel_case: 18.49,
  ipad_case: 26.99,
  macbook_case: 32.99,
  kindle_case: 21.99,
  watch_band: 14.99,
  apple_accessory: 12.99,
};

/** Rough FX multipliers from USD, matching the currencies the store supports. */
const FX_FROM_USD: Record<string, number> = {
  USD: 1,
  CAD: 1.35,
  HKD: 7.84,
  CNY: 7.14,
};

function flatPrices(usd: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [currency, rate] of Object.entries(FX_FROM_USD)) {
    out[currency] = Math.round(usd * rate * 100) / 100;
  }
  return out;
}

/** Build a flat-priced type with an optional single compatibility axis. */
function flatType(opts: {
  id: ProductTypeId;
  label: string;
  description: string;
  noun: string;
  /** Compatibility axis (device fit). Omit for a universal accessory. */
  axis?: { name: string; values: string[] };
}): ProductTypeConfig {
  const prices = flatPrices(USD_BASE[opts.id] ?? 0);
  const priceFor = (currency: string) =>
    prices[currency?.toUpperCase()] ?? prices.USD;

  return {
    id: opts.id,
    label: opts.label,
    description: opts.description,
    enabled: true,
    noun: opts.noun,
    options: opts.axis
      ? [
          {
            name: opts.axis.name,
            values: opts.axis.values,
            role: "compatibility",
          },
        ]
      : [],
    getBasePrice: priceFor,
    // Flat pricing: the compatibility selection never changes the price.
    getPriceFromOptions: (_options, currency) => priceFor(currency),
  };
}

export const airpodCaseType = flatType({
  id: "airpod_case",
  label: "AirPods Case",
  description: "AirPods / AirPods Pro cases — one flat price, buyer picks fit.",
  noun: "Case",
  axis: {
    name: "AirPods Model",
    values: [
      "AirPods Pro 3",
      "AirPods Pro 2",
      "AirPods 4",
      "AirPods 3",
      "AirPods 1 / 2",
      "AirPods Max",
    ],
  },
});

export const samsungCaseType = flatType({
  id: "samsung_case",
  label: "Samsung Case",
  description: "Galaxy phone cases — one flat price, buyer picks their model.",
  noun: "Case",
  axis: {
    name: "Galaxy Model",
    values: [
      "Galaxy S25 Ultra",
      "Galaxy S25+",
      "Galaxy S25",
      "Galaxy S24 Ultra",
      "Galaxy S24+",
      "Galaxy S24",
      "Galaxy Z Flip 6",
      "Galaxy Z Fold 6",
      "Galaxy A55",
    ],
  },
});

export const pixelCaseType = flatType({
  id: "pixel_case",
  label: "Pixel Case",
  description: "Google Pixel cases — one flat price, buyer picks their model.",
  noun: "Case",
  axis: {
    name: "Pixel Model",
    values: [
      "Pixel 9 Pro XL",
      "Pixel 9 Pro",
      "Pixel 9",
      "Pixel 8 Pro",
      "Pixel 8",
      "Pixel 8a",
      "Pixel 7 Pro",
      "Pixel 7",
    ],
  },
});

export const ipadCaseType = flatType({
  id: "ipad_case",
  label: "iPad Case",
  description:
    "iPad covers / folios — one flat price, buyer picks their model.",
  noun: "Case",
  axis: {
    name: "iPad Model",
    values: [
      'iPad Pro 13" (M4)',
      'iPad Pro 11" (M4)',
      'iPad Air 13"',
      'iPad Air 11"',
      "iPad 10th gen",
      "iPad mini 7",
    ],
  },
});

export const macbookCaseType = flatType({
  id: "macbook_case",
  label: "MacBook Case",
  description:
    "MacBook hard shells / sleeves — one flat price, buyer picks size.",
  noun: "Case",
  axis: {
    name: "MacBook Model",
    values: [
      'MacBook Air 13"',
      'MacBook Air 15"',
      'MacBook Pro 14"',
      'MacBook Pro 16"',
    ],
  },
});

export const kindleCaseType = flatType({
  id: "kindle_case",
  label: "Kindle Case",
  description:
    "Kindle sleeves / cases — one flat price, buyer picks their model.",
  noun: "Case",
  axis: {
    name: "Kindle Model",
    values: [
      "Kindle Paperwhite (12th gen)",
      "Kindle Colorsoft",
      "Kindle (11th gen)",
      "Kindle Scribe",
      "Kindle Oasis",
    ],
  },
});

export const watchBandType = flatType({
  id: "watch_band",
  label: "Apple Watch Band",
  description:
    "Apple Watch bands — one flat price, buyer picks their case size.",
  noun: "Band",
  axis: {
    name: "Watch Size",
    values: ["49mm / 45mm / 44mm / 42mm", "41mm / 40mm / 38mm"],
  },
});

export const appleAccessoryType = flatType({
  id: "apple_accessory",
  label: "Apple Accessory",
  description:
    "AirTag holders, chargers and other accessories — one universal flat price.",
  noun: "Accessory",
});
