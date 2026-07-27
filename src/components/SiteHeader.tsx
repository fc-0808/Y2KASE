import {
  getCollectionTree,
  type CollectionNode,
} from "@/lib/collections";
import { Navbar, type MenuCollection } from "@/components/Navbar";
import { AnnouncementBar } from "@/components/AnnouncementBar";

/**
 * Server header: loads the live collection taxonomy (so the mega-menu reflects
 * what's actually stocked) and hands it to the client {@link Navbar}. The
 * dropdowns are purely typographic, so no product imagery is fetched here.
 * Device families are static config, resolved inside the client component.
 */
export async function SiteHeader() {
  let collections: MenuCollection[] = [];
  try {
    const tree = await getCollectionTree();

    const toMenu = (node: CollectionNode): MenuCollection => ({
      slug: node.slug,
      name: node.name,
      kind: node.kind,
      icon: node.icon,
      accentColor: node.accentColor,
      count: node.totalCount,
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
