// luxon doesn't have true ESM exports yet
import luxon from 'luxon';

import createLogger from './logger.js';
import progressFactory from './progress.js';
import { fetchDatePage, fetchPage, verifyCache } from './fetcher.js';
import {
  parseDatePage,
  excerpt,
  parseEventPage,
  parseResultPage,
} from './parser.js';
import { exists, awaitingMap } from './util.js';
import { reportResults } from './reporter.js';

const { DateTime, Duration, Interval } = luxon;

const cacheDir = './.cache';

const TEMP_TESTING = true;

/**
 * slurper logic kicked off by the CLI
 *
 * At a high level, this fetches per-day event pages (looking for all
 * specialties across all states) to get a list of event links, then fetches all
 * of the event pages.  From the event pages, specialties (and parent
 * specialties) are found and links to the per-breed-event results are extracted
 * (REVIEW is this correct?).  Only the requested breed is passed along at this
 * point (or not?).  Finally, the per-breed-event results are fetched and parsed
 * to find the hosting club, judge, etc., and the winning dogs.
 *
 * @param {*} args
 */
export default async function slurper(opts) {
  const logger = createLogger(opts.verbose, opts.logFile);
  logger.debug({ opts }, 'using opts');

  // TODO: opts.output for file-to-write...

  const createProgress = progressFactory(opts.progress);

  if (!TEMP_TESTING) {
    const { items, seconds } = await verifyCache(cacheDir, logger);
    // eslint-disable-next-line no-console
    console.log(
      `verified cache "${cacheDir}": ${items} items in ${seconds} seconds`,
    );
    logger.info({ cacheDir, items, seconds }, 'verified cache');
  }

  // assume the previous year!
  const now = DateTime.utc();
  const end = now.startOf('year');
  const start = end.minus({ year: 1 });
  const interval = TEMP_TESTING
    ? Interval.fromISO('2019-01-18/P1D', { zone: 'utc' })
    : Interval.fromDateTimes(start, end);
  logger.trace(
    {
      // interval,
      from: interval.start.toISODate(),
      to: interval.end.toISODate(),
      days: interval.length('days'),
    },
    'interval',
  );

  const datePages = await fetchAllDatePages(interval, createProgress, logger);
  logger.trace(
    {
      results: datePages.map(({ date, metadata, page }) => ({
        date,
        excerpt: excerpt(page),
        length: page.length,
        metadata,
      })),
    },
    'date pages',
  );

  const eventLinks = datePages.flatMap(({ date, breed, page, metadata }) =>
    parseDatePage(date, breed, page, metadata, logger),
  );
  logger.trace({ eventLinks }, 'event links');

  const eventPages = await fetchAllPages(
    'events',
    eventLinks,
    createProgress,
    logger,
  );
  logger.trace(
    {
      results: eventPages.map(({ page, metadata }) => ({
        excerpt: excerpt(page),
        length: page.length,
        metadata,
      })),
    },
    'event pages',
  );

  const resultLinks = eventPages.flatMap(({ page /* , metadata */ }) =>
    parseEventPage(page, logger),
  );
  logger.trace({ resultLinks }, 'result links');

  const resultPages = await fetchAllPages(
    'results',
    resultLinks,
    createProgress,
    logger,
  );
  logger.trace(
    {
      results: resultPages.map(({ page, metadata }) => ({
        excerpt: excerpt(page),
        length: page.length,
        metadata,
      })),
    },
    'result pages',
  );

  const finalData = resultPages.map(({ page /* , metadata */ }) =>
    parseResultPage(page, logger),
  );
  logger.debug({ finalData }, 'final data');

  reportResults(finalData, true);
}

async function fetchAllDatePages(interval, createProgress, logger) {
  // Instead of a for-loop, adding a day at time, it's cleaner to split the
  // interval into days and then we can perform "mapping" logic...
  const days = interval.splitBy(Duration.fromISO('P1D')).map((i) => i.start);
  // logger.debug({ days }, 'days?');

  const bar = createProgress('days', days.length);

  const results = (
    await awaitingMap(days, async (date) => {
      const data = await fetchDatePage(date, 'basenjis', cacheDir, logger);
      bar.tick();
      return data;
    })
  ).filter(exists);

  bar.update(1);

  return results;
}

async function fetchAllPages(label, links, createProgress, logger) {
  const bar = createProgress(label, links.length);

  const results = (
    await awaitingMap(links, async (link) => {
      const data = await fetchPage(link, cacheDir, logger);
      bar.tick();
      return data;
    })
  ).filter(exists);

  bar.update(1);

  return results;
}
