import { writeFile } from 'fs/promises';
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
import { exists, humanizeDuration } from './util.js';
import { generateReport } from './reporter.js';

const { DateTime, Duration, Interval } = luxon;

const cacheDir = './.cache';

const breed = 'Basenji';

const TEMP_TESTING = false;

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
 */
export default async function slurper(opts) {
  const logger = createLogger(opts.verbose, opts.logFile);
  logger.debug({ opts }, 'using opts');

  let start = null;
  let startUnit = null;
  let interval = null;

  // try to infer some options based on command-line arguments...
  opts._.forEach((arg) => {
    logger.debug({ arg, type: typeof arg }, 'arg...');
    // yargs auto-parses numbers, but we generally want to treat these as
    // strings!
    const argStr = `${arg}`;

    // if it ends with '.csv', it's the output file name
    if (argStr.toLowerCase().endsWith('.csv')) {
      logger.debug({ argStr }, 'inferred output file');
      if (opts.output && argStr !== opts.output) {
        // eslint-disable-next-line no-console
        console.error(
          `ERROR: "${argStr}" given, but "${opts.output}" is already the output file.`,
        );
        process.exit(1);
      }
      // eslint-disable-next-line no-param-reassign
      opts.output = argStr;
      return;
    }

    // Check for ISO intervals... on the off-chance that the user passes an
    // exact ISO interval ("start/end" or "start/duration"), it will properly
    // parse.
    const tryInterval = Interval.fromISO(argStr, { zone: 'utc' });
    if (tryInterval?.isValid) {
      if (interval) {
        // eslint-disable-next-line no-console
        console.error(
          `ERROR: "${argStr}" given, but "${interval.start.toISODate()}/${interval.end.toISODate()}" is already the interval.`,
        );
        process.exit(1);
      }

      if (start) {
        // eslint-disable-next-line no-console
        console.error(
          `ERROR: "${argStr}" given, but "${start.toISODate()}}" is already provided as the interval start.`,
        );
        process.exit(1);
      }

      interval = tryInterval;
      logger.debug({ argStr, interval }, 'saw interval argument');
      return;
    }

    // For dates, we can't *just* let Luxon's DateTime.fromISO() parse the
    // string, as we'll lose some contextual information.  In particular, we
    // want to be able to infer the duration/interval depending on what's
    // passed: "2019" means "the whole year", while "2019-01" means "the month",
    // and "2019-01-01" means "just the day".  If, however, it looks like a true
    // ISO interval ("start/end" or "start/duration") then we do delegate
    // entirely to Luxon.
    const dateMatch = argStr.match(
      /^(?<year>\d{4})(?:-(?<month>\d{2})(?:-(?<day>\d{2}))?)?$/,
    );
    logger.debug({ dateMatch: dateMatch?.groups }, 'date match');

    if (dateMatch?.groups) {
      // if we already have an interval, this is an "extra" date...
      if (interval) {
        // eslint-disable-next-line no-console
        console.error(
          `ERROR: "${argStr}" date given, but "${interval.start.toISODate()}/${interval.end.toISODate()}" is already the interval.`,
        );
        process.exit(1);
      }

      // *now* we can let Luxon simply parse the DateTime, allowing its default
      // of picking the beginning of the month/year
      const date = DateTime.fromISO(argStr, { zone: 'utc' }).startOf('day');

      // this is either the start date, or the end date, depending on what we've
      // seen
      if (!start) {
        start = date;
        if (dateMatch.groups.day) {
          startUnit = 'day';
        } else if (dateMatch.groups.month) {
          startUnit = 'month';
        } else {
          startUnit = 'year';
        }
      } else {
        let end = date;
        let endUnit;
        if (dateMatch.groups.day) {
          endUnit = 'day';
        } else if (dateMatch.groups.month) {
          endUnit = 'month';
        } else {
          endUnit = 'year';
        }
        // We have a second date!  First, make sure they are in the correct order.
        if (end < start) {
          [start, startUnit, end, endUnit] = [end, endUnit, start, startUnit];
        }

        // For end dates, use the *following* unit.  For example, a start/end of
        // 2019-01 and 2019-02 actually means *inclusive*, and will include the
        // last day of 2019-02.
        end = end.plus({ [endUnit]: 1 });

        interval = Interval.fromDateTimes(start, end);
      }
    }
  });

  // if no start/interval was given...
  if (!interval && !start) {
    // assume we start at the beginning of the previous year
    start = DateTime.utc().minus({ year: 1 }).startOf('year');
    startUnit = 'year';

    if (TEMP_TESTING) {
      // totally bogus for testing...
      start = DateTime.fromISO('2018-01-19', { zone: 'utc' });
      startUnit = 'day';
    }
  }

  if (!interval) {
    interval = Interval.after(start, { [startUnit]: 1 });
  }

  logger.debug(
    {
      from: interval.start.toISODate(),
      to: interval.end.toISODate(),
      days: interval.length('days'),
    },
    'using interval',
  );

  const { mapWithProgress, awaitingMapWithProgress } = progressFactory(
    opts.progress,
  );

  if (!TEMP_TESTING) {
    // eslint-disable-next-line no-console
    console.log(`verifying cache "${cacheDir}"...`);
    const { items, seconds } = await verifyCache(cacheDir, logger);
    // eslint-disable-next-line no-console
    console.log(
      `verified cache "${cacheDir}": ${items} items in ${seconds} seconds`,
    );
    // logger.info({ cacheDir, items, seconds }, 'verified cache');
  }

  // eslint-disable-next-line no-console
  console.log(
    `Slurping ${breed} specialty results starting from ${interval.start.toISODate()}, for ${humanizeDuration(
      interval.toDuration(),
    )}.`,
  );

  // Instead of a for-loop, adding a day at time, it's cleaner to split the
  // interval into days and then we can perform "mapping" logic...
  const days = interval.splitBy(Duration.fromISO('P1D')).map((i) => i.start);
  // logger.debug({ days }, 'days?');

  const datePages = (
    await awaitingMapWithProgress('get days', days, (date) =>
      fetchDatePage(date, breed, cacheDir, logger),
    )
  ).filter(exists);
  logger.trace(
    {
      results: datePages.map(({ metadata, page }) => ({
        excerpt: excerpt(page),
        length: page.length,
        metadata,
      })),
    },
    'date pages',
  );

  const eventLinks = mapWithProgress(
    'parse days',
    datePages,
    ({ page, metadata }) => parseDatePage(page, metadata, logger),
  ).flat();

  // TODO: dedupe event pages?  multi-day events will have a link from each day.

  const eventPages = (
    await awaitingMapWithProgress('get events', eventLinks, (link) =>
      fetchPage(link, cacheDir, logger),
    )
  ).filter(exists);
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

  const resultLinks = mapWithProgress(
    'parse events',
    eventPages,
    ({ page /* , metadata */ }) => parseEventPage(page, logger),
  ).flat();

  const resultPages = (
    await awaitingMapWithProgress('get results', resultLinks, (link) =>
      fetchPage(link, cacheDir, logger),
    )
  ).filter(exists);
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

  const finalData = mapWithProgress(
    'parse results',
    resultPages,
    ({ page /* , metadata */ }) => parseResultPage(page, logger),
  );

  const csv = generateReport(finalData, opts.formatPublishing);

  if (opts.output) {
    await writeFile(opts.output, csv);
  } else {
    // eslint-disable-next-line no-console
    console.log(csv);
  }
}
