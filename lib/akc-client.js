'use strict';

const _ = require('underscore');
const sprintf = require('sprintf-js').sprintf;

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
    var uri = url.resolve('https://www.apps.akc.org/', akcUrl);
    return request({
        uri: uri,
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

        throw new Error(sprintf('HTTP ERROR %d', response.statusCode));
    });
}

// New format as of end-of 2016:
// https://www.apps.akc.org/apps/event_calendar/index.cfm?urlday=2016-01-02&event_type=S&event_states=AL,AK,AZ,AR,CA,CO,CT,DC,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,PR&event_month=Jan&event_year=2016

function buildDayEventsUrl(date) {
    var urlStr = url.format({
        protocol: 'https',
        slashes: true,
        hostname: 'www.apps.akc.org',
        pathname: '/apps/event_calendar/index.cfm',
        query: {
            // action: 'day',
            // state: 'All',
            // event_grouping: 'S',
            // year: date.year(),
            // month: date.month() + 1,
            // day: date.date(),
            urlday: date.format('YYYY-MM-DD'),
            event_type: 'S',
            event_states: 'AL,AK,AZ,AR,CA,CO,CT,DC,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,PR',
            event_month: date.format('MMM'),
            event_year: date.format('YYYY'),
        },
    });

    // logger.debug('formatted event day url: %s', urlStr);
    return urlStr;
}

module.exports = {
    getDayEvents: getDayEvents,
    makeAkcRequest: makeAkcRequest,
};
