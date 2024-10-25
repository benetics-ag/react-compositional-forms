export function shallowEqual(objA: any, objB: any): boolean {
  if (Object.is(objA, objB)) {
    return true;
  }

  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const keysA = Object.keys(objA);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) {
    return false;
  }

  // Test for A's keys different from B.
  for (let i = 0; i < keysA.length; i++) {
    const currentKey = keysA[i];
    if (
      !Object.hasOwnProperty.call(objB, currentKey) ||
      !Object.is(objA[currentKey], objB[currentKey])
    ) {
      return false;
    }
  }

  return true;
}
