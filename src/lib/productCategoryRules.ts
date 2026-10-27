/**
 * Category/unit defaults inferred from a product's name.
 *
 * Centralised so the rule lives in one place: the Products form uses it to
 * pre-select on typing, and the API applies it on create for anything that
 * posts directly. Adding a rule here changes both at once.
 */
export type CategoryDefault = { categoryCode: string; uomCode: string };

const NAME_RULES: { pattern: RegExp; defaults: CategoryDefault }[] = [
  // LPG is always sold as a cylinder, whatever else the name says.
  { pattern: /\blpg\b/i, defaults: { categoryCode: "cylinder", uomCode: "cylinder" } },
];

/**
 * Returns the category/unit a product name implies, or null when nothing
 * matches and the user's own selection should stand.
 */
export function defaultsForProductName(name: string): CategoryDefault | null {
  for (const rule of NAME_RULES) {
    if (rule.pattern.test(name ?? "")) return rule.defaults;
  }
  return null;
}
