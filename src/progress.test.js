import test from 'ava';

import progressFactory from './progress.js';

test('createProgress() - create an object with tick() and update()', (t) => {
  [true, false].forEach((showProgress) => {
    const { createProgress } = progressFactory(showProgress);

    const actual = createProgress('label', 100);

    t.is(typeof actual.tick, 'function');
    t.is(typeof actual.update, 'function');
  });
});

test('mapWithProgress() - maps the array items', (t) => {
  [true, false].forEach((showProgress) => {
    const { mapWithProgress } = progressFactory(showProgress);

    const actual = mapWithProgress('test', [1, 2, 3, 4, 5], (item) => item * 2);
    t.deepEqual(actual, [2, 4, 6, 8, 10]);
  });
});

test('awaitingMapWithProgress() - maps the array items', async (t) => {
  const { awaitingMapWithProgress } = progressFactory(true);

  const actual = await awaitingMapWithProgress(
    'test',
    [1, 2, 3, 4, 5],
    (item) => Promise.resolve(item * 2),
  );
  t.deepEqual(actual, [2, 4, 6, 8, 10]);
});
