import {
  isDescendantOrSelf,
  isStrictDescendant,
  keyOf,
  pathOf,
  Segment,
} from '../internal/path';

describe('keyOf', () => {
  it('is canonical: object key order does not change the key', () => {
    expect(keyOf([{a: 1, b: 2}])).toBe(keyOf([{b: 2, a: 1}]));
    expect(keyOf([{outer: {a: 1, b: 2}}])).toBe(keyOf([{outer: {b: 2, a: 1}}]));
  });

  it('preserves the order of segments and of array values within a segment', () => {
    expect(keyOf(['a', 'b'])).not.toBe(keyOf(['b', 'a']));
    expect(keyOf([[1, 2]])).not.toBe(keyOf([[2, 1]]));
  });

  it('distinguishes a nested array segment from the surrounding path', () => {
    expect(keyOf([[1, 2], 'x'])).not.toBe(keyOf([1, 2, 'x']));
  });

  it('round-trips through pathOf, including object segments', () => {
    const path: Segment[] = ['rows', {id: 7}, 'name'];
    expect(pathOf(keyOf(path))).toEqual(path);
  });
});

describe('isDescendantOrSelf', () => {
  it('matches structurally equal object segments built fresh each time', () => {
    expect(isDescendantOrSelf([{id: 1}, 'name'], [{id: 1}])).toBe(true);
  });

  it('does not match object segments that differ in structure', () => {
    expect(isDescendantOrSelf([{id: 1}], [{id: 2}])).toBe(false);
  });

  it('treats a form as its own descendant and rejects shorter keys', () => {
    expect(isDescendantOrSelf(['a'], ['a'])).toBe(true);
    expect(isDescendantOrSelf(['a'], ['a', 'b'])).toBe(false);
  });

  it('distinguishes segments of different JSON types', () => {
    expect(isDescendantOrSelf([0], ['0'])).toBe(false);
  });
});

describe('isStrictDescendant', () => {
  it('excludes the form itself', () => {
    expect(isStrictDescendant([{id: 1}], [{id: 1}])).toBe(false);
    expect(isStrictDescendant([{id: 1}, 'x'], [{id: 1}])).toBe(true);
  });
});
