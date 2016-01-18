'use strict';

var _ = require('underscore');
_.mixin(require('underscore.string').exports());

var Promise = require('bluebird');
var moment = require('moment');
var htmlparser = require('htmlparser2');
var select = require('css-select');

var logger = require('./log').getLogger('akc-parser');

logger.debug('creating dom finders...');

// The event search returns very poorly formatted HTML.  The best we can do is
// to recognize the *formatting* on the containing link.  (Yuck!)
var eventSelector = select.compile('a[style="font-weight: bold; font-size: 13px; font-family: Arial, Helvetica, sans-serif; background-color: #F7F0EA;"]');

function parseDayEvents(body) {
    return parseHtml(body)
        // .tap(logger.inspect)
        .then(function(dom) {
            // logger.debug('finding events...');
            var events = select(eventSelector, dom);
            // logger.debug('found %d events...', events.length);
            return _.map(events, function(evt) {
                var link = htmlparser.DomUtils.getAttributeValue(evt, 'href')
                // logger.debug('link: %s', link);
                return link;
            });
        });
}


function parseHtml(html) {
    // logger.debug('parsing HTML...');
    var offset = html.indexOf('<!DOCTYPE ');
    if (offset > 0) {
        var old = html;
        html = html.substring(offset);
        // logger.debug('html was length %d, now %d', old.length, html.length);
    }

    return Promise.resolve(htmlparser.parseDOM(html, {
        recognizeSelfClosing: true,
        decodeEntities: true,
    }));
}


// function traceEls(els) {
//     return _.map(els, _.partial(_.pick, _, 'type', 'name', 'attribs'));
// }
//
//
// function text(els) {
//     return _.clean(htmlparser.DomUtils.getText(els));
// }


module.exports = {
    parseDayEvents: parseDayEvents,
};
