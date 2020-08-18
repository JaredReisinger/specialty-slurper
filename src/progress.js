import ProgressBar from 'progress';

export default function progressFactory(showProgress) {
  return showProgress ? createProgress : createMockProgress;
}

function createProgress(label, steps) {
  // Do our best to ensure the progress lines fits on one line. To get the bar
  // width, we subtract from the overall width using a representative string
  // (instead of hand-counting...)
  const paddedLabel =
    label.length >= 8 ? label : `${label}${' '.repeat(8 - label.length)}`;

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
