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
    logger.debug('requesting info for %d %s...', steps.length, label);
    if (program.progress) {
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


function createRange() {
    var range = [];
    var start = moment('2015-01-01');
    var end = moment('2015-12-31');

    var cur = moment(start);
    while (cur <= end) {
        // logger.debug(cur.format());
        range.push(cur.clone());
        cur.add(1, 'days');
    }

    return Promise.resolve(range);
}

function getAndParseDay(date) {
    return client.getDayEvents(date)
        .then(parser.parseDayEvents)
        .tap(progressTick);
}

function getAndParseEvent(link) {
    return client.makeAkcRequest(link)
        .then(parser.parseEvent)
        .tap(progressTick);
}

function getAndParseBreed(link) {
    return client.makeAkcRequest(link)
        .then(parser.parseBreed)
        .tap(progressTick);
}

function requireNonZero(name, data) {
    if (data.length === 0) {
        throw new Error(_.sprintf('No data for %s.', name));
    }

    return data;
}


createRange()
    // .tap(logger.debugArg)
    .then(_.partial(requireNonZero, 'days'))
    .tap(_.partial(createProgress, 'days'))
    .map(getAndParseDay, { concurrency: 10 })
    .tap(completeProgress)
    // .tap(logger.debugArg)
    .then(_.flatten)
    // .tap(logger.debugArg)
    .then(_.partial(requireNonZero, 'events'))
    .tap(_.partial(createProgress, 'events'))
    .map(getAndParseEvent, { concurrency: 10 })
    .tap(completeProgress)
    // .tap(logger.debugArg)
    .then(_.flatten)
    // .tap(logger.debugArg)
    .then(_.partial(requireNonZero, 'breeds'))
    .tap(_.partial(createProgress, 'breeds'))
    .map(getAndParseBreed, { concurrency: 10 })
    .tap(completeProgress)
    // .tap(logger.debugArg)
    .tap(reportDone)
    .catch(function (error) {
        logger.error(error);
    });
