// A wrapper around cached-request and throttled-request so that it looks just
// like the common 'request' module to consumers.  They shouldn't have to know
// to set the cache directory or the ttl.
'use strict';

const _ = require('underscore');
const util = require('util');
const path = require('path');
const moment = require('moment');
const logger = require('./log').getLogger('request');
const Promise = require('bluebird');
const request = require('request');

// add debugging....
// require('request-debug')(request);

// TODO: Make the throttleWindow more configurable...
// (probably by fixing cached-request, honestly)
const throttleWindow = 1; // 100;
const cacheDirectory = path.join(__dirname, '../request-cache');
const defaultTtl = 1000 * 60 * 60 * 24 * 30;  // cache for a month by default

const throttledRequest = require('throttled-request')(request).defaults({
    throttleWindow: throttleWindow,
});

const cachedRequest = require('cached-request')(throttledRequest);
cachedRequest.setCacheDirectory(cacheDirectory);

const promisedRequest = Promise.promisify(cachedRequest, { multiArgs: true });

// cached-request doesn't expose `.defaults()`-style extender....
function wrapper(uriOrOptions) {
    if (_.isObject(uriOrOptions)) {
        uriOrOptions = _.defaults(_.clone(uriOrOptions), { ttl: defaultTtl });
    } else {
        // TODO: We *could* detect the string version and also wrap that in the
        // object format so we could get the ttl in... but since this is just a
        // one-off for this project, we don't bother for now.
        logger.error('expected options as object!');
    }

    var options = [uriOrOptions].concat(_.rest(arguments));
    // logger.debug('making request: "%s"', uriOrOptions.uri || uriOrOptions.url);
    var r = promisedRequest.apply(promisedRequest, options);
    return r;
}

// http*://www.apps.akc.org/apps/events/search/index_results.cfm?action=plan&comp_type=S&event_number=2015195302&cde_comp_group=CONF&NEW_END_DATE1=&key_stkhldr_event=&mixed_breed=N&t2b=N&cde_comp_type=S
// https://www.apps.akc.org/apps/events/search/index_results.cfm?action=plan&comp_type=S&event_number=2015195302&cde_comp_group=CONF&NEW_END_DATE1=&key_stkhldr_event=&mixed_breed=N&t2b=N&cde_comp_type=S
module.exports = wrapper;
