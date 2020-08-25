import test from 'ava';
import * as td from 'testdouble';

import 'luxon'; // this seems to help testdouble...

import createLogger from './logger.js';

const mockLogger = td.object(createLogger());

const cacheDir = 'CACHE_DIR';
const cacheKey = 'CACHE_KEY';

test.beforeEach(async (t) => {
  const bent = (await td.replaceEsm('bent')).default;

  // note that mocked returns much be defined here... seems weird!
  const mockRequest = td.func();
  td.when(mockRequest(cacheKey)).thenResolve('RESPONSE');
  td.when(bent(), { ignoreExtraArgs: true }).thenReturn(mockRequest);

  const cacache = (await td.replaceEsm('cacache')).default;

  td.when(cacache.verify(cacheDir)).thenResolve({
    startTime: new Date(2000, 1, 1, 0, 0, 0),
    endTime: new Date(2000, 1, 1, 0, 0, 5),
    totalEntries: 10,
  });

  td.when(cacache.get.info(cacheDir, cacheKey)).thenResolve({
    path: '',
    time: 0,
  });

  t.context = {
    cacache,
    bent,
    fetcher: await import('./fetcher.js'),
  };
});

test('verifyCache() - calls cacache.verify()', async (t) => {
  const actual = await t.context.fetcher.verifyCache(cacheDir, mockLogger);
  t.deepEqual(actual, {
    items: 10,
    seconds: 5,
  });
});

test('fetchPage() - gets the expected response', async (t) => {
  const actual = await t.context.fetcher.fetchPage(
    cacheKey,
    cacheDir,
    mockLogger,
  );
  t.deepEqual(actual, { metadata: null, page: 'RESPONSE' });
});
