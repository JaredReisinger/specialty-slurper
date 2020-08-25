import test from 'ava';

import luxon from 'luxon';

import {
  identity,
  exists,
  awaitingMap,
  mapObject,
  humanizeDuration,
} from './util.js';

const { Duration } = luxon;

test('identity() - returns input', (t) => {
  [
    undefined,
    null,
    false,
    true,
    0,
    1,
    2,
    3,
    '',
    'a',
    'abc',
    {},
    { foo: 'bar' },
    [],
    [1, 2, 3],
  ].forEach((input) => {
    t.is(identity(input), input, `input: "${input}"`);
  });
});

test('exists() - returns truthy', (t) => {
  [
    [undefined, false],
    [null, false],
    [false, false],
    [0, false],
    ['', false],

    [true, true],
    [1, true],
    [2, true],
    [3, true],
    ['a', true],
    ['abc', true],
    [{}, true],
    [{ foo: 'bar' }, true],
    [[], true],
    [[1, 2, 3], true],
  ].forEach(([input, expected]) => {
    t.is(exists(input), expected, `input: "${input}"`);
  });
});

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

test('awaitingMap() - ensures fn is called serially', async (t) => {
  let inProgress = 0;

  async function mapFn(val) {
    t.is(inProgress, 0, 'another mapFn is running!');
    inProgress += 1;
    await delay(10);
    t.is(inProgress, 1, 'another mapFn has run?');
    inProgress -= 1;
    return val * 2;
  }

  const actual = await awaitingMap([1, 2, 3, 4], mapFn);

  t.deepEqual(actual, [2, 4, 6, 8]);
});

const testObject = {
  a: 'a',
  b: 2,
  c: {},
  d: ['four'],
};

test('mapObject() - leaves keys untouched by default', (t) => {
  t.deepEqual(mapObject(testObject, identity), testObject);
});

test('mapObject() - valueFn adjusts values', (t) => {
  t.deepEqual(
    mapObject(testObject, () => 'X'),
    { a: 'X', b: 'X', c: 'X', d: 'X' },
  );
});

test('mapObject() - keyFn adjusts keys', (t) => {
  t.deepEqual(
    mapObject(testObject, identity, (key) => key.repeat(2)),
    {
      aa: 'a',
      bb: 2,
      cc: {},
      dd: ['four'],
    },
  );
});

test('humanizeDuration() - creates a humanized string', (t) => {
  t.is(humanizeDuration(Duration.fromISO('P1Y')), '1 year');
});

test('humanizeDuration() - handles plurals', (t) => {
  t.is(humanizeDuration(Duration.fromISO('P2Y')), '2 years');
});

test('humanizeDuration() - handles complex durations', (t) => {
  t.is(
    humanizeDuration(Duration.fromISO('P1Y4M13D')),
    '1 year, 4 months, 13 days',
  );
});
