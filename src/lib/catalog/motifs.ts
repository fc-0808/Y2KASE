/**
 * Motif facet — what is *depicted* on the case, independent of who owns it.
 *
 * Licensed IP answers "whose face is this?" (Sanrio, Miffy). Roughly a third
 * of this catalogue has no answer: rainy clouds, original puppies, bows,
 * breakfast toast. Those products were falling into a "No brand" dead end —
 * Shop the universe is character-first, the brand facet has nothing to tick,
 * and the only door left was Shop All. Motif is the missing shopper question:
 * "I want a puppy case" / "I want clouds".
 *
 * Same contract as colour: a closed family list (so "daisy" and "sakura" do
 * not fragment into two dead-end checkboxes), OR-within / AND-across boolean
 * logic, live counts, URL state. Families are the unit of filtering; aliases
 * are how we recognise them.
 *
 * ── What this module will not do ────────────────────────────────────────────
 * It never infers a motif from a character ("Hello Kitty → cat", "Cinnamoroll
 * → clouds"). That guess is frequently wrong for the print actually on the
 * case, and it trains the filter to lie. Known IP names are stripped from the
 * haystack before matching so a Chinese folder named 凯蒂猫 cannot fire 猫.
 *
 * Pure: no I/O, no React, no database.
 */

import { ipRecognitionPhrases } from "./brands";

/** Canonical family slugs — also the `?motif=` query values and DB storage. */
export const MOTIF_FAMILY_SLUGS = [
  "puppy",
  "bunny",
  "cat",
  "bear",
  "animals",
  "clouds",
  "stars",
  "florals",
  "bows",
  "hearts",
  "fruit",
  "food",
  "dolls",
  "patterns",
] as const;

export type MotifFamilySlug = (typeof MOTIF_FAMILY_SLUGS)[number];

const MOTIF_SLUG_SET = new Set<string>(MOTIF_FAMILY_SLUGS);

export function isMotifFamilySlug(value: string): value is MotifFamilySlug {
  return MOTIF_SLUG_SET.has(value);
}

export type MotifFamily = {
  slug: MotifFamilySlug;
  /** Shopper-facing label. Title Case, never the slug. */
  label: string;
  /** Filter-row glyph — visual, not a substitute for the label. */
  icon: string;
  /**
   * Recognition vocabulary. Latin aliases match on word boundaries; CJK
   * aliases match as substrings. Longer phrases are compiled longest-first
   * so "polka dot" wins over "dot" and "rain cloud" wins over "rain".
   */
  aliases: readonly string[];
};

/**
 * Display order is conversion order for this catalogue, not alphabet:
 * the animal searches kawaii shoppers actually type, then sky/print, then
 * the pretty-things cluster, then food, dolls and surface pattern. The
 * filter menu renders in this order so the layout is stable across pages.
 */
export const MOTIF_FAMILIES: readonly MotifFamily[] = [
  {
    slug: "puppy",
    label: "Puppy",
    icon: "🐶",
    aliases: [
      "puppy",
      "puppies",
      "pup",
      "pups",
      "doggie",
      "doggies",
      "doggo",
      "puppy dog",
      "dog",
      "dogs",
      "小狗",
      "狗狗",
      "汪星人",
    ],
  },
  {
    slug: "bunny",
    label: "Bunny",
    icon: "🐰",
    aliases: [
      "bunny",
      "bunnies",
      "rabbit",
      "rabbits",
      "hare",
      "兔子",
      "兔兔",
      "小兔子",
    ],
  },
  {
    slug: "cat",
    label: "Cat",
    icon: "🐱",
    aliases: ["cat", "cats", "kitten", "kittens", "猫咪", "小猫", "喵星人"],
  },
  {
    slug: "bear",
    label: "Bear",
    icon: "🧸",
    aliases: [
      "bear",
      "bears",
      "teddy",
      "teddy bear",
      "teddybear",
      "小熊",
      "泰迪熊",
      "熊熊",
    ],
  },
  {
    slug: "animals",
    label: "Animals",
    icon: "🐼",
    aliases: [
      "penguin",
      "penguins",
      "koala",
      "koalas",
      "monkey",
      "monkeys",
      "elephant",
      "elephants",
      "whale",
      "whales",
      "pig",
      "pigs",
      "piggy",
      "pig face",
      "frog",
      "frogs",
      "duck",
      "ducks",
      "chick",
      "chicks",
      "hamster",
      "hamsters",
      "squirrel",
      "panda",
      "pandas",
      "fox",
      "foxes",
      "unicorn",
      "unicorns",
      "dinosaur",
      "dino",
      "shark",
      "sharks",
      "alien",
      "aliens",
      "butterfly",
      "butterflies",
      "moth",
      "moths",
      "baby mouse",
      "mice",
      "企鹅",
      "考拉",
      "猴子",
      "大象",
      "鲸鱼",
      "小猪",
      "青蛙",
      "鸭子",
      "仓鼠",
      "熊猫",
      "小鼠",
      "蝴蝶",
    ],
  },
  {
    slug: "clouds",
    label: "Clouds",
    icon: "☁️",
    aliases: [
      "rainy cloud",
      "rain cloud",
      "cloud",
      "clouds",
      "cloudy",
      "raindrop",
      "raindrops",
      "云朵",
      "云彩",
      "下雨",
      "雨云",
    ],
  },
  {
    slug: "stars",
    label: "Stars",
    icon: "⭐",
    aliases: [
      "starry",
      "star",
      "stars",
      "moon",
      "moons",
      "celestial",
      "constellation",
      "星星",
      "月亮",
      "星空",
    ],
  },
  {
    slug: "florals",
    label: "Florals",
    icon: "🌸",
    aliases: [
      "cherry blossom",
      "sunflower",
      "sunflowers",
      "daisy",
      "daisies",
      "floral",
      "florals",
      "flower",
      "flowers",
      "blossom",
      "blossoms",
      "sakura",
      "rose print",
      "rose flower",
      "碎花",
      "花朵",
      "小花",
      "花卉",
      "雏菊",
      "向日葵",
    ],
  },
  {
    slug: "bows",
    label: "Bows",
    icon: "🎀",
    aliases: ["bow", "bows", "ribbon", "ribbons", "蝴蝶结", "丝带"],
  },
  {
    slug: "hearts",
    label: "Hearts",
    icon: "💖",
    aliases: ["heart", "hearts", "heart wing", "爱心", "心形"],
  },
  {
    slug: "fruit",
    label: "Fruit",
    icon: "🍓",
    aliases: [
      "strawberry",
      "strawberries",
      "cherry",
      "cherries",
      "lemon",
      "lemons",
      "peach",
      "peaches",
      "grape",
      "grapes",
      "watermelon",
      "banana",
      "bananas",
      "草莓",
      "樱桃",
      "柠檬",
      "桃子",
      "西瓜",
      "香蕉",
      "苹果",
    ],
  },
  {
    slug: "food",
    label: "Food",
    icon: "🍞",
    aliases: [
      "breakfast",
      "toast",
      "brunch",
      "dessert",
      "candy",
      "cake",
      "cookie",
      "cookies",
      "ice cream",
      "icecream",
      "cafe",
      "café",
      "chef",
      "bakery",
      "早餐",
      "吐司",
      "甜品",
      "冰淇淋",
      "蛋糕",
    ],
  },
  {
    slug: "dolls",
    label: "Dolls",
    icon: "👧",
    aliases: [
      "pixel girl",
      "anime girl",
      "flower girl",
      "cute girl",
      "anime character",
      "cartoon character",
      "doll",
      "dolls",
      "doll art",
      "girl print",
      "blonde",
      "小玉",
    ],
  },
  {
    slug: "patterns",
    label: "Patterns",
    icon: "🔲",
    aliases: [
      "polka dot",
      "polka dots",
      "polkadot",
      "dot print",
      "gingham",
      "leopard",
      "cheetah",
      "checkerboard",
      "checkered",
      "checkers",
      "checker",
      "striped",
      "stripes",
      "stripe",
      "plaid",
      "grid",
      "波点",
      "格纹",
      "条纹",
      "豹纹",
    ],
  },
] as const;

const FAMILY_BY_SLUG: Record<MotifFamilySlug, MotifFamily> = Object.fromEntries(
  MOTIF_FAMILIES.map((family) => [family.slug, family]),
) as Record<MotifFamilySlug, MotifFamily>;

export function motifFamily(slug: MotifFamilySlug): MotifFamily {
  return FAMILY_BY_SLUG[slug];
}

export function motifFamilyLabel(slug: string): string {
  return isMotifFamilySlug(slug) ? FAMILY_BY_SLUG[slug].label : slug;
}

export const MAX_PRODUCT_MOTIFS = 4;

// ── Matching ────────────────────────────────────────────────────────────────

const CJK_CHAR = /[\u3400-\u9fff]/;

/**
 * CJK licensed-character names that are not in the Latin brand registry.
 * Stripped before matching so 凯蒂猫 cannot fire 猫, 大耳狗 cannot fire 狗.
 */
const CJK_IP_BLOCKLIST = [
  "凯蒂猫",
  "凱蒂貓",
  "库洛米",
  "庫洛米",
  "可罗米",
  "酷洛米",
  "美乐蒂",
  "美樂蒂",
  "大耳狗",
  "玉桂狗",
  "帕恰狗",
  "布丁狗",
  "轻松熊",
  "輕鬆熊",
  "牛奶熊",
  "米菲",
  "蛋黄哥",
  "蛋黃哥",
  "小新",
  "蜡笔小新",
  "蠟筆小新",
  "史迪奇",
  "维尼",
  "維尼",
  "小熊维尼",
  "米奇",
  "米妮",
  "三丽鸥",
  "三麗鷗",
] as const;

type LatinRule = { re: RegExp; slug: MotifFamilySlug; length: number };
type CjkRule = { needle: string; slug: MotifFamilySlug; length: number };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileRules(): { latin: LatinRule[]; cjk: CjkRule[] } {
  const latin: LatinRule[] = [];
  const cjk: CjkRule[] = [];
  const seenLatin = new Set<string>();
  const seenCjk = new Set<string>();

  for (const family of MOTIF_FAMILIES) {
    for (const raw of family.aliases) {
      const alias = raw.trim();
      if (!alias) continue;
      if (CJK_CHAR.test(alias)) {
        if (seenCjk.has(alias)) continue;
        seenCjk.add(alias);
        cjk.push({ needle: alias, slug: family.slug, length: alias.length });
        continue;
      }
      const key = alias.toLowerCase();
      if (seenLatin.has(key)) continue;
      seenLatin.add(key);
      latin.push({
        re: new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(key)}(?:$|[^a-z0-9])`, "i"),
        slug: family.slug,
        length: key.length,
      });
    }
  }

  latin.sort((a, b) => b.length - a.length);
  cjk.sort((a, b) => b.length - a.length);
  return { latin, cjk };
}

const RULES = compileRules();

const LATIN_IP_STRIP = ipRecognitionPhrases()
  .filter((phrase) => !CJK_CHAR.test(phrase))
  .map((phrase) => ({
    re: new RegExp(
      `(?:^|[^a-z0-9])${escapeRegExp(phrase.toLowerCase())}(?:$|[^a-z0-9])`,
      "i",
    ),
    length: phrase.length,
  }))
  .sort((a, b) => b.length - a.length);

const CJK_IP_STRIP = [...CJK_IP_BLOCKLIST].sort((a, b) => b.length - a.length);

/**
 * Accessory copy that is not a print motif. Nearly every case in this
 * catalogue ships with a beaded charm strap; treating "3D Cat Charm" as
 * the Cat facet would make the filter useless. Hello Kitty "cat-ear"
 * hardware is the same class of lie.
 *
 * Required context (`with` / `3d` / `beaded`) so "Puppy Charm Phone Case"
 * — where the puppy *is* the print — still classifies.
 */
const LATIN_NOISE_STRIP = [
  "star charm",
  "star pendant",
  "star strap",
  "moon charm",
  "character charm",
  "beaded charm",
  "twin stars",
  "cat-ear",
  "cat ear",
  "cat ears",
  "kitty ear",
  "kitty ears",
].map((phrase) => ({
  re: new RegExp(
    `(?:^|[^a-z0-9])${escapeRegExp(phrase)}(?:$|[^a-z0-9])`,
    "i",
  ),
}));

const ACCESSORY_HEAD =
  "star|heart|bear|bunny|rabbit|cat|kitten|dog|puppy|pup|flower|floral|bow|ribbon|cloud|moon|fruit|strawberry|cherry|lemon|peach|leaf";

const ACCESSORY_MOTIF_RE = new RegExp(
  String.raw`(?:^|[^a-z0-9])(?:with|&|and|\+|3d|beaded)\s+(?:(?:a|the|3d|beaded|tiny|mini|crystal|cute|kawaii|matching)\s+)*(?:${ACCESSORY_HEAD})\s+(?:charms?(?!\s+grip)|pendants?)(?:$|[^a-z0-9])`,
  "gi",
);

function normalizeHaystack(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[_/\\|+,.:;()[\]{}-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** Remove licensed-character names so they cannot vote as a motif. */
function stripIp(latinHay: string, cjkHay: string): { latin: string; cjk: string } {
  let latin = latinHay;
  latin = latin.replace(ACCESSORY_MOTIF_RE, " ");
  for (const rule of LATIN_IP_STRIP) {
    latin = latin.replace(rule.re, " ");
  }
  for (const rule of LATIN_NOISE_STRIP) {
    latin = latin.replace(rule.re, " ");
  }
  let cjk = cjkHay;
  for (const needle of CJK_IP_STRIP) {
    if (cjk.includes(needle)) cjk = cjk.split(needle).join("");
  }
  return { latin, cjk };
}

export function parseMotifFamily(raw: unknown): MotifFamilySlug | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const slug = trimmed.toLowerCase().replace(/[\s_]+/g, "-");
  if (isMotifFamilySlug(slug)) return slug;
  const hits = classifyMotifsFromText(trimmed);
  return hits[0] ?? null;
}

export function parseMotifFamilies(
  raw: unknown,
  cap: number = MOTIF_FAMILY_SLUGS.length,
): MotifFamilySlug[] {
  const found = new Set<MotifFamilySlug>();
  const push = (value: unknown) => {
    const slug = parseMotifFamily(value);
    if (slug) found.add(slug);
  };
  if (Array.isArray(raw)) {
    for (const item of raw) push(item);
  } else if (typeof raw === "string") {
    for (const part of raw.split(/[/,|]+/)) push(part);
  }
  return MOTIF_FAMILY_SLUGS.filter((slug) => found.has(slug)).slice(0, cap);
}

export function classifyMotifsFromText(
  ...values: (string | null | undefined)[]
): MotifFamilySlug[] {
  const joined = values.filter(Boolean).join(" ");
  if (!joined.trim()) return [];
  const stripped = stripIp(normalizeHaystack(joined), joined);

  const found = new Set<MotifFamilySlug>();
  let latinHay = stripped.latin;
  for (const rule of RULES.latin) {
    if (found.has(rule.slug)) continue;
    if (!rule.re.test(latinHay)) continue;
    found.add(rule.slug);
    latinHay = latinHay.replace(rule.re, " ");
  }
  if (CJK_CHAR.test(stripped.cjk)) {
    let cjkHay = stripped.cjk;
    for (const rule of RULES.cjk) {
      if (found.has(rule.slug)) continue;
      if (!cjkHay.includes(rule.needle)) continue;
      found.add(rule.slug);
      cjkHay = cjkHay.split(rule.needle).join("");
    }
  }
  return MOTIF_FAMILY_SLUGS.filter((slug) => found.has(slug));
}

export type MotifSignals = {
  title?: string | null;
  description?: string | null;
  tags?: readonly string[] | null;
  sourceFolder?: string | null;
};

function cjkRunes(value: string): string {
  return [...value].filter((ch) => CJK_CHAR.test(ch)).join("");
}

/**
 * Claimed motifs — what the listing actually names.
 *
 * Title is the honest English signal. Supplier folders in English dump
 * accessory words (bow, star, girl); only the CJK runes are read, after IP
 * strip, so a folder named 云朵 still votes Clouds and `foo_variants` does not
 * vote Bows. Tags and descriptions never vote — they are an AI dump.
 */
export function classifyProductMotifs(signals: MotifSignals): MotifFamilySlug[] {
  const fromTitle = classifyMotifsFromText(signals.title);
  if (fromTitle.length > 0) return fromTitle;
  const folder = signals.sourceFolder?.trim();
  if (folder && CJK_CHAR.test(folder)) {
    return classifyMotifsFromText(cjkRunes(folder)).slice(0, MAX_PRODUCT_MOTIFS);
  }
  return [];
}

/**
 * Species / silhouette a licensed character would otherwise leak into the
 * Theme facet. Applied only to Observed (copy model) so a title that actually
 * says "Bunny" still classifies, and a vision pass that guesses "Hello Kitty
 * → cat" does not.
 */
const IMPLIED_MOTIFS_BY_NAME: Record<string, readonly MotifFamilySlug[]> = {
  "hello kitty": ["cat"],
  cinnamoroll: ["puppy", "clouds"],
  pompompurin: ["puppy"],
  pochacco: ["puppy"],
  "my melody": ["bunny"],
  keroppi: ["animals"],
  "little twin stars": ["stars"],
  "kiki lala": ["stars"],
  rilakkuma: ["bear"],
  korilakkuma: ["bear"],
  kiiroitori: ["animals"],
  miffy: ["bunny"],
  nijntje: ["bunny"],
  snoopy: ["puppy"],
  woodstock: ["animals"],
  "mickey mouse": ["animals"],
  mickey: ["animals"],
  "minnie mouse": ["animals"],
  minnie: ["animals"],
  "winnie the pooh": ["bear"],
  pooh: ["bear"],
  stitch: ["animals"],
  chiikawa: ["animals"],
  usagi: ["bunny"],
  hachiware: ["cat"],
  monchhichi: ["animals"],
  "care bears": ["bear"],
  "patrick star": ["stars"],
  pikachu: ["animals"],
  snorlax: ["animals"],
  eevee: ["animals"],
};

export function impliedMotifsForIp(
  brandName?: string | null,
  characterName?: string | null,
): MotifFamilySlug[] {
  const found = new Set<MotifFamilySlug>();
  for (const raw of [characterName, brandName]) {
    const key = raw?.trim().toLowerCase();
    if (!key) continue;
    for (const slug of IMPLIED_MOTIFS_BY_NAME[key] ?? []) found.add(slug);
  }
  return MOTIF_FAMILY_SLUGS.filter((slug) => found.has(slug));
}

/**
 * Evidence-ranked theme, not a union.
 *
 * Claimed (title / CJK folder) always wins. Observed (copy model looking at
 * photos) may fill an untitled original, and may add a bow the title forgot,
 * but may not credit the character's own species.
 */
export function reconcileMotifEvidence(input: {
  claimed: readonly MotifFamilySlug[];
  observed?: readonly MotifFamilySlug[];
  brandName?: string | null;
  characterName?: string | null;
}): MotifFamilySlug[] {
  const claimed = new Set(
    MOTIF_FAMILY_SLUGS.filter((slug) => input.claimed.includes(slug)),
  );
  const blocked = new Set(
    impliedMotifsForIp(input.brandName, input.characterName),
  );
  for (const slug of input.observed ?? []) {
    if (!isMotifFamilySlug(slug)) continue;
    if (blocked.has(slug) && !claimed.has(slug)) continue;
    claimed.add(slug);
  }
  return MOTIF_FAMILY_SLUGS.filter((slug) => claimed.has(slug)).slice(
    0,
    MAX_PRODUCT_MOTIFS,
  );
}

/**
 * First group is claimed; the second is observed (copy model). Pass IP names
 * so Observed cannot invent the character's species. A single-group call is
 * claimed-only.
 */
export function mergeMotifClassifications(
  claimed: readonly MotifFamilySlug[] = [],
  observed: readonly MotifFamilySlug[] = [],
  ip?: { brandName?: string | null; characterName?: string | null },
): MotifFamilySlug[] {
  return reconcileMotifEvidence({
    claimed,
    observed,
    brandName: ip?.brandName,
    characterName: ip?.characterName,
  });
}
