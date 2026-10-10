// Decision tables (PROC-08): a result that depends on a combination of conditions, written as YAML in
// services/<pack>/rules/<id>.yaml and read by data-driven specs through a generated module.
//
//   title: Finding pets by status
//   operation: GET /pet/findByStatus          optional; the operation the table describes
//   conditions:                               each condition and its classes of values
//     status_sent: [sent, omitted]
//     status_value: [in-set, outside-set, empty]
//   actions: [status]                         the outcomes every rule states
//   rules:
//     - id: R1
//       when: { status_sent: sent, status_value: in-set }   a condition left out matches any class
//       then: { status: 200 }
//
// A table is checked before it is used, so a spec never iterates a table with holes: every
// combination of classes must be matched by some rule (complete), and two rules matching the same
// combination must not disagree (consistent). Overlapping rules that agree are allowed.

const ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const MAX_COMBINATIONS = 4096;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Every combination of condition classes, as `{ condition: class }` objects. */
export function combinations(conditions) {
  return Object.entries(conditions).reduce(
    (partial, [name, classes]) =>
      partial.flatMap((combination) => classes.map((value) => ({ ...combination, [name]: value }))),
    [{}],
  );
}

const matches = (rule, combination) =>
  Object.entries(rule.when).every(([name, value]) => combination[name] === value);

const describeCombination = (combination) =>
  Object.entries(combination)
    .map(([name, value]) => `${name}=${value}`)
    .join(', ');

/**
 * Problems with one parsed table (an object from YAML); empty when it can be used.
 * `name` is used in messages, usually the file name.
 */
export function tableProblems(table, name = 'table') {
  const problems = [];
  const add = (message) => problems.push(`${name}: ${message}`);
  if (!isObject(table)) return [`${name}: a decision table must be a mapping`];
  if (typeof table.title !== 'string' || !table.title.trim()) add('`title` is required');
  if (table.operation !== undefined && !/^[A-Z]+ \/\S*$/.test(String(table.operation))) {
    add('`operation` must look like "GET /path"');
  }

  const conditions = isObject(table.conditions) ? table.conditions : null;
  if (!conditions || Object.keys(conditions).length === 0) {
    add('`conditions` must map each condition to its list of classes');
  }
  for (const [condition, classes] of Object.entries(conditions ?? {})) {
    if (!ID.test(condition)) add(`condition "${condition}" is not a plain name`);
    if (!Array.isArray(classes) || classes.length === 0) {
      add(`condition ${condition} needs at least one class`);
    } else if (new Set(classes.map(String)).size !== classes.length) {
      add(`condition ${condition} lists a class twice`);
    }
  }
  const actions = Array.isArray(table.actions) ? table.actions : null;
  if (!actions || actions.length === 0) add('`actions` must list the outcomes each rule states');

  const rules = Array.isArray(table.rules) ? table.rules : null;
  if (!rules || rules.length === 0) add('`rules` must list at least one rule');
  const ids = new Set();
  for (const [index, rule] of (rules ?? []).entries()) {
    const label = rule?.id ?? `rule ${index + 1}`;
    if (!isObject(rule) || typeof rule.id !== 'string' || !ID.test(rule.id)) {
      add(`${label} needs an id such as R1`);
      continue;
    }
    if (ids.has(rule.id)) add(`rule id ${rule.id} is used twice`);
    ids.add(rule.id);
    if (!isObject(rule.when)) add(`${rule.id}: \`when\` must map conditions to classes`);
    for (const [condition, value] of Object.entries(isObject(rule.when) ? rule.when : {})) {
      if (!conditions || !(condition in conditions)) {
        add(`${rule.id}: unknown condition ${condition}`);
      } else if (!conditions[condition].map(String).includes(String(value))) {
        add(`${rule.id}: ${condition} has no class "${value}"`);
      }
    }
    const then = isObject(rule.then) ? rule.then : null;
    if (!then) add(`${rule.id}: \`then\` must state every action`);
    for (const action of actions ?? []) {
      if (then && !(action in then)) add(`${rule.id}: \`then\` does not state ${action}`);
    }
    for (const key of Object.keys(then ?? {})) {
      if (actions && !actions.includes(key))
        add(`${rule.id}: \`then\` states ${key}, which is not an action`);
    }
  }
  if (problems.length > 0 || !conditions || !rules) return problems;

  const size = Object.values(conditions).reduce((product, classes) => product * classes.length, 1);
  if (size > MAX_COMBINATIONS) {
    add(`${size} combinations; split the table (at most ${MAX_COMBINATIONS})`);
    return problems;
  }
  const normalized = normalizeTable(table);
  for (const combination of combinations(normalized.conditions)) {
    const matching = normalized.rules.filter((rule) => matches(rule, combination));
    if (matching.length === 0) {
      add(`no rule covers ${describeCombination(combination)}`);
      continue;
    }
    const outcomes = new Set(matching.map((rule) => JSON.stringify(rule.then)));
    if (outcomes.size > 1) {
      add(
        `rules ${matching.map((rule) => rule.id).join(', ')} disagree on ${describeCombination(combination)}`,
      );
    }
  }
  return problems;
}

/** The table with classes as strings and keys in a stable order, ready to be generated. */
export function normalizeTable(table) {
  const conditions = Object.fromEntries(
    Object.entries(table.conditions).map(([name, classes]) => [name, classes.map(String)]),
  );
  return {
    title: table.title,
    ...(table.operation ? { operation: table.operation } : {}),
    conditions,
    actions: [...table.actions],
    rules: table.rules.map((rule) => ({
      id: rule.id,
      when: Object.fromEntries(
        Object.keys(conditions)
          .filter((name) => name in rule.when)
          .map((name) => [name, String(rule.when[name])]),
      ),
      then: Object.fromEntries(table.actions.map((action) => [action, rule.then[action]])),
    })),
  };
}

/** The rule that decides a combination of classes (the first matching one), or null. */
export function decide(table, combination) {
  return table.rules.find((rule) => matches(rule, combination)) ?? null;
}
