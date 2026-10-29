/**
 * The one Trustpilot review we show on the homepage.
 *
 * Trustpilot's TrustScore for a single 5-star review is 3.7, not 5. That
 * number is their confidence adjustment, not her rating, so the page quotes
 * the review and links to it. Do not render a TrustScore, an "Excellent"
 * badge, or a review count until there are enough reviews for the score to
 * mean what a shopper thinks it means.
 *
 * The quote is her first sentence, unchanged. The rest of the review is a
 * request to tag the shop, and it stays on Trustpilot behind the link.
 */
export const TRUSTPILOT_REVIEW = {
  author: "Kylie",
  rating: 5,
  /** Her first sentence, unchanged. */
  quote:
    "Not only were you so sweet emailing me and making sure I got the right size case, the personalized card and stickers are so cute and the case is amazing I love it!",
  /**
   * The product line, lifted so it can stand as a headline. The first letter
   * is capped; the exact sentence is `quote`. The link still opens the full
   * review, including the note about tagging the shop.
   */
  pull: "The personalized card and stickers are so cute and the case is amazing I love it!",
  href: "https://www.trustpilot.com/reviews/6ad92671ffc97be438d7760b",
} as const;
