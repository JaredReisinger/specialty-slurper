'use strict';

var _ = require('underscore');
_.mixin(require('underscore.string').exports());

var url = require('url');

var Promise = require('bluebird');
var moment = require('moment');
var htmlparser = require('htmlparser2');
var select = require('css-select');

var logger = require('./log').getLogger('akc-parser');

logger.debug('creating dom finders...');

// The event search returns very poorly formatted HTML.  The best we can do is
// to recognize the *formatting* on the containing link.  (Yuck!)
var dayEventSelector = select.compile('a[style="font-weight: bold; font-size: 13px; font-family: Arial, Helvetica, sans-serif; background-color: #F7F0EA;"]');

var eventSpecialtySelector = select.compile('b > font[size="+1"]')

var classTableSelector = select.compile('table[border="0"]');
var classSelector = select.compile('td[colspan="4"] a.white');

function parseDayEvents(body) {
    var offset = body.indexOf('<!DOCTYPE ');
    if (offset > 0) {
        var old = body;
        body = body.substring(offset);
        // logger.debug('body was length %d, now %d', old.length, body.length);
    }

    return parseHtml(body)
        // .tap(logger.inspect)
        .then(function(dom) {
            // logger.debug('finding events...');
            var events = select(dayEventSelector, dom);
            // logger.debug('found %d events...', events.length);
            return _.map(events, function(evt) {
                var link = htmlparser.DomUtils.getAttributeValue(evt, 'href')
                // logger.debug('link: %s', link);
                return link;
            });
        });
}


function parseEvent(body) {
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
                // logger.debug('  - "%s"', text(evt));
                var eventType = text(evt);
                if (eventType === 'Specialty') {
                    // logger.debug('checking "%s" for breed...', eventType);
                    // logger.inspect(evt);
                    var eventParent = htmlparser.DomUtils.getParent(evt);
                    var breed = text(eventParent.next);
                    // logger.debug('breed: "%s"', breed);
                    // TODO: only match "Basenji"!  For now, use any for parsing...
                    if (breed.indexOf('Basenji') >= 0 /*|| true*/) {
                        // logger.debug('looking for class links...');
                        // all results are in the following table (inside a sibling
                        // font tag), which ends before the next event...
                        var fontParent = eventParent;
                        while (fontParent) {
                            if (fontParent.type === 'tag' &&
                                fontParent.name === 'font' &&
                                htmlparser.DomUtils.getAttributeValue(fontParent, 'face') === 'arial,sans-serif' &&
                                htmlparser.DomUtils.getAttributeValue(fontParent, 'size') === '-1') {
                                    // logger.debug('found font tag!');
                                    // logger.inspect(fontParent);
                                    break;
                                }
                                fontParent = fontParent.next;
                        }

                        var classTable;
                        if (fontParent) {
                            classTable = select.selectOne(classTableSelector, fontParent);
                        }

                        if (classTable) {
                            // logger.debug('found table...');
                            var classes = select(classSelector, classTable);
                            // logger.debug('found %d classes...', classes.length);
                            _.each(classes, function(cls) {
                                // logger.debug('class: "%s"', text(cls));
                                var scriptLink = htmlparser.DomUtils.getAttributeValue(cls, 'href');
                                var linkOffset = scriptLink.indexOf('openWin(\'');
                                if (linkOffset >= 0) {
                                    linkOffset += 9;
                                    var linkEnd = scriptLink.indexOf('\'', linkOffset);
                                    var link = scriptLink.substring(linkOffset, linkEnd);
                                    // HACK! Rather than proper relative URL resolving, just
                                    // "know" that it's an AKC link...
                                    link = url.resolve('https://www.apps.akc.org/', link);
                                    // logger.debug('class link: "%s"', link);
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

function parseHtml(html) {
    // logger.debug('parsing HTML...');
    return Promise.resolve(htmlparser.parseDOM(html, {
        recognizeSelfClosing: true,
        // decodeEntities: true,
    }));
}


// function traceEls(els) {
//     return _.map(els, _.partial(_.pick, _, 'type', 'name', 'attribs'));
// }
//
//
function text(els) {
    return _.clean(htmlparser.DomUtils.getText(els));
}


module.exports = {
    parseDayEvents: parseDayEvents,
    parseEvent: parseEvent,
};
