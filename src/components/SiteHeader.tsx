import {
  getCollectionTree,
  type CollectionNode,
} from "@/lib/collections";
import { getDeviceFacetCounts } from "@/lib/products";
import { Navbar, type MenuCollection } from "@/components/Navbar";
import { AnnouncementBar } from "@/components/AnnouncementBar";

/**
 * Server header: loads the live collection taxonomy and device stock counts
 * (so the mega-menu reflects what is actually for sale) and hands both to
 * the client {@link Navbar}. "Soon" vs a live `/devices/{id}` href is a
 * stock snapshot, not a static flag.
 */
export async function SiteHeader() {
  const toMenu = (node: CollectionNode): MenuCollection => ({
    slug: node.slug,
    name: node.name,
    kind: node.kind,
    icon: node.icon,
    accentColor: node.accentColor,
    count: node.totalCount,
    children: node.children.map(toMenu),
  });

  // These used to run one after the other, so every navigation paid both
  // round trips before the next page could paint. They don't depend on each
  // other.
  const [collections, deviceCounts] = await Promise.all([
    getCollectionTree()
      .then((tree) =>
        tree.filter((n) => n.totalCount > 0 || n.featured).map(toMenu),
      )
      .catch(() => [] as MenuCollection[]),
    getDeviceFacetCounts().catch(() => undefined),
  ]);
  return (
    <div className="sticky top-0 z-40">
      <AnnouncementBar />
      <Navbar collections={collections} deviceCounts={deviceCounts} />
    </div>
  );
}
