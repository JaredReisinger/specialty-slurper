// caching fetcher, for performance (and so re-runs are faster)
import cacache from 'cacache';
import bent from 'bent';
import luxon from 'luxon';

const { DateTime, Duration } = luxon;

const akcRequest = bent('https://www.apps.akc.org', 'string');

const cacheTtl = Duration.fromISO('P1M'); // one month TTL
// const cacheTtl = Duration.fromISO('PT10S'); // ten-second test TTL

export async function verifyCache(cacheDir, logger) {
  // NOTE: can use cacache.verify() to create the cache!
  const verify = await cacache.verify(cacheDir);
  logger.trace({ verify }, 'cache verified');

  const start = DateTime.fromJSDate(verify.startTime);
  const end = DateTime.fromJSDate(verify.endTime);
  const elapsed = end.diff(start);

  const items = verify.totalEntries;
  const seconds = elapsed.as('seconds');
  logger.debug({ items, seconds }, 'cache verified');

  return { items, seconds };
}

// TODO: pass "now" in for testing?
// context: { cacheDir, now, logger } ?
export async function fetchDatePage(date, breed, cacheDir, logger) {
  // We used to include all states: AL, AK, AZ, AR, CA, CO, CT, DC, DE, FL, GA,
  // HI, ID, IL, IN, IA, KS, KY, LA, ME, MD, MA, MI, MN, MS, MO, MT, NE, NV, NH,
  // NJ, NM, NY, NC, ND, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VT, VA, WA, WV,
  // WI, WY, PR ... turns out you can simply omit the value to get "all" states.

  // Also, "breed" is a magic number (with trailing whitespace! who's working on
  // their software?!) that would be a pain to extract... but might be worth it
  // for performance reasons. ('Basenjis' => '402 ' => '402%20')
  const breedId = breed === 'Basenji' ? '402%20' : '';
  const params = [
    `urlday=${date.toISODate()}`,
    `event_type=S`,
    `event_states=`,
    `event_month=${date.toFormat('MMM')}`,
    `breed=${breedId}`,
    `event_year=${date.toFormat('yyyy')}`,
  ];

  const requestUrl = `/apps/event_calendar/index.cfm?${params.join('&')}`;

  return fetchPage(requestUrl, cacheDir, logger);
}

// TODO: allow per-fetch TTL?
export async function fetchPage(relUrl, cacheDir, logger) {
  const cacheKey = relUrl;

  // Check the cache first...
  const info = await cacache.get.info(cacheDir, cacheKey);

  if (info) {
    const timestamp = DateTime.fromMillis(info.time);
    const now = DateTime.local();
    const expired = now.diff(timestamp) > cacheTtl;
    logger.trace(
      {
        cacheDir,
        cacheKey,
        from: timestamp,
        age: timestamp.toRelative(),
        expired,
        path: info.path,
      },
      'found in cache',
    );

    if (!expired) {
      // return content?
      const { metadata, data } = await cacache.get(cacheDir, cacheKey);
      return { metadata, page: data.toString() };
    }
  }

  logger.debug({ relUrl }, 'akc request');
  const response = await akcRequest(relUrl);
  // logger.debug({ relUrl, response }, 'akc response');

  // throw the data in the cache...
  await cacache.put(cacheDir, cacheKey, response);
  logger.debug({ cacheKey }, 'added to cache');
  return { metadata: null, page: response };
}
