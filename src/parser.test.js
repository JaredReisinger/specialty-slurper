import test from 'ava';
import * as td from 'testdouble';
// import luxon from 'luxon';

import createLogger from './logger.js';

import {
  extractDatePage,
  extractEventPage,
  parseDatePage,
  parseEventPage,
  buildResultsFromKinds,
} from './parser.js';

// const { DateTime } = luxon;
// const date = DateTime.fromISO('2020-01-01', { zone: 'utc' });

const mockLogger = td.object(createLogger());

test('extractDatePage() - returns second <!doctype>', (t) => {
  const actual = extractDatePage(
    `<!doctype html>
    a
    <!doctype html>
    b
  `,
    mockLogger,
  );

  t.is(
    actual,
    `<!doctype html>
    b
  `,
  );
});

test('extractDatePage() - ignores <!doctype> in apparent script', (t) => {
  const actual = extractDatePage(
    `<!doctype html>
    a
    <script>
      document.write("<!doctype html>");
    </script>
    <!doctype html>
    b
  `,
    mockLogger,
  );

  t.is(
    actual,
    `<!doctype html>
    b
  `,
  );
});

test('extractDatePage() - falls back to first <!doctype>', (t) => {
  const actual = extractDatePage(
    `x
    <!doctype html>
    a
  `,
    mockLogger,
  );

  t.is(
    actual,
    `<!doctype html>
    a
  `,
  );
});

test('extractDatePage() - falls all the way back to beginning', (t) => {
  const actual = extractDatePage('x', mockLogger);
  t.is(actual, 'x');
});

test('extractDatePage() - stops at second <head>', (t) => {
  const actual = extractDatePage(
    `a
    <head>
    b
    <head>
    c
  `,
    mockLogger,
  );

  t.is(
    actual,
    `a
    <head>
    b
    `,
  );
});

test('extractEventPage() - returns second <html>', (t) => {
  const actual = extractEventPage(
    `<html>
    a
    <html>
    b
  `,
    mockLogger,
  );

  t.is(
    actual,
    `<html>
    b
  `,
  );
});

test('extractEventPage() - ignores <html> in apparent script', (t) => {
  const actual = extractEventPage(
    `<html>
    a
    <script>
      document.write("<html>");
    </script>
    <html>
    b
  `,
    mockLogger,
  );

  t.is(
    actual,
    `<html>
    b
  `,
  );
});

test('extractEventPage() - falls back to first <html>', (t) => {
  const actual = extractEventPage(
    `x
    <html>
    a
  `,
    mockLogger,
  );

  t.is(
    actual,
    `<html>
    a
  `,
  );
});

test('extractEventPage() - falls all the way back to beginning', (t) => {
  const actual = extractEventPage('x', mockLogger);
  t.is(actual, 'x');
});

test('parseDatePage() - gets all event links', (t) => {
  const actual = parseDatePage(
    `
      <div class="calendar-list-item__info-title">
        <a href="link1">title 1</a>
      </div>
      <div class="calendar-list-item__info-title">
        <a href="link2">title 2</a>
      </div>
    `,
    {},
    mockLogger,
  );

  t.deepEqual(actual, ['link1', 'link2']);
});

const eventPage = `
  <div class="item-detail__event-misc">
    <div class="item-detail__event-misc-title">Specialty Basenji</div>
    <table>
      <tr>
        <td colspan="4"><strong>
          <a href="openWin('link1')"><strong>name 1</strong></a>
        <strong></td>
      </tr>
    </table>
  </div>

  <div class="item-detail__event-misc">
    <div class="item-detail__event-misc-title">Parent Specialty Basenji</div>
    <table>
      <tr>
        <td colspan="4"><strong>
          <a href="openWin('link2')"><strong>name 2</strong></a>
        <strong></td>
      </tr>
    </table>
  </div>
`;

test('parseEventPage() - gets all event links', (t) => {
  const actual = parseEventPage(eventPage, mockLogger);
  t.deepEqual(actual, ['link1', 'link2']);
});

test('parseEventPage() - ignores non-specialty events', (t) => {
  const actual = parseEventPage(
    `${eventPage}
      <div class="item-detail__event-misc">
        <div class="item-detail__event-misc-title">Other Basenji</div>
        <table>
          <tr>
            <td colspan="4"><strong>
              <a href="openWin('link3')"><strong>name 3</strong></a>
            <strong></td>
          </tr>
        </table>
      </div>
    `,
    mockLogger,
  );
  t.deepEqual(actual, ['link1', 'link2']);
});

test('parseEventPage() - ignores other breed specialties', (t) => {
  const actual = parseEventPage(
    `${eventPage}
      <div class="item-detail__event-misc">
        <div class="item-detail__event-misc-title">Specialty OTHERBREED</div>
        <table>
          <tr>
            <td colspan="4"><strong>
              <a href="openWin('link3')"><strong>name 3</strong></a>
            <strong></td>
          </tr>
        </table>
      </div>
    `,
    mockLogger,
  );
  t.deepEqual(actual, ['link1', 'link2']);
});

test('buildResultsFromKinds() - empty kinds yields no sections', (t) => {
  const actual = buildResultsFromKinds([], mockLogger);
  t.deepEqual(actual, { sections: [] });
});

test('buildResultsFromKinds() - simple data', (t) => {
  const actual = buildResultsFromKinds(
    [
      { kind: 'section', text: 'section 1' },
      { kind: 'class', text: 'class 1' },
      { kind: 'placement', text: 'winner' },
      { kind: 'owners', text: 'dogname &nbsp;owners names' },
      { kind: 'dog', text: 'dogname' },
    ],
    mockLogger,
  );
  t.deepEqual(actual, {
    sections: [
      {
        section: 'section 1',
        classes: [
          {
            class: 'class 1',
            placements: [
              {
                placement: 'winner',
                abbrev: undefined,
                dog: 'dogname',
                owners: 'owners names',
                sex: undefined,
              },
            ],
          },
        ],
      },
    ],
  });
});

test('buildResultsFromKinds() - bogus class lines are skipped', (t) => {
  const actual = buildResultsFromKinds(
    [
      { kind: 'class', text: 'class 1' },
      { kind: 'class', text: '' },
      { kind: 'class', text: 'class 2' },
    ],
    mockLogger,
  );
  t.deepEqual(actual, {
    sections: [],
    classes: [{ class: 'class 1' }, { class: 'class 2' }],
  });
});

test('buildResultsFromKinds() - performs magic abbreviation logic', (t) => {
  const actual = buildResultsFromKinds(
    [
      { kind: 'section', text: 'section 1' },
      { kind: 'placement', text: 'Select Dog' },
      { kind: 'owners', text: 'dogname &nbsp;owners names' },
      { kind: 'dog', text: 'dogname' },
      { kind: 'class', text: 'class 1' },
      { kind: 'placement', text: '1' },
      { kind: 'owners', text: 'dogname &nbsp;owners names' },
      { kind: 'dog', text: 'dogname' },
    ],
    mockLogger,
  );
  t.deepEqual(actual, {
    sections: [
      {
        section: 'section 1',
        placements: [
          {
            placement: 'Select Dog',
            abbrev: 'SD',
            dog: 'dogname',
            owners: 'owners names',
            sex: undefined,
          },
        ],
        classes: [
          {
            class: 'class 1',
            placements: [
              {
                placement: '1/SD',
                abbrev: undefined,
                dog: 'dogname',
                owners: 'owners names',
                sex: undefined,
              },
            ],
          },
        ],
      },
    ],
  });
});
