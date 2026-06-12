import {
  getCollectionTree,
  getCollectionImagePools,
  type CollectionNode,
} from "@/lib/collections";
import { Navbar, type MenuCollection } from "@/components/Navbar";
import { AnnouncementBar } from "@/components/AnnouncementBar";

/**
 * Server header: loads the live collection taxonomy (so the mega-menu reflects
 * what's actually stocked) plus a representative product photo per collection,
 * and hands it to the client {@link Navbar}. Device families are static config,
 * resolved inside the client component.
 */
export async function SiteHeader() {
  let collections: MenuCollection[] = [];
  try {
    const [tree, pools] = await Promise.all([
      getCollectionTree(),
      getCollectionImagePools(),
    ]);

    // Assign a DISTINCT product photo to each menu entry so the dropdown reads
    // like a premium look-book rather than a row of repeated thumbnails.
    const used = new Set<string>();
    const pickThumb = (node: CollectionNode): string | null => {
      const pool = pools.get(node.id) ?? [];
      const url = pool.find((u) => !used.has(u)) ?? pool[0] ?? null;
      if (url) used.add(url);
      return url;
    };
    const toMenu = (node: CollectionNode): MenuCollection => ({
      slug: node.slug,
      name: node.name,
      kind: node.kind,
      icon: node.icon,
      accentColor: node.accentColor,
      count: node.totalCount,
      thumb: pickThumb(node),
      children: node.children.map(toMenu),
    });

    collections = tree
      .filter((n) => n.totalCount > 0 || n.featured)
      .map(toMenu);
  } catch {
    // Storefront should still render if the DB/collections aren't ready yet.
    collections = [];
  }
  return (
    <div className="sticky top-0 z-40">
      <AnnouncementBar />
      <Navbar collections={collections} />
    </div>
  );
}
