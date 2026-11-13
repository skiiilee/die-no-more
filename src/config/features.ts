/**
 * Feature flags. Changing one is a product decision, not a deploy setting.
 *
 * CARE_REMINDERS: water/fertilizer reminder choices in S05 (ADR-0003 D16).
 * Off until reminder scheduling is built on the checked Perenual data
 * (docs/04-api-design.md "Live check"). While off, S05 hides the reminder area.
 */
export const FEATURES = {
  CARE_REMINDERS: false,
} as const;
