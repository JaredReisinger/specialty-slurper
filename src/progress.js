import ProgressBar from 'progress';

import { awaitingMap } from './util.js';

const defaultLabelWidth = 15;

export default function progressFactory(showProgress) {
  const creatorFn = showProgress ? createProgress : createMockProgress;
  return {
    createProgress: creatorFn,
    mapWithProgress: mapWithProgress.bind(null, creatorFn),
    awaitingMapWithProgress: awaitingMapWithProgress.bind(null, creatorFn),
  };
}

// We use the createProgress, map (tick), update(1) sequence so often that we
// wrap that into a single helper.
function mapWithProgress(creatorFn, label, arr, mapFn) {
  const bar = creatorFn(label, arr.length);
  const result = arr.map((input) => {
    const output = mapFn(input);
    bar.tick();
    return output;
  });
  bar.update(1);
  return result;
}

async function awaitingMapWithProgress(creatorFn, label, arr, mapFn) {
  const bar = creatorFn(label, arr.length);
  const result = await awaitingMap(arr, async (input) => {
    const output = await mapFn(input);
    bar.tick();
    return output;
  });
  bar.update(1);
  return result;
}

function createProgress(label, steps) {
  // Do our best to ensure the progress lines fits on one line. To get the bar
  // width, we subtract from the overall width using a representative string
  // (instead of hand-counting...)
  const paddedLabel =
    label.length >= defaultLabelWidth
      ? label
      : `${label}${' '.repeat(defaultLabelWidth - label.length)}`;

  const format = `${paddedLabel} [:bar] :percent complete, :etas remaining`;

  // It turns out that the difference between ':bar:percent:eta' and '1009999.9'
  // is pretty minimal (7 characters), we just use the format as the
  // representative string, and add 5 for the width.
  const barWidth = windowWidth() - format.length + 5;

  return new ProgressBar(format, { total: steps, width: barWidth });
}

const mockProgress = {
  tick: () => {},
  update: () => {},
};

function createMockProgress() {
  return mockProgress;
}

function windowWidth() {
  return (
    (typeof process === 'object' && process.stdout && process.stdout.columns) ||
    80
  );
}
