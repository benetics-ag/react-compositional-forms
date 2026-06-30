/**
 * Naming positions in the form tree.
 *
 * A form is a tree of values, and the store keys per-form state — errors,
 * dirtiness, frozen baselines — by position. A path names one position: the
 * sequence of segments from the root down to that form. The store needs paths
 * because the same per-form state lives in flat maps that nothing about the
 * value tree itself provides a key for.
 *
 * The array form ({@link Path}) carries the hierarchy used to compare ancestry
 * and enumerate prefixes; the string form ({@link PathKey}) is its flat, hashable
 * form for indexing a Map or Set.
 */

/**
 * A JSON value: `null`, a boolean, a number, a string, an array of JSON values,
 * or an object with string keys and JSON values. These round-trip through
 * {@link keyOf} and {@link pathOf} unchanged; `undefined`, `NaN`, `Infinity`,
 * functions, and class instances do not.
 */
export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | {readonly [key: string]: Json};

/**
 * One step in a path, identifying a child within its parent: an object key
 * (`string`), an array index (`number`), or any other JSON value a combinator
 * uses to name its children. Segments are compared by JSON structure — two
 * segments with equal structure name the same child.
 */
export type Segment = Json;

/**
 * A position in the form tree as a sequence of segments, root-first. Use a
 * `Path` whenever hierarchy matters — descending into a child, comparing
 * ancestry, enumerating prefixes. Convert to a {@link PathKey} via {@link keyOf}
 * only to index a Map or Set, since two equal-but-distinct arrays are not `===`.
 */
export type Path = readonly Segment[];

/**
 * A {@link Path} flattened to a string for use as a Map or Set key. {@link keyOf}
 * and {@link pathOf} convert between the two forms. Compare hierarchy on the array
 * {@link Path}, not on this string.
 */
export type PathKey = string;

/** The root form's path: the empty segment sequence. */
export const ROOT: Path = [];

/**
 * Flatten a path to its Map or Set key. Object keys within a segment are sorted,
 * so segments with equal JSON structure flatten to the same key.
 *
 * @param path The path to convert.
 * @returns A stable identity string for `path`.
 */
export function keyOf(path: Path): PathKey {
  return JSON.stringify(path, sortObjectKeys);
}

/** A `JSON.stringify` replacer that sorts each object's keys. */
function sortObjectKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const sorted: {[key: string]: unknown} = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = (value as {[key: string]: unknown})[key];
  }
  return sorted;
}

/**
 * Recover the path from a key produced by {@link keyOf}.
 *
 * @param key A key produced by {@link keyOf}.
 * @returns The original path.
 */
export function pathOf(key: PathKey): Path {
  return JSON.parse(key) as Path;
}

/**
 * Extend a path by one segment, naming a child position.
 *
 * @param path The parent's path.
 * @param segment The child's segment under the parent.
 * @returns The child's path.
 */
export function childPath(path: Path, segment: Segment): Path {
  return [...path, segment];
}

/**
 * Whether `key` is `ancestor` itself or lies beneath it — membership of the
 * subtree rooted at `ancestor`.
 *
 * @param key The candidate descendant path.
 * @param ancestor The subtree-root path.
 * @returns `true` when `key` equals or extends `ancestor`.
 */
export function isDescendantOrSelf(key: Path, ancestor: Path): boolean {
  if (key.length < ancestor.length) return false;
  for (let i = 0; i < ancestor.length; i++) {
    if (!segmentsEqual(key[i], ancestor[i])) return false;
  }
  return true;
}

/** Whether two segments name the same child: structural equality of JSON values. */
export function segmentsEqual(a: Segment, b: Segment): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false;
  }
  return keyOf([a]) === keyOf([b]);
}

/**
 * Whether `key` lies strictly beneath `ancestor`: a descendant, excluding
 * `ancestor` itself.
 *
 * @param key The candidate descendant path.
 * @param ancestor The subtree-root path.
 * @returns `true` when `key` extends `ancestor` by at least one segment.
 */
export function isStrictDescendant(key: Path, ancestor: Path): boolean {
  return key.length > ancestor.length && isDescendantOrSelf(key, ancestor);
}

/**
 * Every prefix of `path`, root-first, ending at `path` itself — the chain from
 * the root down to a position, including the position.
 *
 * @param path The path whose prefixes to enumerate.
 * @returns The prefixes, shortest (root) to longest (`path`).
 */
export function prefixesOf(path: Path): Path[] {
  const out: Path[] = [];
  for (let i = 0; i <= path.length; i++) out.push(path.slice(0, i));
  return out;
}

/**
 * Decompose a descendant `key` relative to `ancestor`: the one segment that
 * branches off `ancestor`, and everything below it.
 *
 * @param key A path strictly beneath `ancestor`.
 * @param ancestor The reference ancestor path.
 * @returns `seg`, the immediate child segment under `ancestor`, and `tail`, the
 *   remaining path below that child.
 */
export function splitUnder(
  key: Path,
  ancestor: Path,
): {seg: Segment; tail: Path} {
  return {seg: key[ancestor.length], tail: key.slice(ancestor.length + 1)};
}

/**
 * Drop every entry at or below `path` from a map keyed by {@link PathKey}.
 *
 * @param map A map keyed by path.
 * @param path The subtree root to clear.
 * @returns The updated map, or `map` unchanged when nothing matched.
 */
export function clearUnder<V>(
  map: ReadonlyMap<PathKey, V>,
  path: Path,
): ReadonlyMap<PathKey, V> {
  let changed = false;
  const next = new Map(map);
  for (const key of map.keys()) {
    if (isDescendantOrSelf(pathOf(key), path)) {
      next.delete(key);
      changed = true;
    }
  }
  return changed ? next : map;
}

/**
 * Reindex the entries strictly below `path` in a map keyed by {@link PathKey}
 * when its children are reordered or removed, so a surviving child's entry
 * follows it to its new position.
 *
 * @param map A map keyed by path.
 * @param path The parent whose children are being reindexed.
 * @param remap Map a child's old segment to its new segment, or `null` to drop
 *   that child's entries.
 * @returns The updated map, or `map` unchanged when no key moved.
 */
export function remapUnder<V>(
  map: ReadonlyMap<PathKey, V>,
  path: Path,
  remap: (segment: Segment) => Segment | null,
): ReadonlyMap<PathKey, V> {
  let changed = false;
  const next = new Map<PathKey, V>();
  for (const [key, val] of map) {
    const kp = pathOf(key);
    if (!isStrictDescendant(kp, path)) {
      next.set(key, val);
      continue;
    }
    const {seg, tail} = splitUnder(kp, path);
    const newSeg = remap(seg);
    if (newSeg === null) {
      changed = true;
      continue;
    }
    const newKey = keyOf([...path, newSeg, ...tail]);
    if (newKey !== key) changed = true;
    next.set(newKey, val);
  }
  return changed ? next : map;
}
