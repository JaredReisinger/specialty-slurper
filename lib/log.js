'use strict';

var _ = require('underscore');
var util = require('util');

// Use log4js under the covers.
var log4js = require('log4js');

log4js.configure({
    appenders: [{
        type: 'console',
    }],
});

// Wrap getLogger to add some helper functions
var getLoggerInner = log4js.getLogger;

function getLoggerWrapper(args) {
    var logger = getLoggerInner.apply(this, arguments);
    // pre-bind to the logger object
    logger.debugArg = _.bind(debugArg, logger);
    logger.inspect = _.bind(inspect, logger);
    return logger;
}

function debugArg(arg) {
    this.debug(arg);
}

function inspect(arg) {
    this.debug(util.inspect(arg, { colors: true }));
}

module.exports = log4js;
module.exports.getLogger = getLoggerWrapper;
