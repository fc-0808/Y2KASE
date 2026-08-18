import { SUPPORT_EMAIL } from "@/lib/legal";
import { JsonLd } from "@/components/JsonLd";
import {
  absoluteUrl,
  publicPageMetadata,
  webPageJsonLd,
} from "@/lib/seo";
import { SHIPPING_COUNTRIES } from "@/lib/shipping";

const DESCRIPTION =
  "Y2KASE is a kawaii & Y2K phone accessories brand — character cases, grips and charms for besties everywhere.";

export const metadata = publicPageMetadata({
  title: "About",
  description: DESCRIPTION,
  path: "/about",
});

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <JsonLd
        data={webPageJsonLd({
          type: "AboutPage",
          name: "About Y2KASE",
          description: DESCRIPTION,
          url: "/about",
          mainEntity: absoluteUrl("/#organization"),
        })}
      />
      <header className="mb-8">
        <div className="h-1 w-16 rounded-full bg-holo-vivid" />
        <h1 className="mt-4 font-display text-3xl font-black sm:text-4xl">
          About Y2KASE ✨
        </h1>
        <p className="mt-2 text-[var(--foreground)]/65">
          Kawaii, Y2K &amp; holographic phone accessories — designed with love.
        </p>
      </header>

      <article className="legal-prose">
        <p>
          Y2KASE is a kawaii phone accessories brand born from a love of cute
          aesthetics, anime culture, and the Y2K era. We design and curate phone
          cases, grips, and charms inspired by iconic characters and trending
          aesthetics.
        </p>
        <h2>Our Story</h2>
        <p>
          What started as a passion project grew into a full brand dedicated to
          bringing high-quality, character-inspired phone accessories to fans
          across our supported markets. Every case is designed with care — from
          the MagSafe grip mechanics to the hand-applied charms.
        </p>
        <h2>Our Products</h2>
        <p>
          We specialise in iPhone cases featuring beloved characters and
          aesthetics — from Sanrio and Miffy to Tamagotchi and anime. Our cases
          come in a range of styles including MagSafe-compatible designs, liquid
          glitter, leather, wallet, and holographic finishes.
        </p>
        <h2>Our Commitment</h2>
        <ul>
          <li>Quality materials and construction on every product</li>
          <li>
            Tracked shipping across {SHIPPING_COUNTRIES.length} supported
            markets
          </li>
          <li>30-day hassle-free returns</li>
          <li>Genuine character licensing</li>
        </ul>
        <h2>Find Us</h2>
        <p>
          Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          <br />
          Instagram: @y2kase.co
        </p>
      </article>
    </div>
  );
}
