'use strict';

// Use log4js under the covers.
var log4js = require('log4js');

log4js.configure({
    appenders: [{
        type: 'console',
    }],
});

module.exports = log4js;
