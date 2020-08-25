#!/usr/bin/env node

import yargs from 'yargs';
import slurper from './slurper.js';

async function main() {
  yargs
    // .usage('$0 [--format-publishing] --output <file> <breed> [<year>]')
    .options({
      output: {
        alias: 'o',
        describe: 'file to output results into',
        type: 'string',
        group: 'Output:',
      },
      'format-publishing': {
        describe: 'format for publishing (*)',
        type: 'boolean',
        group: 'Output:',
      },
      progress: {
        alias: 'p',
        describe:
          'show progress bar (hide with --progress=false or --no-progress)',
        type: 'boolean',
        default: true,
        group: 'Diagnostics:',
      },
      verbose: {
        alias: 'v',
        describe: 'show debugging output',
        type: 'count',
        group: 'Diagnostics:',
      },
      'log-file': {
        alias: 'l',
        describe: 'path of file for logging',
        type: 'string',
        group: 'Diagnostics:',
      },
    })
    .command(
      '*',
      'fetch specialty information and generate CSV output',
      {},
      slurper,
    )
    // .command('config', 'config things', run)
    // .completion()
    .example([
      [
        '$0 basenji 2020',
        'fetches the information for Basenji specialties in 2020',
      ],
    ])
    // .epilogue('rooty tooty!')
    .parse();
}

// function showExamples() {
//   // console log?
// }

// async function run(args) {
//   // eslint-disable-next-line no-console
//   console.log('**** RUN!', { args });
// }

main();
