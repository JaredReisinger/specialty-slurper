'use strict';

var _ = require('underscore');
_.mixin(require('underscore.string').exports());

var Promise = require('bluebird');
var fs = require('fs');
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
    .option('-o, --output <file>', 'file to output results into')
    .option('--format-publishing', 'format for publishing')
    .option('-P, --no-progress', 'do not show progress bar')
    .parse(process.argv);

var failEarly = false;

// Check params... set "failEarly = true" if there's a problem!
var outfile = null;
if (program.output) {
    outfile = fs.openSync(program.output, 'w');
}

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
    // var start = moment('2015-07-31');
    // var start = moment('2015-05-22');
    // var end = start;

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

function csvLine(args) {
    var formatted = _.map(arguments, function(arg) {
        arg = arg.replace('"', '""');
        return _.sprintf('"%s"', arg);
    });

    var output = formatted.join(',');

    if (outfile) {
        var buffer = new Buffer(output + '\n');
        fs.writeSync(outfile, buffer, 0, buffer.length);
    } else {
        console.log(output);
    }
}

// A mapping from the AKC description of top placements to a list of
// "clean" (perhaps shortened) names and abbreviations.
var placementMap = {
    'Best of Breed or Variety': ['Best of Breed', 'BOB'],
    'Best of Opposite Sex': ['Best of Opposite Sex', 'BOS'],
    'Select Dog': ['Select Dog', 'SD'],
    'Select Bitch': ['Select Bitch', 'SB'],
    'Best of Winners': ['Best of Winners', 'BW'],
    'Best Owner-Handled in Breed or Variety': ['Best Owner-Handled', 'BOH'],
    'Winners Dog': ['Winners Dog', 'W'],
    'Reserve Winner Dog': ['Reserve Winner Dog', 'RW'],
    'Winners Bitch': ['Winners Bitch', 'W'],
    'Reserve Winner Bitch': ['Reserve Winner Bitch', 'RW'],
};

var classMap = {
    'Open BLK TN WHT': 'Open BLK WHT TN'
}


function normalizePlacement(placement, abbrev) {
    var mapping = placementMap[placement];
    return (mapping && mapping[abbrev ? 1 : 0]) || placement;
}

function normalizeClass(cls) {
    var mapping = classMap[cls];
    return mapping || cls;
}


function reportResults(eventsResults) {
    // logger.inspect(eventsResults);

    if (program.formatPublishing) {
        csvLine('Event', 'Section', 'Class', 'Placement','Name, Owner');
    } else {
        csvLine('Event', 'Section', 'Class', 'Placement','Name','Owner');
    }
    _.each(eventsResults, function(eventResults) {
        if (program.formatPublishing) {
            csvLine('----------', '----------', '----------', '----------', '----------');
        } else {
            csvLine('----------', '----------', '----------', '----------', '----------', '----------');
        }
        csvLine(eventResults.host);
        csvLine(_.sprintf('Judge: %s', eventResults.judge));
        csvLine(eventResults.location);
        csvLine(eventResults.date);

        var winnersMap = {}

        _.each(eventResults.sections, function(section, sectionIndex) {

            var sectionName = section.section;

            if (sectionIndex === 0) {
                sectionName = _.sprintf('%s %s', sectionName, eventResults.entries);
            }

            if (program.formatPublishing) {
                sectionName = sectionName.toUpperCase();
            }

            csvLine('', sectionName);

            _.each(section.placements, function(placement) {
                // Funky columns for placements in a section... because these
                // are breed winners, and the placement is a long string!
                var placementName = normalizePlacement(placement.placement);
                var placementAbbrev = normalizePlacement(placement.placement, true);

                // winners placements are best-to-worst, and we want to build up
                // a list of abbreviation (for the classes) in progressive (worst-
                // to-best) order.
                winnersMap[placement.name] = winnersMap[placement.name] || [];
                winnersMap[placement.name].unshift(placementAbbrev);

                if (program.formatPublishing) {
                    csvLine('', '', '', placementName,
                        _.sprintf('%s, %s', placement.name.toUpperCase(), placement.owner));
                } else {
                    csvLine('', '', placementName, '', placement.name, placement.owner);
                }
            });

            _.each(section.classes, function(cls) {
                csvLine('', '', normalizeClass(cls.class));
                _.each(cls.placements, function(placement) {
                    var placementName = normalizePlacement(placement.placement);
                    _.each(winnersMap[placement.name], function(winningAbbrev) {
                        placementName = _.sprintf('%s/%s', placementName, winningAbbrev);
                    });
                    if (program.formatPublishing) {
                        csvLine('', '', '', placementName,
                            _.sprintf('%s, %s', placement.name.toUpperCase(), placement.owner));
                    } else {
                        csvLine('', '', '', placementName, placement.name, placement.owner);
                    }
                });
            });
        });
    });
}


createRange()
    .then(_.partial(requireNonZero, 'days'))
    .tap(_.partial(createProgress, 'days'))
    .map(getAndParseDay, { concurrency: 10 })
    .tap(completeProgress)
    .then(_.flatten)
    .then(_.partial(requireNonZero, 'events'))
    .tap(_.partial(createProgress, 'events'))
    .map(getAndParseEvent, { concurrency: 10 })
    .tap(completeProgress)
    .then(_.flatten)
    .then(_.partial(requireNonZero, 'breeds'))
    .tap(_.partial(createProgress, 'breeds'))
    .map(getAndParseBreed, { concurrency: 10 })
    .tap(completeProgress)
    .then(reportResults)
    .tap(reportDone)
    .catch(function (error) {
        logger.error(error);
    });
