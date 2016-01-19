'use strict';

var _ = require('underscore');
_.mixin(require('underscore.string').exports());

var Promise = require('bluebird');

var path = require('path');
var url = require('url');
var moment = require('moment');

var logger = require('./log').getLogger('akc-client');

var request = require('./request');


function getDayEvents(date) {
    return makeAkcRequest(buildDayEventsUrl(date));
}


function makeAkcRequest(akcUrl) {
    return request({
        uri: akcUrl,
        // headers: {
        //     'accept-encoding': '',
        // }
    })
    .spread(function (response, body) {
        // logger.debug('status: %d', response.statusCode);
        // logger.inspect(response.headers);
        // logger.debug('body length: %d', body.length);
        // logger.debug('body: %s', body);
        if (response.statusCode === 200) {
            return body.toString();
        }

        throw new Error(_.sprintf('HTTP ERROR %d', response.statusCode));
    });
}

function buildDayEventsUrl(date) {
    var urlStr = url.format({
        protocol: 'https',
        slashes: true,
        hostname: 'www.apps.akc.org',
        pathname: '/apps/event_calendar/index_mobi1.cfm',
        query: {
            action: 'day',
            state: 'All',
            event_grouping: 'S',
            year: date.year(),
            month: date.month() + 1,
            day: date.date(),
        },
    });

    // logger.debug('formatted event day url: %s', urlStr);
    return urlStr;
}

module.exports = {
    getDayEvents: getDayEvents,
    makeAkcRequest: makeAkcRequest,
};
