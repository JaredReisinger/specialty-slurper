'use strict';

const _ = require('underscore');
_.mixin(require('underscore.string').exports());
_.join = require('underscore.string').join;

const url = require('url');

const Promise = require('bluebird');
const moment = require('moment');
const htmlparser = require('htmlparser2');
const select = require('css-select');

const logger = require('./log').getLogger('akc-parser');

logger.debug('creating dom finders...');

// On a "events on day X" page, find the links for each individual event.
const dayEventSelector = select.compile('div.calendar-list-item__info-title > a');

// On a "event results" page (linked from the previous), find the text that indicates whether this is a specialy, and if so, what breed.
const eventSpecialtySelector = select.compile('div.item-detail__event-misc-title')

const breedTableSelector = select.compile('table');
const breedSelector = select.compile('td[colspan="4"] strong a strong');

const hostSelector = select.compile('td[colspan="8"] > div[align="center"] > font > font > b');
const dateSelector = select.compile('td[colspan="8"] > div[align="center"] + font > center');
const locationSelector = select.compile('td[colspan="8"] > div[align="center"] + font > center + font > font > center');

const judgeSelector = select.compile('td[colspan="4"] + td a.white');
const entriesSelector = select.compile('td[colspan="4"] + td + td[colspan="2"] font');

const sectionSelector = select.compile('td[colspan="5"]:nth-of-type(2)');
const placementSelector = select.compile('td[align="right"]:nth-of-type(4)');
const classSelector = select.compile('td[colspan="5"]:nth-of-type(3)');

function parseDayEvents(date, body) {
    const formattedDate = date.format('YYYY-MM-DD');

    var offset = body.indexOf('<!DOCTYPE ');
    if (offset > 0) {
        var old = body;
        body = body.substring(offset);
        // logger.debug('body was length %d, now %d', old.length, body.length);
    }

    return parseHtml(body)
        // .tap(logger.inspect)
        .then(function(dom) {
            // logger.debug('finding events on %s...', formattedDate);
            var events = select(dayEventSelector, dom);
            var clubs = _.map(events, function(evt) {
                return text(evt);
            });
            // logger.debug('found %d events on %s: %s', events.length, formattedDate, _.join(', ', clubs));
            return _.map(events, function(evt) {
                var link = htmlparser.DomUtils.getAttributeValue(evt, 'href')
                // logger.debug('link: %s', link);
                return link;
            });
        });
}


function parseEvent(eventLink, body) {
    // logger.debug('parsing %s...', eventLink);

    // Event pages have *two* <html> tags... we need the second one.
    // logger.debug('original body length: %d', body.length);
    var offset = body.lastIndexOf('<html>');
    if (offset >= 0) {
        // logger.debug('found last <html> tag...');
        var old = body;
        body = body.substring(offset);
        // logger.debug('body was length %d, now %d', old.length, body.length);
    }

    return parseHtml(body)
        .then(function(dom) {
            // logger.inspect(dom);
            var events = select(eventSpecialtySelector, dom);
            // logger.debug('found %d events...', events.length);
            var links = [];
            _.each(events, function(evt) {
                var eventType = text(evt);
                // logger.debug('  - "%s"', eventType);
                if (_.startsWith(eventType, 'Specialty') || _.startsWith(eventType, 'Parent Specialty')) {
                    // logger.debug('checking "%s" for breed...', eventType);
                    // logger.inspect(evt);
                    var breed = eventType.substring(eventType.indexOf('Specialty ') + 10);
                    // logger.debug('breed: "%s"', breed);
                    // TODO: only match "Basenji"!  For now, use any for parsing...
                    if (breed === 'Basenji') {
                        // logger.debug('looking for breed links...');
                        var eventParent = htmlparser.DomUtils.getParent(evt);

                        // For an all-breed show, the next level down is
                        // "groups" (like "The Hound Group", "The Toy Group",
                        // etc), from which we can find the "breed" links.  In a
                        // Specialty, however, we just find the breed links
                        // directly.
                        //
                        // We call these "breeds" here (for lack of a better
                        // name), if we need to distinguish actual groups--which
                        // we can from the name ending in "Group"!--we can add
                        // that later.
                        var breedTable = select.selectOne(breedTableSelector, eventParent);
                        // logger.debug('found %s breed table...', !!breedTable ? 'a' : 'NO');

                        if (breedTable) {
                            // logger.debug('found table...');
                            var breeds = select(breedSelector, breedTable);
                            // logger.debug('found %d breeds...', breeds.length);
                            _.each(breeds, function(cls) {
                                // logger.debug('breed: "%s"', text(cls));
                                var breedAnchor = htmlparser.DomUtils.getParent(cls);
                                var scriptLink = htmlparser.DomUtils.getAttributeValue(breedAnchor, 'href');
                                var linkOffset = scriptLink.indexOf('openWin(\'');
                                if (linkOffset >= 0) {
                                    linkOffset += 9;
                                    var linkEnd = scriptLink.indexOf('\'', linkOffset);
                                    var link = scriptLink.substring(linkOffset, linkEnd);
                                    // HACK! Rather than proper relative URL resolving, just
                                    // "know" that it's an AKC link...
                                    link = url.resolve('https://www.apps.akc.org/', link);
                                    // logger.debug('breed link: "%s"', link);
                                    links.push(link);
                                }
                            });
                        }
                    }
                } else {
                    // logger.debug('ignoring "%s"', eventType)
                }
            });

            return links;
        });
}

function parseBreed(body) {
    // logger.debug('parsing breed results...');
    return parseHtml(body)
        .then(function(dom) {
            var breedResults = {};

            var host = text(select.selectOne(hostSelector, dom));
            var date = _.trim(text(select.selectOne(dateSelector, dom)), '- ');
            var location = text(select.selectOne(locationSelector, dom));
            var judge = text(select.selectOne(judgeSelector, dom));
            var entries = text(select.selectOne(entriesSelector, dom));

            breedResults.host = host;
            breedResults.date = date;
            breedResults.location = location;
            breedResults.judge = judge;
            breedResults.entries = entries;

            // Collect the sections, classes and placements, and reconstruct
            // the tree.  Winner placements are direct children of the
            // "Breed Winners" section without an intervening class.  We can
            // distinguish them because they don't parse as ints!
            var eventData = [];

            var selectors = [{
                meta: 'section',
                selector: sectionSelector,
            },{
                meta: 'class',
                selector: classSelector,
            },{
                meta: 'placement',
                selector: placementSelector,
            }];

            _.each(selectors, function(selector) {
                _.each(select(selector.selector, dom), function(item) {
                    if (!_.isEmpty(text(item))) {
                        item.eventMeta = selector.meta;
                        eventData.push(item);
                    }
                });
            });

            // logger.debug('found %d event data...', eventData.length);

            eventData = htmlparser.DomUtils.uniqueSort(eventData);
            var curSection = breedResults;
            var curClass = breedResults;
            _.each(eventData, function(item) {
                // logger.debug('item: %s "%s"', item.eventMeta, text(item));
                switch (item.eventMeta) {
                    case 'section':
                        breedResults.sections = breedResults.sections || [];
                        breedResults.sections.push({
                            section: text(item),
                        });
                        curSection = _.last(breedResults.sections);
                        curClass = curSection;
                        break;
                    case 'class':
                        curSection.classes = curSection.classes || [];
                        curSection.classes.push({
                            class: text(item),
                        });
                        curClass = _.last(curSection.classes);
                        break;
                    case 'placement':
                        curClass.placements = curClass.placements || [];
                        // figure out the dog name (following TD)
                        var nameEl = findFollowing(item, function(node) {
                            return node.type === 'tag' &&
                                node.name === 'td';
                        });
                        var nameLink = select.selectOne('a', nameEl);
                        var owner = text(nameLink.next);
                        owner = owner.substring(owner.indexOf('&nbsp;') + 6);
                        curClass.placements.push({
                            placement: text(item),
                            name: text(nameLink),
                            owner: owner,
                        });
                        break;
                }
            });

            // The last section may have neither classes nor placements... if
            // so, delete it...
            if (!curSection.classes && !curSection.placements) {
                breedResults.sections.pop();
            }

            // logger.inspect(breedResults, { depth: 10 });
            return breedResults;
        });
}


function findFollowing(el, predicate) {
    var cur = el.next;
    while (cur && !predicate(cur)) {
        cur = cur.next;
    }
    return cur;
}

function parseHtml(html) {
    // logger.debug('parsing HTML...');
    return Promise.resolve(htmlparser.parseDOM(html, {
        recognizeSelfClosing: true,
        // decodeEntities: true,
    }));
}


function text(els) {
    return els && _.clean(htmlparser.DomUtils.getText(els));
}


module.exports = {
    parseDayEvents: parseDayEvents,
    parseEvent: parseEvent,
    parseBreed: parseBreed,
};
