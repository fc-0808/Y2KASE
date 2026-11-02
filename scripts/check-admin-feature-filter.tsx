/**
 * Admin product feature filter — Magnetic Ring Holder is selectable beside brand.
 *
 *   tsx scripts/check-admin-feature-filter.tsx
 */
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionNavBar } from "../src/app/admin/(protected)/products/ProductsCollectionNav";
import type { AdminCollectionOption } from "../src/lib/collections";

function option(
  partial: Pick<AdminCollectionOption, "id" | "slug" | "name" | "kind"> &
    Partial<AdminCollectionOption>,
): AdminCollectionOption {
  return {
    pathLabel: partial.name,
    parentId: null,
    icon: null,
    depth: 0,
    count: 0,
    ...partial,
  };
}

const options: AdminCollectionOption[] = [
  option({ id: 1, slug: "sanrio", name: "Sanrio", kind: "brand", count: 97 }),
  option({
    id: 2,
    slug: "hello-kitty",
    name: "Hello Kitty",
    kind: "character",
    parentId: 1,
    depth: 1,
    pathLabel: "Sanrio › Hello Kitty",
    count: 40,
  }),
  option({ id: 3, slug: "magsafe", name: "MagSafe", kind: "feature", count: 108 }),
  option({
    id: 4,
    slug: "magnetic-ring",
    name: "Magnetic Ring Holder",
    kind: "feature",
    count: 14,
  }),
  option({ id: 5, slug: "kawaii", name: "Kawaii", kind: "genre", count: 200 }),
];

const brandCounts = new Map<number, number>([
  [1, 12],
  [2, 4],
]);
const featureCounts = new Map<number, number>([
  [3, 108],
  [4, 14],
]);

function render(featureActive: number | "all" = "all") {
  return renderToStaticMarkup(
    <CollectionNavBar
      options={options}
      counts={brandCounts}
      total={378}
      active="all"
      onSelect={() => {}}
      featureCounts={featureCounts}
      featureTotal={378}
      featureActive={featureActive}
      onSelectFeature={() => {}}
    />,
  );
}

function buttons(html: string): string[] {
  return html.match(/<button[\s\S]*?<\/button>/g) ?? [];
}

function buttonNamed(html: string, label: string): string {
  const found = buttons(html).filter((button) => button.includes(`>${label}<`));
  assert.equal(found.length, 1, label);
  return found[0];
}

const all = render();
assert.match(all, /Filter products by feature/);
assert.match(buttonNamed(all, "Magnetic Ring Holder"), />14</);
assert.match(buttonNamed(all, "MagSafe"), />108</);
assert.match(buttonNamed(all, "Sanrio"), />12</);
assert.doesNotMatch(all, /Kawaii/);
const allButtons = buttons(all).filter((button) => button.includes(">All<"));
assert.equal(allButtons.length, 2);
assert.ok(allButtons.every((button) => button.includes('aria-pressed="true"')));

const ring = render(4);
assert.match(buttonNamed(ring, "Magnetic Ring Holder"), /aria-pressed="true"/);
assert.match(buttonNamed(ring, "Magnetic Ring Holder"), /raised ring holder on the back/);
assert.doesNotMatch(buttonNamed(ring, "MagSafe"), /aria-pressed="true"/);

const hidden = renderToStaticMarkup(
  <CollectionNavBar
    options={options}
    counts={brandCounts}
    total={158}
    active="all"
    onSelect={() => {}}
    featureCounts={new Map([[3, 0], [4, 0]])}
    featureTotal={158}
    featureActive="all"
    onSelectFeature={() => {}}
  />,
);
assert.doesNotMatch(hidden, /Magnetic Ring Holder/);
assert.doesNotMatch(hidden, /Filter products by feature/);

const kept = renderToStaticMarkup(
  <CollectionNavBar
    options={options}
    counts={brandCounts}
    total={0}
    active="all"
    onSelect={() => {}}
    featureCounts={new Map([[3, 0], [4, 0]])}
    featureTotal={0}
    featureActive={4}
    onSelectFeature={() => {}}
  />,
);
assert.match(buttonNamed(kept, "Magnetic Ring Holder"), /aria-pressed="true"/);
assert.equal(
  buttons(kept).filter((button) => button.includes(">MagSafe<")).length,
  0,
);

console.log("admin feature filter ok");
