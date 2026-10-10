// Types for the decision tables a pack generates from services/<pack>/rules/*.yaml
// (scripts/derive-decision-tables.mjs). A table is complete and consistent by the time a spec sees
// it: every combination of condition classes has exactly one outcome.

export interface DecisionRule {
  readonly id: string;
  /** Condition -> class. A condition left out matches any class. */
  readonly when: Readonly<Record<string, string>>;
  /** Action -> expected outcome. */
  readonly then: Readonly<Record<string, string | number | boolean | null>>;
}

export interface DecisionTable {
  readonly title: string;
  readonly operation?: string;
  readonly conditions: Readonly<Record<string, readonly string[]>>;
  readonly actions: readonly string[];
  readonly rules: readonly DecisionRule[];
}

/** `R2: status_sent=sent, status_value=outside-set`, for step titles. */
export function describeRule(rule: DecisionRule): string {
  const when = Object.entries(rule.when)
    .map(([condition, value]) => `${condition}=${value}`)
    .join(', ');
  return `${rule.id}: ${when || 'any input'}`;
}
