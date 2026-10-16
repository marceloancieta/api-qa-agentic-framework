// The check names a job reports (scripts/lib/workflow.mjs): a required check matches one of them
// exactly, so a matrix job reports one name per combination and none under its written name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { checkNamesOf, workflowCheckNames } from '../lib/workflow.mjs';

test('a job without a matrix reports its name, or its id when it has none', () => {
  assert.deepEqual(checkNamesOf('e2e', { name: 'e2e (petstore)' }), ['e2e (petstore)']);
  assert.deepEqual(checkNamesOf('gates', {}), ['gates']);
  // A matrix expression with no matrix is left as written: nothing fills it in.
  assert.deepEqual(checkNamesOf('scan', { name: 'dast (${{ matrix.mode }})' }), [
    'dast (${{ matrix.mode }})',
  ]);
});

test('a name that refers to the matrix reports one name per combination, never the written one', () => {
  const job = {
    name: 'dast (vampi ${{ matrix.mode }})',
    strategy: { matrix: { mode: ['secure', 'vulnerable'] } },
  };
  assert.deepEqual(checkNamesOf('scan', job), ['dast (vampi secure)', 'dast (vampi vulnerable)']);
  const spaced = {
    name: 'run ${{matrix.os}}-${{ matrix.node }}',
    strategy: { matrix: { os: ['linux'], node: [20, 22] } },
  };
  assert.deepEqual(checkNamesOf('run', spaced), ['run linux-20', 'run linux-22']);
  // A key the name does not use multiplies the jobs, not the names.
  const unused = {
    name: 'lint ${{ matrix.os }}',
    strategy: { matrix: { os: ['a', 'b'], shard: [1, 2] } },
  };
  assert.deepEqual(checkNamesOf('lint', unused), ['lint a', 'lint b']);
});

test('a matrix job whose name does not use the matrix gets the values appended', () => {
  const matrix = { strategy: { matrix: { os: ['linux', 'windows'], node: [22] } } };
  assert.deepEqual(checkNamesOf('build', matrix), ['build (linux, 22)', 'build (windows, 22)']);
  assert.deepEqual(checkNamesOf('build', { name: 'Build', ...matrix }), [
    'Build (linux, 22)',
    'Build (windows, 22)',
  ]);
});

test('a name that uses a key without a list of values is returned as written', () => {
  const job = {
    name: 'e2e ${{ matrix.pack }}',
    strategy: { matrix: { include: [{ pack: 'a' }, { pack: 'b' }] } },
  };
  assert.deepEqual(checkNamesOf('e2e', job), ['e2e ${{ matrix.pack }}']);
  const fromExpression = {
    name: 'e2e ${{ matrix.pack }}',
    strategy: { matrix: { pack: '${{ fromJSON(inputs.packs) }}' } },
  };
  assert.deepEqual(checkNamesOf('e2e', fromExpression), ['e2e ${{ matrix.pack }}']);
});

test('a workflow reports the names of all its jobs', () => {
  const workflow = parse(
    [
      'jobs:',
      '  scan:',
      '    name: dast (vampi ${{ matrix.mode }})',
      '    strategy:',
      '      matrix:',
      '        mode: [secure, vulnerable]',
      '  scan-petstore:',
      '    name: dast (petstore)',
      '  untitled: {}',
    ].join('\n'),
  );
  assert.deepEqual(workflowCheckNames(workflow), [
    'dast (vampi secure)',
    'dast (vampi vulnerable)',
    'dast (petstore)',
    'untitled',
  ]);
  assert.deepEqual(workflowCheckNames({}), []);
});
