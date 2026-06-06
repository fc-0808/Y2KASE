/**
 * Branded Open Graph image renderer (next/og).
 *
 * Generates the 1200×630 social cards shown when a Y2KASE link is shared on
 * iMessage, Instagram, Pinterest, Facebook, X, Slack, etc. A consistent,
 * on-brand card materially lifts click-through on shares vs. a bare product
 * photo or a generic logo — this is standard practice at CASETiFY-tier brands.
 *
 * Implementation notes:
 *  - Pure Satori-compatible markup (flex layout, inline styles only).
 *  - No fetched web fonts: we rely on the bundled default font and express
 *    hierarchy through size/color/spacing, which keeps generation fast and
 *    impossible to break on a flaky font CDN.
 */
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const BG =
  "linear-gradient(120deg,#ffc2ea 0%,#e6c5ff 34%,#c4e2ff 67%,#c4ffe8 100%)";
const INK = "#34203b";
const ACCENT = "#ff3ea5";

export type OgImageOptions = {
  /** Small uppercase kicker, e.g. "iPhone Cases" or "Collection". */
  eyebrow?: string;
  /** Headline. */
  title: string;
  /** Optional pill, e.g. a price or rating. */
  badge?: string;
  /** Product/collection image (rendered in a rounded panel on the right). */
  imageUrl?: string | null;
  /** Emoji fallback when there's no image (collections/devices). */
  emoji?: string;
};

export function renderOgImage(opts: OgImageOptions): ImageResponse {
  const { eyebrow, title, badge, imageUrl, emoji } = opts;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundImage: BG,
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(255,255,255,0.72)",
            borderRadius: 40,
            border: "2px solid #ffffff",
            padding: 56,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Text column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              maxWidth: imageUrl ? 600 : 1000,
              flex: 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <span
                style={{
                  fontSize: 34,
                  fontWeight: 800,
                  color: ACCENT,
                  letterSpacing: 2,
                }}
              >
                Y2KASE
              </span>
              <span
                style={{
                  marginLeft: 14,
                  fontSize: 18,
                  color: INK,
                  opacity: 0.55,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                }}
              >
                kawaii · y2k
              </span>
            </div>

            {eyebrow && (
              <div
                style={{
                  marginTop: 28,
                  fontSize: 22,
                  color: ACCENT,
                  letterSpacing: 4,
                  textTransform: "uppercase",
                }}
              >
                {eyebrow}
              </div>
            )}

            <div
              style={{
                marginTop: 14,
                fontSize: 64,
                lineHeight: 1.1,
                color: INK,
                fontWeight: 800,
                display: "flex",
              }}
            >
              {truncate(title, 90)}
            </div>

            {badge && (
              <div style={{ display: "flex", marginTop: 32 }}>
                <span
                  style={{
                    display: "flex",
                    backgroundColor: ACCENT,
                    color: "#ffffff",
                    fontSize: 30,
                    fontWeight: 800,
                    padding: "12px 28px",
                    borderRadius: 9999,
                  }}
                >
                  {badge}
                </span>
              </div>
            )}
          </div>

          {/* Visual panel */}
          {imageUrl ? (
            <div
              style={{
                display: "flex",
                width: 380,
                height: 380,
                marginLeft: 48,
                borderRadius: 32,
                overflow: "hidden",
                border: "6px solid #ffffff",
                boxShadow: "0 20px 60px rgba(120,60,120,0.35)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                width={380}
                height={380}
                style={{ objectFit: "cover" }}
              />
            </div>
          ) : emoji ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 320,
                height: 320,
                marginLeft: 48,
                borderRadius: 32,
                backgroundColor: "rgba(255,255,255,0.7)",
                border: "6px solid #ffffff",
                fontSize: 180,
              }}
            >
              {emoji}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
