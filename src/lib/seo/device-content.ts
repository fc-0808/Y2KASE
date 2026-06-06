/**
 * SEO copy for device landing pages.
 *
 * Each live device (e.g. iPhone) gets a dedicated, indexable landing page at
 * /devices/<id> — the high-intent "iPhone cases" style queries that drive the
 * bulk of category search traffic for accessory brands. Unique intro + FAQ copy
 * per device keeps these pages substantive (not thin duplicates of /products)
 * and earns the FAQ rich result.
 */

export type DeviceSeo = {
  /** <title> + H1 base, e.g. "iPhone Cases". */
  heading: string;
  /** Meta description + on-page intro. */
  intro: string;
  /** Device-specific FAQ — rendered visibly and as FAQPage structured data. */
  faqs: { question: string; answer: string }[];
};

const DEVICE_SEO: Record<string, DeviceSeo> = {
  iphone: {
    heading: "iPhone Cases",
    intro:
      "Shop kawaii and Y2K iPhone cases at Y2KASE — holographic, glittery and character-themed designs for iPhone 13 through iPhone 17, including Pro and Pro Max. MagSafe-compatible, drop-protective, and made to express your vibe. Free shipping over $35.",
    faqs: [
      {
        question: "Which iPhone models do your cases fit?",
        answer:
          "Our iPhone cases are available for iPhone 13, 14, 15, 16 and 17 series, including the Pro and Pro Max models. Pick your exact model on each product page.",
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
};

/** SEO copy for a device, with a sensible fallback for devices without custom copy. */
export function deviceSeo(id: string, label: string): DeviceSeo {
  return (
    DEVICE_SEO[id] ?? {
      heading: `${label} Cases`,
      intro: `Shop kawaii and Y2K ${label} cases and accessories at Y2KASE — holographic, glittery and character-themed designs made to express your vibe. Free shipping over $35.`,
      faqs: [],
    }
  );
}
