/**
 * Topic lockup for a campaign hero.
 *
 * Rasterized with next/og because Sharp's SVG text has no usable font on
 * Vercel (the same failure that turned Pinterest pin captions into boxes).
 * The product photos are composited separately and are never sent here.
 */
import { createElement } from "react";
import { ImageResponse } from "next/og";
import {
  MARKETING_HERO_CAPTION_BAND,
  type MarketingHeroCaption,
} from "./hero";

function headlineSize(headline: string): number {
  if (headline.length <= 36) return 42;
  if (headline.length <= 58) return 36;
  if (headline.length <= 78) return 30;
  return 26;
}

export async function renderMarketingHeroCaption(
  caption: MarketingHeroCaption,
): Promise<Buffer> {
  const lines = [
    caption.kicker
      ? createElement(
          "div",
          {
            style: {
              display: "flex",
              fontSize: 20,
              fontWeight: 700,
              color: "#ff3ea5",
              letterSpacing: 3.2,
              lineHeight: 1,
            },
          },
          caption.kicker,
        )
      : null,
    caption.headline
      ? createElement(
          "div",
          {
            style: {
              display: "flex",
              marginTop: caption.kicker ? 10 : 0,
              fontSize: headlineSize(caption.headline),
              fontWeight: 700,
              color: "#34203b",
              lineHeight: 1.15,
            },
          },
          caption.headline,
        )
      : null,
  ].filter((line) => line !== null);

  const image = new ImageResponse(
    createElement(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#fffdfb",
          borderTop: "4px solid #ff3ea5",
          paddingLeft: 56,
          paddingRight: 56,
        },
      },
      ...lines,
    ),
    {
      width: MARKETING_HERO_CAPTION_BAND.width,
      height: MARKETING_HERO_CAPTION_BAND.height,
    },
  );
  return Buffer.from(await image.arrayBuffer());
}
