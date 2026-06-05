/**
 * FeaturedEditorial — magazine-style "Featured Collection" block.
 *
 * An asymmetric bento layout (one tall hero card + two stacked cards) echoing
 * CASETiFY's editorial section, skinned with Y2KASE art and copy. Pure server
 * component — no client JS. Swap the EDITORIAL config to re-merchandise.
 */
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Entry = {
  kicker: string;
  title: string;
  desc: string;
  image: string;
  href: string;
};

const EDITORIAL: Entry[] = [
  {
    kicker: "01",
    title: "Holographic Series",
    desc: "Iridescent finishes that shift with the light.",
    image: "/brand/hero-2.webp",
    href: "/collections/y2k",
  },
  {
    kicker: "02",
    title: "The Sanrio Edit",
    desc: "Hello Kitty, Kuromi, My Melody & friends.",
    image: "/brand/hero-3.webp",
    href: "/collections/sanrio",
  },
  {
    kicker: "03",
    title: "Join the Club",
    desc: "Member-only drops, perks & birthday gifts.",
    image: "/brand/club.png",
    href: "/products",
  },
];

export function FeaturedEditorial() {
  const [hero, ...rest] = EDITORIAL;
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:grid-rows-2">
      {/* Tall hero card */}
      <EditorialCard
        entry={hero}
        priority
        className="min-h-[22rem] lg:row-span-2 lg:min-h-full"
      />
      {rest.map((entry) => (
        <EditorialCard
          key={entry.kicker}
          entry={entry}
          className="min-h-[16rem]"
        />
      ))}
    </div>
  );
}

function EditorialCard({
  entry,
  className = "",
  priority = false,
}: {
  entry: Entry;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Link
      href={entry.href}
      className={`group relative overflow-hidden rounded-[2rem] border-2 border-white shadow-[0_18px_50px_-28px_rgba(120,60,120,0.6)] ${className}`}
    >
      <Image
        src={entry.image}
        alt={entry.title}
        fill
        sizes="(max-width: 1024px) 100vw, 50vw"
        className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
      />
      {/* Editorial gradient for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

      {/* Number badge */}
      <span className="absolute left-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-white/90 font-pixel text-[10px] text-[var(--primary)] shadow">
        {entry.kicker}
      </span>

      {/* Copy */}
      <div className="absolute inset-x-0 bottom-0 p-6">
        <h3 className="font-display text-2xl font-extrabold text-white drop-shadow sm:text-3xl">
          {entry.title}
        </h3>
        <p className="mt-1 max-w-xs text-sm text-white/85 drop-shadow">
          {entry.desc}
        </p>
        <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[var(--foreground)] shadow-md transition group-hover:gap-3 group-hover:text-[var(--primary)]">
          Shop now <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
