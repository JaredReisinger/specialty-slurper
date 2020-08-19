export function identity(x) {
  return x;
}

export function exists(x) {
  return !!x;
}

// a bluebird.mapSeries equivalent, without bringing in bluebird...
export async function awaitingMap(iterable, fn) {
  // iterable might be a promise itself... this is arguably the wrong place to
  // put the await, but bluebird did it this way.  Now that 'await' is easy,
  // you could just call 'mapSeries(await iterable, fn)'.
  // const arr = await iterable;
  const arr = iterable;

  const result = [];
  // now run the mapping fn on each item, but wait for completion...
  const count = arr.length;
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    result.push(await fn(arr[i], i, count));
  }

  return result;
}

export function mapObject(obj, valueFn, keyFn = identity) {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value], i) => [
      keyFn(key, value, i),
      valueFn(value, key, i),
    ]),
  );
}
