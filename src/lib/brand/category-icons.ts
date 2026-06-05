/**
 * Y2KASE custom category icon set.
 *
 * A cohesive, copyright-safe "puffy kawaii sticker" icon system used in the
 * category rail and mega-menu — replacing generic emoji for a designed,
 * brand-consistent look. Each icon is a single inline SVG string filled with
 * the collection's accent colour (so it pops on the pastel tiles), keylined in
 * white, with simple plum facial features.
 *
 * Both the React `<CategoryIcon>` component and the build-time preview script
 * consume `categoryIconSvg()`, keeping one source of truth.
 */

const PLUM = "#3a2342";

/** Two dot eyes + a small smile, centred at (cx) on baseline (y). */
function face(cx: number, y: number, gap = 5, blush = true): string {
  const lx = cx - gap;
  const rx = cx + gap;
  return [
    `<circle cx="${lx}" cy="${y}" r="2" fill="${PLUM}"/>`,
    `<circle cx="${rx}" cy="${y}" r="2" fill="${PLUM}"/>`,
    `<path d="M${cx - 2.6} ${y + 4} q2.6 2.4 5.2 0" stroke="${PLUM}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`,
    blush
      ? `<circle cx="${lx - 2.5}" cy="${y + 2.5}" r="2.1" fill="#ff8fc8" opacity="0.55"/><circle cx="${rx + 2.5}" cy="${y + 2.5}" r="2.1" fill="#ff8fc8" opacity="0.55"/>`
      : "",
  ].join("");
}

const SHAPES: Record<string, (c: string) => string> = {
  heart: (c) =>
    `<path d="M24 41C10 31 5 24.5 5 16.5 5 10.7 9.3 6.5 14.7 6.5c3.9 0 7 2.2 9.3 5.7 2.3-3.5 5.4-5.7 9.3-5.7C38 6.5 43 10.7 43 16.5 43 24.5 38 31 24 41Z" fill="${c}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
     <ellipse cx="16.5" cy="16" rx="3.6" ry="2.6" fill="#fff" opacity="0.5"/>
     ${face(24, 22)}`,

  star: (c) =>
    `<path d="M24 5l5.3 10.7 11.8 1.7-8.6 8.3 2 11.8L24 32.9 13.5 38.3l2-11.8L6.9 17.4l11.8-1.7z" fill="${c}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
     ${face(24, 21, 4.5)}`,

  bow: (c) =>
    `<g stroke="#fff" stroke-width="3" stroke-linejoin="round">
       <path d="M24 24 8 14c-2-1.2-4 0-4 3v14c0 3 2 4.2 4 3l16-10Z" fill="${c}"/>
       <path d="M24 24 40 14c2-1.2 4 0 4 3v14c0 3-2 4.2-4 3L24 24Z" fill="${c}"/>
       <rect x="19.5" y="18" width="9" height="12" rx="3.5" fill="${c}"/>
     </g>
     <circle cx="22" cy="23" r="1.6" fill="${PLUM}"/><circle cx="26" cy="23" r="1.6" fill="${PLUM}"/>`,

  cat: (c) =>
    `<g stroke="#fff" stroke-width="3" stroke-linejoin="round">
       <path d="M10 7l11 9-13 2z" fill="${c}"/>
       <path d="M38 7L27 16l13 2z" fill="${c}"/>
       <ellipse cx="24" cy="27" rx="16" ry="13" fill="${c}"/>
     </g>
     <ellipse cx="32" cy="11" rx="3.5" ry="2.6" fill="#fff" opacity="0.55"/>
     ${face(24, 26, 6)}
     <g stroke="${PLUM}" stroke-width="1.3" stroke-linecap="round">
       <path d="M9 25h6M9 29h6M33 25h6M33 29h6"/>
     </g>`,

  bunny: (c) =>
    `<g stroke="#fff" stroke-width="3" stroke-linejoin="round">
       <ellipse cx="17" cy="13" rx="4.6" ry="11" fill="${c}"/>
       <ellipse cx="31" cy="13" rx="4.6" ry="11" fill="${c}"/>
       <circle cx="24" cy="30" r="13" fill="${c}"/>
     </g>
     <ellipse cx="17" cy="13" rx="1.8" ry="5" fill="#fff" opacity="0.5"/>
     <ellipse cx="31" cy="13" rx="1.8" ry="5" fill="#fff" opacity="0.5"/>
     ${face(24, 29, 5.5)}`,

  cloud: (c) =>
    `<path d="M13 34c-5 0-8-3-8-7.5S8.2 19 12.6 19C14 13.6 18.4 10 24 10s10 3.6 11.4 9c4.4 0 7 3 7 7.5S39.4 34 34.4 34Z" fill="${c}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
     ${face(24, 25, 5.5)}`,

  pudding: (c) =>
    `<ellipse cx="24" cy="18" rx="11" ry="4.5" fill="#b5742b" stroke="#fff" stroke-width="2.5"/>
     <path d="M13 19c0 0 2 18 11 18s11-18 11-18" fill="${c}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
     ${face(24, 27, 5)}`,

  frog: (c) =>
    `<g stroke="#fff" stroke-width="3" stroke-linejoin="round">
       <circle cx="16" cy="15" r="6.5" fill="${c}"/>
       <circle cx="32" cy="15" r="6.5" fill="${c}"/>
       <ellipse cx="24" cy="29" rx="15" ry="12" fill="${c}"/>
     </g>
     <circle cx="16" cy="15" r="2.2" fill="${PLUM}"/>
     <circle cx="32" cy="15" r="2.2" fill="${PLUM}"/>
     <path d="M16 32q8 5 16 0" stroke="${PLUM}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
     <circle cx="14" cy="32" r="2" fill="#ff8fc8" opacity="0.55"/>
     <circle cx="34" cy="32" r="2" fill="#ff8fc8" opacity="0.55"/>`,

  puppy: (c) =>
    `<g stroke="#fff" stroke-width="3" stroke-linejoin="round">
       <ellipse cx="9" cy="23" rx="5" ry="9.5" fill="${c}"/>
       <ellipse cx="39" cy="23" rx="5" ry="9.5" fill="${c}"/>
       <ellipse cx="24" cy="26" rx="14" ry="12.5" fill="${c}"/>
     </g>
     ${face(24, 25, 5.5)}
     <circle cx="24" cy="30" r="1.9" fill="${PLUM}"/>`,

  bear: (c) =>
    `<g stroke="#fff" stroke-width="3" stroke-linejoin="round">
       <circle cx="13" cy="14" r="6.5" fill="${c}"/>
       <circle cx="35" cy="14" r="6.5" fill="${c}"/>
       <circle cx="24" cy="27" r="15" fill="${c}"/>
     </g>
     <ellipse cx="24" cy="31" rx="6.5" ry="5" fill="#fff" opacity="0.55"/>
     ${face(24, 25, 5.5)}`,

  skull: (c) =>
    `<path d="M24 6c-9 0-15 6-15 14.5 0 5 2.2 8.3 5 10.3V37c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-6.2c2.8-2 5-5.3 5-10.3C39 12 33 6 24 6Z" fill="${c}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
     <circle cx="18" cy="21" r="3.4" fill="${PLUM}"/>
     <circle cx="30" cy="21" r="3.4" fill="${PLUM}"/>
     <path d="M21 31h6" stroke="${PLUM}" stroke-width="2" stroke-linecap="round"/>`,

  egg: (c) =>
    `<path d="M24 6c8 0 14 9 14 18 0 9-6 14-14 14s-14-5-14-14C10 15 16 6 24 6Z" fill="${c}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
     <path d="M11 23l4-3 4 3 5-3 4 3 5-3 4 3" stroke="#fff" stroke-width="2.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
     ${face(24, 29, 4.5)}`,

  blossom: (c) =>
    `<g fill="${c}" stroke="#fff" stroke-width="2.4" stroke-linejoin="round">
       <ellipse cx="24" cy="13" rx="5" ry="8" transform="rotate(0 24 24)"/>
       <ellipse cx="24" cy="13" rx="5" ry="8" transform="rotate(72 24 24)"/>
       <ellipse cx="24" cy="13" rx="5" ry="8" transform="rotate(144 24 24)"/>
       <ellipse cx="24" cy="13" rx="5" ry="8" transform="rotate(216 24 24)"/>
       <ellipse cx="24" cy="13" rx="5" ry="8" transform="rotate(288 24 24)"/>
     </g>
     <circle cx="24" cy="24" r="4" fill="#fff"/>
     <circle cx="24" cy="24" r="2" fill="${c}"/>`,

  tv: (c) =>
    `<g stroke="${c}" stroke-width="3" stroke-linecap="round"><path d="M18 16 13 8M30 16 35 8"/></g>
     <circle cx="13" cy="8" r="2.4" fill="${c}"/><circle cx="35" cy="8" r="2.4" fill="${c}"/>
     <rect x="6" y="15" width="36" height="25" rx="6" fill="${c}" stroke="#fff" stroke-width="3"/>
     <path d="M12 20l5 15" stroke="#fff" stroke-width="3" opacity="0.4" stroke-linecap="round"/>
     ${face(26, 26, 5)}`,

  cd: (c) =>
    `<circle cx="24" cy="24" r="18" fill="${c}" stroke="#fff" stroke-width="3"/>
     <path d="M24 8a16 16 0 0 1 13.8 8" stroke="#fff" stroke-width="3.4" opacity="0.55" fill="none" stroke-linecap="round"/>
     <circle cx="24" cy="24" r="5.5" fill="#fff" stroke="${c}" stroke-width="2"/>
     <circle cx="24" cy="24" r="1.6" fill="${c}"/>`,

  sparkle: (c) =>
    `<path d="M24 4c1.6 9.4 4.2 12.4 16 14-11.8 2-14.4 5-16 14-1.6-9-4.2-12-16-14C19.8 16.4 22.4 13.4 24 4Z" fill="${c}" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>
     <path d="M38 28c.8 4.6 2 5.8 6 6.6-4 .8-5.2 2-6 6.4-.8-4.4-2-5.6-6-6.4 4-.8 5.2-2 6-6.6Z" fill="${c}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`,
};

/** Map a collection slug to one of the kawaii shapes above. */
const SLUG_TO_SHAPE: Record<string, keyof typeof SHAPES> = {
  sanrio: "bow",
  "hello-kitty": "cat",
  kuromi: "skull",
  "my-melody": "bunny",
  cinnamoroll: "cloud",
  pompompurin: "pudding",
  keroppi: "frog",
  pochacco: "puppy",
  "little-twin-stars": "star",
  miffy: "bunny",
  tamagotchi: "egg",
  anime: "blossom",
  cartoon: "tv",
  kawaii: "heart",
  y2k: "cd",
  characters: "bear",
};

/** Heuristic fallback by collection kind when the slug is unknown. */
function fallbackShape(kind?: string): keyof typeof SHAPES {
  if (kind === "brand") return "bow";
  if (kind === "genre") return "heart";
  return "sparkle";
}

export function categoryIconSvg(
  slug: string,
  color = "#ff3ea5",
  opts: { kind?: string; size?: number | string } = {},
): string {
  const shapeKey = SLUG_TO_SHAPE[slug] ?? fallbackShape(opts.kind);
  const inner = SHAPES[shapeKey](color);
  const dim =
    typeof opts.size === "number" ? `${opts.size}` : (opts.size ?? "100%");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${dim}" height="${dim}" role="img" aria-hidden="true" focusable="false">${inner}</svg>`;
}

export const CATEGORY_ICON_SLUGS = Object.keys(SLUG_TO_SHAPE);
