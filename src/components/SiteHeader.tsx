import { getCollectionTree, type CollectionNode } from "@/lib/collections";
import { Navbar, type MenuCollection } from "@/components/Navbar";
import { AnnouncementBar } from "@/components/AnnouncementBar";

/** Trim the rich tree down to the serializable shape the menu needs. */
function toMenu(node: CollectionNode): MenuCollection {
  return {
    slug: node.slug,
    name: node.name,
    kind: node.kind,
    icon: node.icon,
    accentColor: node.accentColor,
    count: node.totalCount,
    children: node.children.map(toMenu),
  };
}

/**
 * Server header: loads the live collection taxonomy (so the mega-menu reflects
 * what's actually stocked) and hands it to the client {@link Navbar}. Device
 * families are static config, resolved inside the client component.
 */
export async function SiteHeader() {
  let collections: MenuCollection[] = [];
  try {
    const tree = await getCollectionTree();
    collections = tree.filter((n) => n.totalCount > 0 || n.featured).map(toMenu);
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
