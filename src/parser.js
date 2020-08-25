import cheerio from 'cheerio';
import htmlparser from 'htmlparser2';
// import select from 'css-select';

import { mapObject, identity } from './util.js';

export function parseDatePage(page, metadata, logger) {
  logger.debug({ page: excerpt(page) }, 'parsing date events page');

  const extractedHtml = extractDatePage(page, logger);
  const $ = parseHtml(extractedHtml, logger);

  const eventLinks = $('.calendar-list-item__info-title > a')
    .map((i, a) => $(a).attr('href'))
    .get();

  logger.trace({ eventLinks, linkType: typeof eventLinks }, 'event links');

  return eventLinks;
}

const validSectionTitlePrefixes = ['Specialty', 'Parent Specialty'];

// should this take/pass-along date/breed as well?
export function parseEventPage(page, logger) {
  const extractedHtml = extractEventPage(page, logger);
  const $ = parseHtml(extractedHtml, logger);

  const sections = $('.item-detail__event-misc');
  // Look for "Specialty {breed}" and "Parent Specialty {breed}" sections... If
  // this were the page for an all-breed show, there'd be another level for
  // groups ("The Hound Group", "The Toy Group", etc.)  Since we're looking at a
  // Specialty page, though, we go straight to the per-breed categories.
  return sections
    .map((i, section) => {
      const title = $('.item-detail__event-misc-title', section).text().trim();

      if (
        !validSectionTitlePrefixes.some((prefix) => title.startsWith(prefix))
      ) {
        return null;
      }

      // TODO: use passed breed name?!
      const breed = 'Basenji';
      if (!title.endsWith(breed)) {
        return null;
      }

      // From the section, we crawl into the table to get link to the per-breed
      // results.  This is based entirely on the HTML structure of the page.
      const breedLabel = $('table td[colspan="4"] strong a strong', section);

      // the result page link is the parent (a) element, crammed into a
      // Javascript handler
      const rawHref = breedLabel.parent().attr('href');
      const [, link] = rawHref.match(/openWin\('([^']+)'/);

      logger.trace(
        { label: breedLabel.html(), rawHref, link },
        'breed results',
      );

      return link;
    })
    .get();
}

// The HTML structure of a results page is... surprise, surprise, completly
// messy.  We look for some reliably unique structure to focus in on the parts
// we're looking for.  You'd think from looking at these that, for instance, the
// "td[colspan=8]" would be a common ancestor... and it is, but there are too
// many other unrelated elements that would match.
const resultInfoSelectors = {
  host: 'td[colspan="8"] > div[align="center"] > font > font > b',
  date: 'td[colspan="8"] > div[align="center"] + font > center',
  location:
    'td[colspan="8"] > div[align="center"] + font > center + font > font > center',
  judge: 'td[colspan="4"] + td a.white',
  entries: 'td[colspan="4"] + td + td[colspan="2"] font',
};

// Our data-driven handling of the results needs five pieces of information for
// each kind:
//   * the selector to extract the text from the page
//   * the name of the collection (we could just pluralize the key!)
//   * the parent kind in the hierarchy
//   * children collection pointers to "reset" (optional)
//   * a text normalizer function (optional)
const resultKinds = {
  section: [
    'td[colspan="5"]:nth-of-type(2)',
    'sections',
    null,
    ['class', 'placement'],
  ],
  class: [
    'td[colspan="5"]:nth-of-type(3)',
    'classes',
    'section',
    ['placement'],
    normalizeClass,
  ],
  placement: [
    'td[align="right"]:nth-of-type(4)',
    'placements',
    'class',
    null,
    normalizePlacement,
  ],
  dog: ['td[align="right"]:nth-of-type(4) + td a', null, 'placement'],
  owners: ['td[align="right"]:nth-of-type(4) + td', null, 'placement'],
};

export function parseResultPage(page, logger) {
  const extractedHtml = page; // a valid page!!!
  const $ = parseHtml(extractedHtml, logger);

  const info = mapObject(resultInfoSelectors, (selector) =>
    $(selector).text().trim(),
  );

  logger.trace({ info }, 'parsed basic info');

  // will need some clean up, like trailing ' -' on the date
  if (info.date.endsWith('-')) {
    [, info.date] = info.date.match(/^(.*[^-])\s+-$/);
  }

  // The result sections include sections ("breed winners", "dogs", "bitches"),
  // and under those are classes (like "open", "puppy", for dogs and bitches),
  // and under *those* are placements ("BOB", "BOS", "1", "2"...) which also
  // have a dog and owners.  We extract the entire mess into a flat array and
  // use DomUtils to re-create the original ordering so that we can extract the
  // correct relationship.

  const unsorted = Object.entries(resultKinds).flatMap(([key, [selector]]) =>
    $(selector)
      // .filter((i, el) => $(el).text().trim() !== '')
      .each((i, el) => $(el).data('kind', key))
      .get(),
  );

  // logger.trace(
  //   {
  //     unsorted: unsorted.map((el) => ({
  //       kind: $(el).data('kind'),
  //       text: $(el).text().trim(),
  //     })),
  //   },
  //   'unsorted',
  // );

  const sorted = htmlparser.DomUtils.uniqueSort(unsorted).map((el) => ({
    kind: $(el).data('kind'),
    text: $(el).text().trim(),
  }));

  logger.trace({ sorted }, 'sorted');

  const results = buildResultsFromKinds(sorted, logger);

  return { ...info, ...results };
}

export function buildResultsFromKinds(sortedKindData, logger) {
  // Build up a nested data structure that looks like:
  /*
    {
      sections: [{
        section: "name",
        classes: [{
          class: "name",
          placements: [{
            placement: "name",
            dog: "name",
            owners: "name",
          }]
        }]
      }]
    }
  */

  // Note that a section *may* have placements directly included, if no "class"
  // data intervenes (this happens for the Breed Winners, like BOB, etc.).  We
  // also perform some data normalization here, rather than asking the report
  // renderer to do it.
  const results = sortedKindData.reduce(
    (memo, { kind, text }) => {
      const [
        ,
        collectionName,
        parentKind,
        kindsToReset,
        normalizer = identity,
      ] = resultKinds[kind] ?? [];

      // logger.trace(
      //   {
      //     from: {
      //       kind,
      //       text,
      //       collectionName,
      //       parentKind,
      //       kindsToReset,
      //       normalizer,
      //     },
      //     memo,
      //   },
      //   'reducing...',
      // );

      // There are some edge cases (the "Best of Breed/Variety Competition"
      // section at the end) where there are bogus empty class lines, which we
      // need to ignore.  There are *also* empty placement fields, but we need
      // these to prevent dog/owner clobbering from happening.  We check
      // specifically for "empty class" and bail early here.
      if (kind === 'class' && text === '') {
        return memo;
      }

      const normalized = normalizer(text);
      const item =
        typeof normalized === 'object' ? normalized : { [kind]: normalized };

      const parent = memo.temp.current[parentKind] ?? memo;
      if (collectionName) {
        parent[collectionName] = parent[collectionName] ?? [];
        parent[collectionName].push(item);

        // reset the "current" pointers for the kind (and children) to point to
        // the newly-added item.. this only matters for "collection-level" kinds
        [kind, ...(kindsToReset ?? [])].forEach((k) => {
          memo.temp.current[k] = item;
        });
      } else {
        // if there's no collection name (owner and dog), we need to graft it
        // into the current parent (a.k.a. placement)
        Object.assign(parent, item);

        // horrible, horrible owner/dog parsing... It's unfortunate to shoehorn
        // this logic here, but we need an easy place where we can compare the
        // owner and dog texts.  If we wait until memo is complete, we have to
        // do some tree-climbing.  Here, at least, we can handle it without too
        // much distraction.  So... because of the way that the HTML is structured,
        // the element with the "owner" text actually includes the dog's name,
        // and (sometimes!) a sex indicator ('(D)' or '(B)' for Dog or Bitch).
        if (parent.owners && parent.dog) {
          const stripped = parent.owners.replace(parent.dog, '').trim();
          const match = stripped.match(
            /(?:\((?<sex>.)\))?,?\s*(?:&nbsp;)\s*?(?<owners>.*)/,
          );
          logger.trace(
            { parent, stripped, match, groups: match.groups },
            'cleaning...',
          );
          Object.assign(parent, match.groups);

          // We also take advantage of knowing this happens when the placement
          // information is "complete", and use it to build/modify/use the
          // placement abbreviations ("1/WD/BOW/...").
          const knownAbbrevs = memo.temp.winnerAbbrevs[parent.dog];
          if (parent.abbrev) {
            memo.temp.winnerAbbrevs[parent.dog] = knownAbbrevs
              ? `${parent.abbrev}/${knownAbbrevs}`
              : parent.abbrev;
          } else if (knownAbbrevs) {
            parent.placement = `${parent.placement}/${knownAbbrevs}`;
          }
        }
      }

      // logger.trace(
      //   {
      //     from: { kind, text, collectionName, parentKind, kindsToReset },
      //     memo,
      //   },
      //   'reduced',
      // );

      return memo;
    },
    { sections: [], temp: { current: {}, winnerAbbrevs: {} } },
  );

  // remove the temporary tracking info
  delete results.temp;

  // There is a redundant "Best of Breed/Variety Competition" section that we
  // don't need.  We detect it by looking for a last section with no classes.
  const sectionCount = results.sections.length;
  if (sectionCount > 1 && !results.sections[sectionCount - 1].classes) {
    results.sections.pop();
  }

  logger.trace({ results }, 'extracted results');
  return results;
}

// We also perform some normalizing...

// We "cascade" top placements (breed winners) down into their individual class
// placements, so you'll see things like "1/WD", or "1/WB/BOW/BOB".  We build
// this placement suffix as we go.  We also offer normalizations of some
// placements (like "Best of Breed or Variety" -> "Best of Breed"); these
// totally make sense for some breeds that don't have "varieties", but may not
// make sense for everyone.  (TODO: add a flag to turn this off, or maybe
// "magically" know which breeds need it and which don't?)

// A mapping from the AKC description of top placements to a list of
// the abbreviation and optionally a "clean" (perhaps shortened) name.
const placementInfo = {
  'Best of Breed or Variety': ['BOB', 'Best of Breed'],
  'Best of Opposite Sex': ['BOS'],
  'Select Dog': ['SD'],
  'Select Bitch': ['SB'],
  'Best of Winners': ['BW'], // not BOW?
  'Best Owner-Handled in Breed or Variety': ['BOH', 'Best Owner-Handled'],
  'Winners Dog': ['W'],
  'Reserve Winner Dog': ['RW'],
  'Winners Bitch': ['W'],
  'Reserve Winner Bitch': ['RW'],
};

const classNormalizations = {
  'Open BLK TN WHT': 'Open BLK WHT TN',
};

function normalizePlacement(placement) {
  const [abbrev, normalizedPlacement] = placementInfo[placement] ?? [];
  return {
    placement: normalizedPlacement ?? placement,
    abbrev,
  };
}

function normalizeClass(className) {
  return classNormalizations[className] ?? className;
}

// The AKC pages are horribly formatted, syntactically invalid "mostly HTML"
// messes. (*Two* <!doctype> tags?  Multiple <html> tags?  Really?!)  We do some
// massaging of the page before handing it to a real html parser so that the
// parser doesn't choke.  Event worse is that different kinds of page are
// invalid in different ways, so we have a couple of "pre-parsing" cleaners.

export function extractDatePage(page, logger) {
  // Find the *second* "<!doctype", and only include that part of the document.
  // Everything before that is header! (We use a negative lookbehind for "/' to
  // avoid matching doctype in strings/script.)
  const tags = [...page.matchAll(/(?<!["'])<!doctype /gi)];
  const startIndex = tags[1]?.index ?? tags[0]?.index ?? 0;
  const trimmedStart = page.substring(startIndex);

  // We also have to end early, because the crud at the end royally messes up
  // parsing as well.  The best thing I've found is the *second* <head> after
  // our startIndex.
  const heads = [...trimmedStart.matchAll(/<head>/gi)];
  const endIndex = heads[1]?.index ?? trimmedStart.length;

  const extractedHtml = trimmedStart.substring(0, endIndex);

  logger.trace({ html: excerpt(extractedHtml) }, 'extracted date html');
  return extractedHtml;
}

export function extractEventPage(page, logger) {
  // Find the *second* "<html", and only include that part of the document.
  // Everything before that is header! (We use a negative lookbehind for "/' to
  // avoid matching doctype in strings/script.)
  const tags = [...page.matchAll(/(?<!["'])<html\b/gi)];
  const startIndex = tags[1]?.index ?? tags[0]?.index ?? 0;
  const trimmedStart = page.substring(startIndex);

  const extractedHtml = trimmedStart;

  logger.trace({ html: excerpt(extractedHtml) }, 'extracted event html');
  return extractedHtml;
}

function parseHtml(html, logger) {
  // logger.trace({ html: excerpt(html) }, 'html');
  const dom = htmlparser.parseDOM(html, {
    // we can't use decodeEntities, because it sometimes converts querystring
    // paramter sequences in URLs!  (...123&int_ref=5 => ...123∫ref=5)
    decodeEntities: false,
    normalizeWhitespace: true,
    recognizeSelfClosing: true,
  });

  logger.trace(
    { dom: dom.map(({ type, name }) => ({ type, name })) },
    'parsed DOM',
  );

  const doc = cheerio.load(dom);
  logger.trace({ doc: excerpt(doc.html()) }, 'loaded doc');
  return doc;
}

export function excerpt(text, length = 300) {
  return text
    .substring(0, length * 2)
    .replace(/\s+/g, ' ')
    .substring(0, length);
}
