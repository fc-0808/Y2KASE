import {
  FASHION_PILLARS,
  INSTAGRAM_BOOTSTRAP_GRID,
  type FashionPillar,
} from "@/lib/social/instagram-fashion";

/**
 * The next 3×4 Instagram mix. Same left-to-right, top-to-bottom order as
 * the profile grid. Today's tile is the first one.
 */
export function InstagramFashionMix({
  mix,
  caption,
}: {
  mix: readonly FashionPillar[];
  caption?: string;
}) {
  const tiles = mix.length > 0 ? mix : INSTAGRAM_BOOTSTRAP_GRID;
  return (
    <div>
      {caption ? (
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
          {caption}
        </p>
      ) : null}
      <ol className="grid grid-cols-3 gap-1.5">
        {tiles.slice(0, 12).map((pillar, i) => {
          const meta = FASHION_PILLARS[pillar];
          return (
            <li
              key={`${pillar}-${i}`}
              title={`${i === 0 ? "Today · " : ""}${meta.kicker}: ${meta.label}`}
              className="flex aspect-square items-center justify-center rounded-lg text-[9px] font-black uppercase tracking-wide text-white"
              style={{
                background: meta.swatch,
                boxShadow: i === 0 ? `0 0 0 2px ${meta.swatch}, 0 0 0 4px white` : undefined,
                opacity: i === 0 ? 1 : 0.78,
              }}
            >
              {meta.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
