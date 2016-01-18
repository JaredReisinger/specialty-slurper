'use strict';

var _ = require('underscore');
_.mixin(require('underscore.string').exports());

var Promise = require('bluebird');
var moment = require('moment');
var logger = require('./log').getLogger('app');
var program = require('commander');
var pkginfo = require('../package.json');
var chalk = require('chalk');
var ProgressBar = require('progress');

var client = require('./akc-client');
var parser = require('./akc-parser');

program
    .version(pkginfo.version)
    // .option('-n, --dry-run', "Show the commands that would be run, but don't execute them.")
    // .option('-c, --color', 'force color output')
    // .option('-C, --no-color', 'prevent color output')
    .option('-P, --no-progress', 'do not show progress bar')
    .parse(process.argv);

var failEarly = false;

// Check params... set "failEarly = true" if there's a problem!

if (failEarly) {
    console.log(chalk.red('Done.'));
    process.exit(-1);
}

logger.debug('starting...');

var bar = null;     // progress bar

function createProgress(label, steps) {
    if (program.progress) {
        // logger.debug('creating %d-step progress bar...', steps.length);
        var barFormat = _.sprintf('%8s [:bar] :percent complete, :etas remaining', label);
        bar = new ProgressBar(chalk.white(barFormat), {
            total: steps.length,
            width: 40,
        });
    }
}

function progressTick() {
    if (program.progress) {
        bar.tick();
    }
}

function completeProgress() {
    if (program.progress) {
        bar.update(1);
    }
}

function reportDone() {
    console.log(chalk.green('Done.'));
}

function debugHelper(message) {
    return function() {
        logger.debug(message);
    };
}

// function getStarted() {
//     var startDate = moment('2015-01-01');
//     return client.getDayEvents(startDate);
// }


function createRange() {
    var range = [];
    range.push(moment('2015-01-01'));
    // range.push(moment('2015-01-02'));
    return Promise.resolve(range);
}

function getAndParseDay(date) {
    return client.getDayEvents(date)
        .then(parser.parseDayEvents)
        .tap(progressTick);
}

function getAndParseEvent(link) {
    // return client.getDayEvents(date)
    //     .then(parser.parseDayEvents)
    return Promise.delay(50)
        .tap(progressTick);
}

createRange()
    // .tap(logger.debugArg)
    .tap(_.partial(createProgress, 'days'))
    // .map(client.getDayEvents, { concurrency: 1 })
    // .map(parser.parseDayEvents)
    .map(getAndParseDay, { concurrency: 1 })
    .tap(completeProgress)
    .then(function(x) {
        return _.flatten(x);
    })
    // .tap(logger.debugArg)
    .tap(_.partial(createProgress, 'events'))
    .map(getAndParseEvent, { concurrency: 1 })
    .tap(completeProgress)
    .tap(reportDone)
    .catch(function (error) {
        logger.error(error);
    });
