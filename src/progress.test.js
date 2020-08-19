import test from 'ava';

import progressFactory from './progress.js';

test('createProgress() - create an object with tick() and update()', (t) => {
  [true, false].forEach((showProgress) => {
    const createProgress = progressFactory(showProgress);

    const actual = createProgress('label', 100);

    t.is(typeof actual.tick, 'function');
    t.is(typeof actual.update, 'function');
  });
});
