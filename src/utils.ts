// -----------------------------------------------------------------------------
// unionMapValues

export function unionMapValues<T, S>(map: Map<T, Set<S>>): Set<S> {
  const combined = new Set<S>();
  map.forEach(set => set.forEach(value => combined.add(value)));
  return combined;
}

// -----------------------------------------------------------------------------
// unionSets

export function unionSets<T>(sets: Set<T>[]): Set<T> {
  return sets.reduce((acc, set) => {
    set.forEach(item => acc.add(item));
    return acc;
  }, new Set());
}
