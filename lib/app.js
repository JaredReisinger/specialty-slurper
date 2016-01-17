'use strict';

var _ = require('underscore');
_.mixin(require('underscore.string').exports());

var Promise = require('bluebird');
// var moment = require('moment');
var logger = require('./log').getLogger();
var program = require('commander');
var pkginfo = require('../package.json');
var chalk = require('chalk');
var ProgressBar = require('progress');

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

function createProgress(stepCount) {
    if (program.progress) {
        bar = new ProgressBar(chalk.white('  fetching... [:bar] :percent complete, :etas remaining'), {
            total: stepCount,
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

function debugArg(arg) {
    logger.debug(arg);
}

function debugHelper(message) {
    return function() {
        logger.debug(message);
    };
}

// TODO: kick off promise chain!
Promise.resolve(1) // temporary stepCount!
    .tap(createProgress)
    .tap(completeProgress)
    .tap(reportDone)
    .catch(function (error) {
        logger.error(error);
    });
