/**
 * New Pinterest pins are off.
 *
 * The profile and the pins already on it stay. This flag is what the daily
 * drip, the scheduled-publish cron, and the Social Studio publish buttons
 * read. `PINTEREST_AUTOPIN_ENABLED` cannot turn posting back on while this
 * is false — change it here when a small styled-pin test is ready.
 */
export const PINTEREST_POSTING_ENABLED = false;

export const PINTEREST_POSTING_DISABLED_MESSAGE =
  "Pinterest posting is turned off. Pins already on the account stay up.";
