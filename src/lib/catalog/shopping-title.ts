/**
 * Google Shopping title.
 *
 * The catalog title is written for the product page. It ends with every
 * generation the case fits (`for iPhone 18 17 16 15 14 13 Pro Max`), so the
 * words Google matches — the character, iPhone 18 Pro, and the style — sit
 * too far back. Shopping shows the front of `g:title` and ignores the HTML
 * title on the page.
 *
 * Shape, front to back:
 *   {character} {iPhone 18 Pro and Pro Max} {clear / glitter / charm / …} Case — MagSafe
 *
 * One feed item still covers every model the product offers. The title names
 * iPhone 18 Pro and iPhone 18 Pro Max when both are offered, because that is
 * the search, and there is no separate base iPhone 18. Older generations stay
 * off the title. AirPods, iPhone Duo, and other lines never borrow the
 * iPhone 18 phrase.
 *
 * Google's limit is 150 characters. The store name stays in `g:brand`.
 */

import { BRAND_KNOWLEDGE } from "@/lib/catalog/brands";
import { MAGSAFE_TITLE_SUFFIX } from "@/lib/catalog/magsafe";
import { IPHONE_MODELS } from "@/lib/pricing";

export const SHOPPING_TITLE_MAX = 150;

export type ShoppingTitleInput = {
  title: string;
  productType: string;
  characterName?: string | null;
  brandName?: string | null;
  /** Offered fit values, such as "iPhone 18 Pro". Empty falls back to the title. */
  models?: readonly string[];
  /** Reviewed MagSafe tag. A MagSafe word in the title counts too. */
  magsafe?: boolean;
};

const CHARACTER_NAMES = BRAND_KNOWLEDGE.flatMap((brand) =>
  (brand.characters ?? []).map((character) => character.name),
).sort((a, b) => b.length - a.length);

const BRAND_NAMES = BRAND_KNOWLEDGE.map((brand) => brand.brand).sort(
  (a, b) => b.length - a.length,
);

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "with",
  "for",
  "of",
  "in",
  "on",
  "to",
  "from",
  "phone",
  "phones",
  "case",
  "cases",
  "kawaii",
  "cute",
  "y2k",
  "sanrio",
  "design",
  "designs",
  "featuring",
  "style",
  "styled",
  "print",
  "printed",
  "cover",
  "covers",
  "aesthetic",
  "official",
  "new",
  "iphone",
  "airpods",
  "magsafe",
  "clear",
  "glitter",
  "holographic",
  "iridescent",
  "sparkle",
  "sparkly",
  "charm",
  "charms",
  "grip",
  "strap",
  "beaded",
  "pop",
  "socket",
  "popsocket",
  "duo",
  "out",
]);

type StyleRule = { label: string; pattern: RegExp };

/** First match wins, in the order a shopper scans a result. */
const STYLE_RULES: StyleRule[] = [
  { label: "Clear", pattern: /\bclears?\b/i },
  { label: "Glitter", pattern: /\bglitter\b/i },
  { label: "Holographic", pattern: /\bholographic\b/i },
  { label: "Iridescent", pattern: /\biridescent\b/i },
  { label: "Sparkle", pattern: /\bsparkles?\b|\bsparkly\b/i },
  { label: "Charm", pattern: /\bcharms?\b/i },
  { label: "Grip", pattern: /\b(grip|pop\s?socket|pop\s?grip)\b/i },
  { label: "Beaded Strap", pattern: /\bbeaded\s+strap\b/i },
  { label: "Strap", pattern: /\bstrap\b/i },
];

export function shoppingTitle(input: ShoppingTitleInput): string {
  const catalog = input.title.replace(/\s+/g, " ").trim();
  const head = headBeforeDevice(catalog);
  const lead = resolveLead(head, input.characterName, input.brandName);
  const device = iphonePhrase(
    input.models && input.models.length > 0
      ? input.models
      : impliedIphoneModels(catalog),
  );
  const styles = styleWords(head);
  const distinctive = distinctiveWords(head, lead, input.brandName, styles);
  const noun = nounFor(input.productType);
  const parts = [lead, deviceFor(input.productType, device), ...styles, ...distinctive, noun].filter(
    (part): part is string => Boolean(part),
  );
  const magsafe =
    input.productType !== "airpod_case" &&
    (input.magsafe === true || /\bmagsafe\b/i.test(catalog));
  const built = fit(parts, magsafe);
  return built || catalog.slice(0, SHOPPING_TITLE_MAX);
}

function deviceFor(productType: string, iphone: string | null): string | null {
  switch (productType) {
    case "iphone_case":
      return iphone;
    case "iphone_duo_case":
      return "iPhone Duo";
    case "airpod_case":
      return "AirPods";
    case "samsung_case":
      return "Galaxy";
    case "pixel_case":
      return "Pixel";
    case "ipad_case":
      return "iPad";
    case "macbook_case":
      return "MacBook";
    case "kindle_case":
      return "Kindle";
    default:
      return null;
  }
}

function nounFor(productType: string): string | null {
  if (productType === "magnetic_grip") return "Magnetic Grip";
  if (productType === "watch_band") return "Watch Band";
  if (productType === "apple_accessory") return null;
  return "Case";
}

function iphonePhrase(models: readonly string[]): string | null {
  const hasPro = models.includes("iPhone 18 Pro");
  const hasMax = models.includes("iPhone 18 Pro Max");
  if (hasPro && hasMax) return "iPhone 18 Pro and Pro Max";
  if (hasMax) return "iPhone 18 Pro Max";
  if (hasPro) return "iPhone 18 Pro";
  for (let i = IPHONE_MODELS.length - 1; i >= 0; i--) {
    const model = IPHONE_MODELS[i];
    if (model && models.includes(model)) return model;
  }
  return null;
}

/**
 * Catalog titles write "for iPhone 18 17 16 15 14 13 Pro Max" for a case
 * that is sold as both iPhone 18 Pro and iPhone 18 Pro Max. There is no
 * base iPhone 18 mould.
 */
function impliedIphoneModels(title: string): string[] {
  const match = title.match(
    /for iPhone\s+((?:\d{2}\b[\s/]*)+)(Pro Max|Pro)?/i,
  );
  if (!match) return [];
  const years = match[1]?.match(/\d{2}/g) ?? [];
  const tier = match[2];
  const out: string[] = [];
  for (const year of years) {
    if (year === "18") {
      out.push("iPhone 18 Pro", "iPhone 18 Pro Max");
      continue;
    }
    if (/pro max/i.test(tier ?? "")) out.push(`iPhone ${year} Pro Max`);
    else if (/pro/i.test(tier ?? "")) out.push(`iPhone ${year} Pro`);
    else out.push(`iPhone ${year}`);
  }
  return out;
}

function headBeforeDevice(title: string): string {
  const stripped = title
    .replace(/\s+[—–-]\s+MagSafe\s*$/i, "")
    .replace(/\bmag\s?-?safe\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const at = stripped.search(/\sfor\s+(?:iPhone|AirPods|Galaxy|iPad|Pixel)\b/i);
  return (at === -1 ? stripped : stripped.slice(0, at)).trim();
}

function resolveLead(
  head: string,
  characterName: string | null | undefined,
  brandName: string | null | undefined,
): string | null {
  const recorded = characterName?.trim();
  if (recorded && !/^sanrio$/i.test(recorded)) return recorded;
  const character = firstMention(head, CHARACTER_NAMES);
  if (character) return character;
  const recordedBrand = brandName?.trim();
  if (recordedBrand && !/^sanrio$/i.test(recordedBrand)) return recordedBrand;
  return firstMention(head, BRAND_NAMES.filter((name) => !/^sanrio$/i.test(name)));
}

function firstMention(text: string, names: readonly string[]): string | null {
  let best: { name: string; index: number } | null = null;
  for (const name of names) {
    const index = mentionIndex(text, name);
    if (index === -1) continue;
    if (
      !best ||
      name.length > best.name.length ||
      (name.length === best.name.length && index < best.index)
    ) {
      best = { name, index };
    }
  }
  return best?.name ?? null;
}

function mentionIndex(text: string, name: string): number {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)(${escaped})(?=\\s|$)`, "i").exec(text);
  return match?.index ?? -1;
}

function styleWords(head: string): string[] {
  const found: string[] = [];
  for (const rule of STYLE_RULES) {
    if (rule.label === "Strap" && found.includes("Beaded Strap")) continue;
    if (!rule.pattern.test(head)) continue;
    found.push(rule.label);
  }
  return found;
}

function distinctiveWords(
  head: string,
  lead: string | null,
  brandName: string | null | undefined,
  styles: readonly string[],
): string[] {
  const used = new Set(
    [lead, brandName, "Sanrio", ...styles]
      .filter(Boolean)
      .flatMap((name) => tokenize(name as string).map((token) => token.toLowerCase())),
  );
  const out: string[] = [];
  for (const token of tokenize(head)) {
    const key = token.toLowerCase();
    if (STOP.has(key) || used.has(key) || /^\d+$/.test(key)) continue;
    used.add(key);
    out.push(presentToken(token));
    if (out.length === 3) break;
  }
  return out;
}

function presentToken(token: string): string {
  if (/[A-Z]/.test(token)) return token;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function tokenize(value: string): string[] {
  return value
    .split(/[\s,/|–—-]+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}&]+|[^\p{L}\p{N}&]+$/gu, ""))
    .filter((token) => token.length > 1 || /^\d[A-Za-z]$/.test(token));
}

function fit(parts: string[], magsafe: boolean): string {
  const suffix = magsafe ? MAGSAFE_TITLE_SUFFIX : "";
  const budget = SHOPPING_TITLE_MAX - suffix.length;
  const words = [...parts];
  while (words.join(" ").length > budget && words.length > 1) {
    const noun = words[words.length - 1] ?? "";
    if (words.length > 2 && /case|grip|band/i.test(noun)) {
      words.splice(words.length - 2, 1);
    } else {
      words.pop();
    }
  }
  const joined = `${words.join(" ")}${suffix}`.replace(/\s+/g, " ").trim();
  return joined.length <= SHOPPING_TITLE_MAX
    ? joined
    : joined.slice(0, SHOPPING_TITLE_MAX).trim();
}
