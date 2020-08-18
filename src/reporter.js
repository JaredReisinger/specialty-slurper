import json2csv from 'json2csv';

// eslint-disable-next-line import/prefer-default-export
export function reportResults(results, formatPublishing) {
  // console.log(
  //   csvLine('Event', 'Section', 'Class', 'Placement', 'Name', 'Owner'),
  // );

  // every result becomes a series of lines...
  const lines = results.flatMap((result) =>
    linesFromResult(result, formatPublishing),
  );

  const csv = json2csv.parse(lines);
  // eslint-disable-next-line no-console
  console.log(csv);

  // console.log(resultLineSets.join('\n'));
}

// TODO: make the "publishing" format and default format a more configurable
// thing?
function linesFromResult(result, formatPublishing) {
  // every result starts with a separator line
  const sep = '-'.repeat(10);
  const sepLine = { Event: sep, Section: sep, Class: sep, Placement: sep };
  if (formatPublishing) {
    sepLine['Name, Owner'] = sep;
  } else {
    sepLine.Name = sep;
    sepLine.Owner = sep;
  }

  const lines = [sepLine];

  // The event information all lives in the "Event" column
  lines.push(
    { Event: result.host },
    { Event: `Judge: ${result.judge}` },
    { Event: result.location },
    { Event: result.date },
  );

  lines.push(
    ...result.sections.flatMap((section, i) =>
      linesFromSection(
        section,
        i === 0 ? result.entries : null,
        formatPublishing,
      ),
    ),
  );

  return lines;
}

function linesFromSection(section, entries, formatPublishing) {
  // include the "entries" when provided
  const sectionName = entries
    ? `${section.section} ${entries}`
    : section.section;
  const lines = [
    { Section: formatPublishing ? sectionName.toUpperCase() : sectionName },
  ];

  // special case... the "Breed Winners" section has no sub-classes, only
  // placements, so we check for existence first...
  if (section.classes) {
    lines.push(
      ...section.classes.flatMap((classInfo) =>
        linesFromClass(classInfo, formatPublishing),
      ),
    );
  }

  if (section.placements) {
    lines.push(
      ...section.placements.flatMap((placement) =>
        linesFromPlacement(placement, formatPublishing),
      ),
    );
  }

  return lines;
}

function linesFromClass(classInfo, formatPublishing) {
  const lines = [{ Class: classInfo.class }];

  lines.push(
    ...classInfo.placements.flatMap((placement) =>
      linesFromPlacement(placement, formatPublishing),
    ),
  );

  return lines;
}

function linesFromPlacement(placement, formatPublishing) {
  const line = { Placement: placement.placement };
  if (formatPublishing) {
    line['Name, Owner'] = `${placement.dog.toUpperCase()}, ${placement.owners}`;
  } else {
    line.Name = placement.dog;
    line.Owner = placement.owners;
  }

  return [line];
}

// // minimal CSV formatting
// function csvLine(...args) {
//   return args.map((arg) => `"${arg ? arg.replace(/"/g, '""') : ''}"`).join(',');
// }
