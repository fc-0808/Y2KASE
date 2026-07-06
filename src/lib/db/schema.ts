import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// BETTER AUTH TABLES
// These four tables are required by Better Auth's Drizzle adapter.
// Column names follow Better Auth's naming convention exactly (camelCase → DB).
// ─────────────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull(),
    image: text("image"),
    /**
     * RBAC role stored directly on the user row for simplicity.
     * "admin" | "customer" | "anonymous"
     */
    role: text("role").notNull().default("customer"),
    /** Required by Better Auth's anonymous plugin. */
    isAnonymous: boolean("is_anonymous").default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("user_email_idx").on(t.email)],
);

export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("session_token_idx").on(t.token),
    index("session_user_idx").on(t.userId),
  ],
);

export const accounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────────────────────────────────────

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    /** Null for guest orders until the customer claims their account. */
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    /** pending | paid | shipped | delivered | cancelled | refunded */
    status: text("status").notNull().default("pending"),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    shippingAddress: jsonb("shipping_address").$type<{
      name: string;
      line1: string;
      line2?: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    }>(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeSessionId: text("stripe_session_id"),
    /** Set when the order-confirmation email is sent — guarantees exactly-once. */
    confirmationEmailSentAt: timestamp("confirmation_email_sent_at", {
      withTimezone: true,
    }),
    /** Carrier tracking number, set when the order ships. */
    trackingNumber: text("tracking_number"),
    /** Carrier name, e.g. "USPS", "DHL". */
    carrier: text("carrier"),
    /** Optional full tracking URL (overrides the carrier-derived link). */
    trackingUrl: text("tracking_url"),
    /** When the order was marked shipped. */
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    /** Set when the shipment-notification email is sent — exactly-once guard. */
    shipmentEmailSentAt: timestamp("shipment_email_sent_at", {
      withTimezone: true,
    }),
    /** Set when an abandoned-cart reminder is sent — prevents duplicate nudges. */
    abandonedEmailSentAt: timestamp("abandoned_email_sent_at", {
      withTimezone: true,
    }),
    /** Set when the post-purchase review-request email is sent — exactly-once. */
    reviewRequestEmailSentAt: timestamp("review_request_email_sent_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("orders_user_idx").on(t.userId),
    index("orders_email_idx").on(t.email),
    index("orders_status_idx").on(t.status),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    productSlug: text("product_slug").notNull(),
    productTitle: text("product_title").notNull(),
    imageUrl: text("image_url"),
    optionValues: jsonb("option_values").$type<Record<string, string>>(),
    quantity: integer("quantity").notNull(),
    unitCents: integer("unit_cents").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/**
 * products — the canonical catalog record.
 * Mirrors the `golden_records` table from the legacy SQLite MDM, but normalized.
 */
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    /** Display price in the store's base currency (see `currency`). */
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    compareAtPrice: numeric("compare_at_price", { precision: 10, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    materials: text("materials"),
    /** Flat list of marketing/search tags. */
    tags: text("tags").array().notNull().default([]),
    /** active | draft | archived */
    status: text("status").notNull().default("active"),
    featured: boolean("featured").notNull().default(false),
    /**
     * Curated order within the homepage "Bestsellers" rail (ascending). Only
     * meaningful when `featured` is true; null = unordered/legacy. Lets the
     * operator hand-merchandise the rail so it stays stable across uploads.
     */
    featuredPosition: integer("featured_position"),
    totalQuantity: integer("total_quantity").notNull().default(0),
    /** Where the record originated (e.g. "Y2KASEshop"). Provenance for MDM. */
    sourceShops: text("source_shops"),
    /** Legacy Shopify GID, kept so we can reconcile during cutover. */
    legacyShopifyId: text("legacy_shopify_id"),
    /** GPT model used to generate copy, for auditing AI-authored content. */
    aiModel: text("ai_model"),
    /**
     * Product line for options/pricing. e.g. iphone_case | samsung_case |
     * airpod_case | kindle_case | watch_band
     */
    productType: text("product_type").notNull().default("iphone_case"),
    /** Primary product video URL (R2). Shown on the PDP when set. */
    videoUrl: text("video_url"),
    /**
     * Zero-based slot the video occupies within the ordered image gallery.
     * e.g. 0 = before the first image, 1 = after the first image (default).
     * Null is treated as 1 at render time for backward compatibility.
     */
    videoPosition: integer("video_position"),
    /** Relative folder path under LOCAL_CATALOG_ROOT used at ingest time. */
    sourceFolder: text("source_folder"),
    /**
     * Set when MagSafe was detected with only a weak/low-confidence signal —
     * the product is queued for human confirmation rather than auto-labelled.
     * See `src/lib/catalog/magsafe.ts` and `/admin/products/magsafe-review`.
     */
    needsMagsafeReview: boolean("needs_magsafe_review").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("products_slug_idx").on(t.slug),
    index("products_status_idx").on(t.status),
    index("products_featured_idx").on(t.featured),
  ],
);

/**
 * product_images — ordered gallery per product. URLs point at Cloudinary
 * (or the legacy Etsy CDN during migration).
 */
export const productImages = pgTable(
  "product_images",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    cloudinaryPublicId: text("cloudinary_public_id"),
    position: integer("position").notNull().default(0),
    altText: text("alt_text"),
    /** True once GPT vision has analyzed this image to author copy. */
    aiAnalyzed: boolean("ai_analyzed").notNull().default(false),
    /**
     * Which Style option values this image applies to (e.g. "Case + Grip").
     * Empty array = shown for every style (universal angle shot).
     */
    styleTags: text("style_tags").array().notNull().default([]),
    /** Original source filename (without extension) for traceability. */
    sourceFilename: text("source_filename"),
    /**
     * Perceptual hash (dHash, 16-char hex) of the image — a resize/recompress-
     * robust fingerprint used to detect near-duplicate products. See
     * `src/lib/catalog/phash.ts`. Null until computed (ingest or backfill).
     */
    phash: text("phash"),
  },
  (t) => [
    index("product_images_product_idx").on(t.productId),
    index("product_images_phash_idx").on(t.phash),
  ],
);

/**
 * product_options — variant axes (e.g. "Phone Model", "Style").
 * Values are stored as an ordered JSON array for simplicity.
 */
export const productOptions = pgTable(
  "product_options",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    values: jsonb("values").$type<string[]>().notNull().default([]),
  },
  (t) => [index("product_options_product_idx").on(t.productId)],
);

/**
 * product_variants — concrete purchasable combination with its own SKU,
 * price and inventory. Optional today; populate when we move off a single
 * blended price per product.
 */
export const productVariants = pgTable(
  "product_variants",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sku: text("sku"),
    /** e.g. { "Phone Model": "iPhone 16 Pro Max", "Style": "Case + Charm" } */
    optionValues: jsonb("option_values").$type<Record<string, string>>(),
    price: numeric("price", { precision: 10, scale: 2 }),
    inventory: integer("inventory").notNull().default(0),
  },
  (t) => [index("product_variants_product_idx").on(t.productId)],
);

/**
 * collections — the hierarchical, content-managed browse taxonomy.
 *
 * This is the storefront's *marketing* classification (as opposed to
 * {@link products.productType}, which is the functional discriminator, and the
 * device taxonomy in `src/lib/catalog/devices.ts`, which is derived from the
 * product type). A collection groups products under a buyer-facing theme:
 * a character (Hello Kitty), a brand/IP (Sanrio, Miffy, Tamagotchi) or a genre
 * (Anime, Cartoon).
 *
 * Collections form a tree via `parentId`, so a top-level group like "Sanrio"
 * can contain "Hello Kitty", "Kuromi", "My Melody", … and a product assigned to
 * a leaf is also browsable from its ancestors. The shape mirrors how Shopify
 * collections / CASETiFY co-lab groupings work.
 */
export const collections = pgTable(
  "collections",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Which browse dimension this node belongs to — drives where it appears in
     * the mega-menu. "character" = a specific mascot, "brand" = an IP/house of
     * characters (Sanrio), "genre" = a broad theme (Anime, Cartoon),
     * "feature" = a merchandising shelf (New, Best Sellers).
     */
    kind: text("kind").notNull().default("character"),
    /** Self-referential parent for hierarchy. Null = top-level node. */
    parentId: integer("parent_id"),
    /** Manual sort order within a parent (ascending). */
    position: integer("position").notNull().default(0),
    /** Surface in the primary mega-menu / featured rails. */
    featured: boolean("featured").notNull().default(false),
    /** active | draft — drafts are hidden from the storefront. */
    status: text("status").notNull().default("active"),
    /** Tile/thumbnail art for menu + landing cards (R2 or remote CDN). */
    imageUrl: text("image_url"),
    /** Optional emoji used as a lightweight icon when no image is set. */
    icon: text("icon"),
    /** Marketing color (hex) used for landing-page accents. */
    accentColor: text("accent_color"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("collections_slug_idx").on(t.slug),
    index("collections_parent_idx").on(t.parentId),
    index("collections_kind_idx").on(t.kind),
    index("collections_status_idx").on(t.status),
  ],
);

/**
 * product_collections — many-to-many membership join.
 * A product can live in any number of collections; `position` allows curating
 * the order products appear within a single collection.
 */
export const productCollections = pgTable(
  "product_collections",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    /** Curated order of this product within the collection (ascending). */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("product_collections_pk").on(t.productId, t.collectionId),
    index("product_collections_collection_idx").on(t.collectionId),
  ],
);

/**
 * reviews — customer product reviews + star ratings.
 *
 * Powers social proof on the PDP and, crucially, the aggregateRating in the
 * Product structured data (the star ratings Google shows in search results).
 * Verified-purchase reviews auto-publish; everything else is held for admin
 * moderation so the storefront can't be spammed.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Linked order when we can match the reviewer to a purchase. */
    orderId: integer("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    /** Optional signed-in author. */
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Public display name. */
    authorName: text("author_name").notNull(),
    /** Private — used for verified-purchase matching, never displayed. */
    authorEmail: text("author_email"),
    /** Integer 1–5. */
    rating: integer("rating").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    /** pending | published | rejected */
    status: text("status").notNull().default("pending"),
    /** True when the reviewer has a matching paid order for this product. */
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("reviews_product_idx").on(t.productId),
    index("reviews_status_idx").on(t.status),
  ],
);

/**
 * social_creatives — AI-generated marketing assets for the Social Studio.
 *
 * Each row is one generated image (gpt-image-1) + its platform-tailored caption
 * and hashtags. Creatives move through a moderation lifecycle
 * (draft → approved → published / rejected) so a human reviews every asset
 * before it goes out — the brand-safe pattern top DTC teams use.
 *
 * The product is referenced loosely (set null) and we snapshot the product
 * title so a creative remains meaningful even if the source product is later
 * archived or deleted.
 */
export const socialCreatives = pgTable(
  "social_creatives",
  {
    id: serial("id").primaryKey(),
    /** Source product (nullable — creative survives product deletion). */
    productId: integer("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    /** Snapshot of the product title at generation time. */
    productTitle: text("product_title"),
    /** Snapshot of the product slug — lets published pins deep-link to the PDP. */
    productSlug: text("product_slug"),
    /**
     * Source catalog image this creative was built from (real product photos
     * only). This is the dedup key for the autonomous Pinterest auto-pin drip:
     * an image with a published/in-flight pinterest creative is never re-pinned.
     * Null for AI-generated creatives (they have no catalog source image).
     */
    sourceImageId: integer("source_image_id").references(
      () => productImages.id,
      { onDelete: "set null" },
    ),
    /** Preset key used to build the image prompt (see lib/social/presets). */
    preset: text("preset").notNull(),
    /** Target platform: pinterest | tiktok | instagram | generic. */
    platform: text("platform").notNull().default("generic"),
    /**
     * What kind of asset this creative is: "image" (a photo pin) or "video"
     * (a video pin). Video creatives set {@link videoUrl} to the source clip and
     * reuse {@link imageUrl} as the cover thumbnail. Drives the publish path and
     * the per-listing dedup for the auto-pin drip (one video pin per product).
     */
    mediaType: text("media_type").notNull().default("image"),
    /**
     * For video creatives: the public R2 URL of the source video that gets
     * uploaded to Pinterest. Null for image creatives.
     */
    videoUrl: text("video_url"),
    /** Public R2 URL of the image (the cover thumbnail for video creatives). */
    imageUrl: text("image_url").notNull(),
    /** The full prompt sent to the image model (audit + regenerate). */
    prompt: text("prompt").notNull(),
    /**
     * Per-pin SEO title. For the Pinterest drip each pin of a listing gets a
     * DISTINCT, keyword-varied title so the listing surfaces for more searches
     * (and pins don't look duplicate). Falls back to the product title when null.
     */
    title: text("title"),
    /** Platform-tailored caption copy. */
    caption: text("caption"),
    /** Hashtags (no leading '#'). */
    hashtags: text("hashtags").array().notNull().default([]),
    /** draft | approved | scheduled | published | rejected */
    status: text("status").notNull().default("draft"),
    /** Image model used, e.g. "gpt-image-1". */
    model: text("model"),
    /** Approx generation cost in USD cents (for spend tracking). */
    costCents: integer("cost_cents"),
    /** When set + status=scheduled, the publish cron will post at/after this. */
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    /** Target Pinterest board id for publishing. */
    boardId: text("board_id"),
    /** External id returned by the platform after publishing (e.g. pin id). */
    externalId: text("external_id"),
    /** Public URL of the published post. */
    externalUrl: text("external_url"),
    /** Last publish error message, if a publish attempt failed. */
    lastError: text("last_error"),
    /**
     * Number of failed publish attempts. The auto-pin drip retries a failed
     * asset on subsequent runs until this hits the cap, then gives up so one
     * bad asset can never block the daily queue (poison-pill guard).
     */
    attempts: integer("attempts").notNull().default(0),
    /** Cached Pinterest analytics (refreshed from the API). */
    metricImpressions: integer("metric_impressions"),
    metricSaves: integer("metric_saves"),
    metricPinClicks: integer("metric_pin_clicks"),
    metricOutboundClicks: integer("metric_outbound_clicks"),
    metricsUpdatedAt: timestamp("metrics_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("social_creatives_status_idx").on(t.status),
    index("social_creatives_product_idx").on(t.productId),
    index("social_creatives_scheduled_idx").on(t.scheduledAt),
    index("social_creatives_source_image_idx").on(t.sourceImageId),
  ],
);

/**
 * social_jobs — generation queue for the Social Studio's batch factory.
 *
 * Batch generation can mean dozens of gpt-image-1 calls (~15s each), which far
 * exceeds a single request's lifetime. So we enqueue one job per
 * (product × preset) and let a cron worker drain the queue a few at a time —
 * the standard queue + worker pattern for long-running AI pipelines. A manual
 * "process now" trigger drains a small bounded batch synchronously for instant
 * feedback.
 */
export const socialJobs = pgTable(
  "social_jobs",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    preset: text("preset").notNull(),
    platform: text("platform").notNull().default("generic"),
    quality: text("quality").notNull().default("medium"),
    extra: text("extra"),
    /** queued | processing | done | failed */
    status: text("status").notNull().default("queued"),
    /** Creative produced when status=done. */
    resultCreativeId: integer("result_creative_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("social_jobs_status_idx").on(t.status),
    index("social_jobs_created_idx").on(t.createdAt),
  ],
);

/**
 * social_tokens — encrypted OAuth tokens for social platform integrations.
 *
 * One row per platform (e.g. "pinterest"). The Social Studio reads the access
 * token from here first; falls back to PINTEREST_ACCESS_TOKEN env var.
 * A cron job uses the refresh_token to rotate before expiry so the pipeline
 * never silently stops posting.
 */
export const socialTokens = pgTable("social_tokens", {
  /** Platform identifier, e.g. "pinterest". Primary key. */
  platform: text("platform").primaryKey(),
  accessToken: text("access_token").notNull(),
  /** pinr_ prefix token; used to rotate access token before expiry. */
  refreshToken: text("refresh_token"),
  /** When the access token expires (UTC). */
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  /** When the refresh token expires. */
  refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
  /** Space-separated scopes granted (e.g. "boards:read pins:read pins:write"). */
  scopes: text("scopes"),
  /** Platform account id / username — for display in the admin. */
  accountId: text("account_id"),
  accountName: text("account_name"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SocialToken = typeof socialTokens.$inferSelect;

/**
 * provenance_events — append-only audit log carried over from the MDM pipeline.
 */
export const provenanceEvents = pgTable("provenance_events", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  canonicalSlug: text("canonical_slug"),
  eventType: text("event_type").notNull(),
  eventData: jsonb("event_data"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const productsRelations = relations(products, ({ many }) => ({
  images: many(productImages),
  options: many(productOptions),
  variants: many(productVariants),
  collections: many(productCollections),
  reviews: many(reviews),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, {
    fields: [reviews.productId],
    references: [products.id],
  }),
  order: one(orders, { fields: [reviews.orderId], references: [orders.id] }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  parent: one(collections, {
    fields: [collections.parentId],
    references: [collections.id],
    relationName: "collection_parent",
  }),
  children: many(collections, { relationName: "collection_parent" }),
  products: many(productCollections),
}));

export const productCollectionsRelations = relations(
  productCollections,
  ({ one }) => ({
    product: one(products, {
      fields: [productCollections.productId],
      references: [products.id],
    }),
    collection: one(collections, {
      fields: [productCollections.collectionId],
      references: [collections.id],
    }),
  }),
);

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const productOptionsRelations = relations(productOptions, ({ one }) => ({
  product: one(products, {
    fields: [productOptions.productId],
    references: [products.id],
  }),
}));

export const productVariantsRelations = relations(
  productVariants,
  ({ one }) => ({
    product: one(products, {
      fields: [productVariants.productId],
      references: [products.id],
    }),
  }),
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductImage = typeof productImages.$inferSelect;
export type ProductOption = typeof productOptions.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
export type ProductCollection = typeof productCollections.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

export type ProductWithRelations = Product & {
  images: ProductImage[];
  options: ProductOption[];
  variants: ProductVariant[];
};

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL SUBSCRIBERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * email_subscribers — captures emails from the welcome pop-up and any future
 * subscription entry-points. Used for marketing campaigns and discount delivery.
 *
 * Keeps a `status` column so we can honour unsubscribe requests without losing
 * the record (for legal/GDPR compliance logging).
 */
export const emailSubscribers = pgTable(
  "email_subscribers",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    /** Optional — collected when the user provides their name. */
    name: text("name"),
    /** Where the subscription originated. e.g. "popup" | "footer" | "checkout" */
    source: text("source").notNull().default("popup"),
    /** The discount/promo code issued to this subscriber. */
    discountCode: text("discount_code"),
    /** active | unsubscribed */
    status: text("status").notNull().default("active"),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("email_subscribers_email_idx").on(t.email),
    index("email_subscribers_status_idx").on(t.status),
  ],
);

export type EmailSubscriber = typeof emailSubscribers.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// VISITOR ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * page_views — first-party, privacy-conscious web analytics.
 *
 * One row per page view, captured by a lightweight client beacon
 * (`/api/track`). The server enriches each event with the visitor's IP and
 * approximate geolocation (derived from Vercel's edge headers in production),
 * a derived device/browser/OS, and a first-party `visitor_id` cookie used to
 * count *unique* visitors without third-party fingerprinting.
 *
 * This is the same model used by self-hosted analytics (Plausible, Fathom,
 * Umami): no external tracker, the data stays in our own database, and bots are
 * filtered out at capture time so the numbers reflect real humans.
 */
export const pageViews = pgTable(
  "page_views",
  {
    id: serial("id").primaryKey(),
    /** Anonymous first-party visitor id (cookie). Powers unique-visitor counts. */
    visitorId: text("visitor_id").notNull(),
    /** Set when the visitor is a logged-in user at view time. */
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Pathname visited, e.g. "/products/hello-kitty-case". */
    path: text("path").notNull(),
    /** Document referrer, when present. */
    referrer: text("referrer"),
    /** Best-effort client IP (first hop of x-forwarded-for). */
    ip: text("ip"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    timezone: text("timezone"),
    /** Raw User-Agent string for auditing. */
    userAgent: text("user_agent"),
    /** Derived from UA: mobile | tablet | desktop | bot. */
    device: text("device"),
    browser: text("browser"),
    os: text("os"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("page_views_created_idx").on(t.createdAt),
    index("page_views_visitor_idx").on(t.visitorId),
    index("page_views_path_idx").on(t.path),
    index("page_views_country_idx").on(t.country),
  ],
);

export type PageView = typeof pageViews.$inferSelect;
export type NewPageView = typeof pageViews.$inferInsert;

export type User = typeof users.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;

export type OrderWithItems = Order & { items: OrderItem[] };

// ─── auth table relations ───────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  orders: many(orders),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

// ─── order relations ─────────────────────────────────────────────────────────
export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));
