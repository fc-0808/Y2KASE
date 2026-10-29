/**
 * SEO copy for device landing pages.
 *
 * Each live device (e.g. iPhone) gets a dedicated, indexable landing page at
 * /devices/<id> — the high-intent "iPhone cases" style queries that drive the
 * bulk of category search traffic for accessory brands. Unique intro + FAQ copy
 * per device keeps these pages substantive (not thin duplicates of /products)
 * and gives search/answer engines explicit, visible Q&A context. Google limits
 * FAQ rich-result display to authoritative government and health sites.
 */
import {
  FREE_SHIPPING_OFFER,
  IPHONE_FIT,
  IPHONE_MODELS,
  STORE_CURRENCY,
  getBasePrice,
} from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";
import {
  AIRPODS_MODELS,
  AIRPODS_SHARED_FIT_NOTE,
} from "@/lib/catalog/airpods";

export type DeviceSeo = {
  /** <title> + H1 base, e.g. "iPhone Cases". */
  heading: string;
  /**
   * One-line subtitle for the page's identity band.
   *
   * Deliberately short, and deliberately not {@link DeviceSeo.intro}: every
   * line above the filter toolbar is a line the first row of products doesn't
   * get. The long-form copy still ships — it just sits below the grid, where
   * length costs nothing.
   */
  tagline: string;
  /** Meta description + the long-form copy rendered below the grid. */
  intro: string;
  /**
   * Exact models this device's cases fit. Rendered below the grid as unique,
   * long-tail-relevant content ("iPhone 15 Pro Max case"), and kept here rather
   * than branched on in the page so a second device is data, not a code change.
   */
  models?: readonly string[];
  /** Device-specific FAQ — rendered visibly and as FAQPage structured data. */
  faqs: { question: string; answer: string }[];
  /**
   * Copy for a real section that has no products yet. Without this, an empty
   * landing uses the generic empty catalog state.
   */
  empty?: {
    title: string;
    detail: string;
    actionHref: string;
    actionLabel: string;
  };
};

const IPHONE_CASE_PRICE = formatPrice(
  getBasePrice(STORE_CURRENCY),
  STORE_CURRENCY,
);

const DEVICE_SEO: Record<string, DeviceSeo> = {
  iphone: {
    heading: "iPhone Cases",
    tagline: `iPhone 18 Pro and iPhone 18 Pro Max, plus ${IPHONE_FIT.throughShort}.`,
    intro: `iPhone 18 Pro cases and iPhone 18 Pro Max cases at Y2KASE — there is no base iPhone 18. Also ${IPHONE_FIT.throughShort}, in kawaii and Y2K designs, MagSafe when the product says so. iPhone Duo is a separate case and these designs do not fit it. ${FREE_SHIPPING_OFFER}.`,
    models: IPHONE_MODELS,
    faqs: [
      {
        question: "Do you sell iPhone 18 cases?",
        answer:
          "Yes — iPhone 18 Pro and iPhone 18 Pro Max. This shop does not sell a base iPhone 18 case. Hello Kitty, Sanrio and Kuromi each have an iPhone 18 page, and every iPhone case in the catalog is offered for both 18 Pro and 18 Pro Max. Pick the exact model on the product page; the camera cutout is not shared.",
      },
      {
        question: "Will these cases fit an iPhone Duo?",
        answer:
          "No. iPhone Duo is a foldable with its own case. The designs on this page are cut for the numbered iPhones and do not fit it. iPhone Duo cases are a separate section, and they use the same style prices when a design is listed.",
      },
      {
        question: "Which iPhone models do your cases fit?",
        answer: `Our iPhone cases are available for ${IPHONE_FIT.listed} series, including the Pro and Pro Max models. Pick your exact model on each product page. iPhone Duo is not one of those models.`,
      },
      {
        question: "Are your iPhone cases MagSafe compatible?",
        answer:
          "Cases marked MagSafe have built-in magnets aligned to Apple's MagSafe standard, so they work with MagSafe chargers, wallets and accessories.",
      },
      {
        question: "Do the cases protect against drops?",
        answer:
          "Yes — our cases combine a shock-absorbing build with raised edges around the screen and camera to guard against everyday drops and scratches, all while staying cute.",
      },
      {
        question: "Can I add a phone charm or grip?",
        answer:
          "Many designs offer a Case + Grip + Charm bundle. Choose your combination from the style selector on the product page. A magnetic grip on its own is a separate section, at the same price as an iPhone case.",
      },
    ],
  },
  "iphone-duo": {
    heading: "iPhone Duo Cases",
    tagline: "Its own mould. Case Only, the same price as an iPhone case.",
    intro: `iPhone Duo cases are a separate line at Y2KASE. A case cut for iPhone 18, 17, or any earlier iPhone does not fit the foldable. Each design is Case Only, at the same price as an iPhone Case Only. ${FREE_SHIPPING_OFFER}.`,
    faqs: [
      {
        question: "Will an iPhone case fit an iPhone Duo?",
        answer:
          "No. iPhone Duo needs its own case. The designs in the iPhone section do not fit it.",
      },
      {
        question: "How much is an iPhone Duo case?",
        answer:
          "The same as an iPhone Case Only. iPhone Duo does not offer a grip or a charm.",
      },
    ],
    empty: {
      title: "No iPhone Duo designs yet",
      detail:
        "Cases for the other iPhones do not fit iPhone Duo. This section is only for that mould, Case Only at the iPhone case price, and nothing is listed here yet.",
      actionHref: "/devices/iphone",
      actionLabel: "Shop iPhone cases",
    },
  },
  "magnetic-grips": {
    heading: "Magnetic Grips",
    tagline: "The same price as an iPhone case.",
    intro: `Magnetic grips at Y2KASE snap onto a MagSafe case. Each one is ${IPHONE_CASE_PRICE}, the same price as an iPhone case. ${FREE_SHIPPING_OFFER}.`,
    faqs: [
      {
        question: "How much is a magnetic grip?",
        answer: `The same as an iPhone case: ${IPHONE_CASE_PRICE}. The price stays tied to the iPhone case price in every currency.`,
      },
      {
        question: "Is a magnetic grip a phone case?",
        answer:
          "No. A magnetic grip attaches to a MagSafe case. Phone cases, including a case that already includes a grip, stay in the iPhone section.",
      },
      {
        question: "Which phones does a magnetic grip fit?",
        answer:
          "It attaches to MagSafe cases. It is not cut for one iPhone model.",
      },
    ],
    empty: {
      title: "No magnetic grips yet",
      detail: `Magnetic grips are their own section, at the same price as an iPhone case (${IPHONE_CASE_PRICE}). Nothing is listed here yet.`,
      actionHref: "/devices/iphone",
      actionLabel: "Shop iPhone cases",
    },
  },
  airpods: {
    heading: "AirPods Cases",
    tagline: `Kawaii and Y2K designs for AirPods and AirPods Pro — ${AIRPODS_SHARED_FIT_NOTE}`,
    intro: `Shop kawaii and Y2K AirPods cases at Y2KASE — holographic, glittery and character-themed designs for ${AIRPODS_MODELS.join(", ")}. ${AIRPODS_SHARED_FIT_NOTE} Pick Case Only, Case + Charm or Charm Only on each product page. ${FREE_SHIPPING_OFFER}.`,
    models: AIRPODS_MODELS,
    faqs: [
      {
        question: "Which AirPods models do your cases fit?",
        answer: `Our AirPods cases are available for ${AIRPODS_MODELS.join(", ")}. ${AIRPODS_SHARED_FIT_NOTE} Pick your exact model on each product page.`,
      },
      {
        question: "Do AirPods cases come with a charm?",
        answer:
          "Many designs offer Case Only, Case + Charm, or Charm Only. Choose the combination on the product page — there is no grip option on AirPods cases.",
      },
      {
        question: "Are AirPods cases MagSafe?",
        answer:
          "No — MagSafe is an iPhone charging standard. AirPods cases protect the charging case itself and do not attach to MagSafe chargers or wallets.",
      },
      {
        question: "Will one case fit both AirPods 4 and AirPods 5?",
        answer: `Yes. ${AIRPODS_SHARED_FIT_NOTE} Selecting that fit on the product page covers both generations.`,
      },
    ],
  },
};

/** SEO copy for a device, with a sensible fallback for devices without custom copy. */
export function deviceSeo(id: string, label: string): DeviceSeo {
  return (
    DEVICE_SEO[id] ?? {
      heading: `${label} Cases`,
      tagline: `Kawaii and Y2K ${label} designs, made to express your vibe.`,
      intro: `Shop kawaii and Y2K ${label} cases and accessories at Y2KASE — holographic, glittery and character-themed designs made to express your vibe. ${FREE_SHIPPING_OFFER}.`,
      faqs: [],
    }
  );
}
