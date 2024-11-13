// -----------------------------------------------------------------------------
// unionMapValues

export function unionMapValues<T, S>(map: Map<T, Set<S>>): Set<S> {
  const combined = new Set<S>();
  map.forEach(set => set.forEach(value => combined.add(value)));
  return combined;
}

// -----------------------------------------------------------------------------
// unionSets

function unionSetList<T>(sets: Set<T>[]): Set<T> {
  return sets.reduce((acc, set) => {
    set.forEach(item => acc.add(item));
    return acc;
  }, new Set());
}

export function unionSets<T>(sets: Set<T>[]): Set<T> {
  // Optimization: avoid allocating a new `Set` if possible, especially in the
  // common case of unioning two sets.
  switch (sets.length) {
    case 0:
      return new Set();
    case 1:
      return sets[0];
    case 2:
      if (sets[0] === sets[1]) {
        return sets[0];
      }

      if (sets[0].size === 0) {
        return sets[1];
      }

      if (sets[1].size === 0) {
        return sets[0];
      }

      return unionSetList([sets[0], sets[1]]);
    default:
      return unionSetList(sets);
  }
}
