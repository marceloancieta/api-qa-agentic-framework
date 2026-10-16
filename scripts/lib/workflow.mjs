// The check names a GitHub Actions job reports. A required check in a ruleset matches one of them
// exactly, so a job whose name uses the matrix (`dast (vampi ${{ matrix.mode }})`) reports one name
// per combination, and none under its written name.

const MATRIX_REFERENCE = /\$\{\{\s*matrix\.([\w-]+)\s*\}\}/g;

/**
 * The scalar lists of a job's `strategy.matrix`, as `[key, values]`; `include` and `exclude` are
 * not lists of values.
 */
function matrixLists(job) {
  const matrix = job?.strategy?.matrix;
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return [];
  return Object.entries(matrix).filter(
    ([key, values]) =>
      !['include', 'exclude'].includes(key) &&
      Array.isArray(values) &&
      values.every((value) => ['string', 'number', 'boolean'].includes(typeof value)),
  );
}

/** Every combination of the lists, as objects from key to value. */
function combinations(lists) {
  return lists.reduce(
    (combos, [key, values]) =>
      combos.flatMap((combo) => values.map((value) => ({ ...combo, [key]: String(value) }))),
    [{}],
  );
}

/**
 * The check names job `id` reports: its `name`, or its id, once per combination of its matrix. A
 * name that refers to the matrix is filled in with each combination; any other name, or the id,
 * gets the combination's values appended, `<name> (<value>, ...)`, as GitHub names it. A name that
 * refers to a matrix key with no list of values (one set by `include`, say) is returned as written,
 * because the names it reports cannot be read from the workflow.
 */
export function checkNamesOf(id, job) {
  const lists = matrixLists(job);
  const name = typeof job?.name === 'string' ? job.name : null;
  if (lists.length === 0) return [name ?? id];
  const keys = name === null ? [] : [...name.matchAll(MATRIX_REFERENCE)].map(([, key]) => key);
  if (keys.length === 0) {
    const base = name ?? id;
    return [
      ...new Set(
        combinations(lists).map((combo) => `${base} (${Object.values(combo).join(', ')})`),
      ),
    ];
  }
  const used = lists.filter(([key]) => keys.includes(key));
  if (keys.some((key) => !used.some(([listed]) => listed === key))) return [name];
  return [
    ...new Set(
      combinations(used).map((combo) => name.replace(MATRIX_REFERENCE, (_, key) => combo[key])),
    ),
  ];
}

/** The check names every job of a parsed workflow reports. */
export function workflowCheckNames(workflow) {
  return Object.entries(workflow?.jobs ?? {}).flatMap(([id, job]) => checkNamesOf(id, job));
}
