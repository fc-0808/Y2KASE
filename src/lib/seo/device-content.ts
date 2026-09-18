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
import { FREE_SHIPPING_OFFER, IPHONE_FIT, IPHONE_MODELS } from "@/lib/pricing";
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
};

const DEVICE_SEO: Record<string, DeviceSeo> = {
  iphone: {
    heading: "iPhone Cases",
    tagline: `Kawaii and Y2K designs for ${IPHONE_FIT.through} — MagSafe-ready and drop-protective.`,
    intro: `Shop kawaii and Y2K iPhone cases at Y2KASE — holographic, glittery and character-themed designs for ${IPHONE_FIT.through}, including Pro and Pro Max. MagSafe-compatible, drop-protective, and made to express your vibe. ${FREE_SHIPPING_OFFER}.`,
    models: IPHONE_MODELS,
    faqs: [
      {
        question: "Which iPhone models do your cases fit?",
        answer: `Our iPhone cases are available for ${IPHONE_FIT.listed} series, including the Pro and Pro Max models. Pick your exact model on each product page.`,
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
          "Many designs offer a Case + Grip + Charm bundle. Choose your combination from the style selector on the product page.",
      },
    ],
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
