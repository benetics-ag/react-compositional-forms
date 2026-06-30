/**
 * The `ownErrors` map and its immutable update helpers.
 *
 * `ownErrors` maps each form's path key to the validation errors that form
 * raised about its own value, not its descendants'. The errors a form displays
 * are the union over its subtree ({@link aggregateErrors}).
 *
 * Every helper returns the same map by reference when it changes nothing, so an
 * unchanged validation result propagates no new reference to subscribers.
 */

import {
  FieldError,
  fieldErrorSetsDeepEqual,
  NO_FIELD_ERRORS,
} from '../field-errors';
import {isDescendantOrSelf, Path, pathOf, PathKey} from './path';

/**
 * Union the own errors at and below `path` into the form's displayed error set.
 *
 * @param ownErrors The per-form own-error map.
 * @param path The subtree root to aggregate over.
 * @returns The union of every own-error set at or below `path`, ordered
 *   shallowest-first so a form's own errors precede its descendants' (e.g. an
 *   array-level error before an element's). {@link NO_FIELD_ERRORS} when empty.
 */
export function aggregateErrors(
  ownErrors: ReadonlyMap<PathKey, ReadonlySet<FieldError>>,
  path: Path,
): ReadonlySet<FieldError> {
  const matches: {depth: number; errs: ReadonlySet<FieldError>}[] = [];
  for (const [key, errs] of ownErrors) {
    const kp = pathOf(key);
    if (isDescendantOrSelf(kp, path)) matches.push({depth: kp.length, errs});
  }
  if (matches.length === 0) return NO_FIELD_ERRORS;
  matches.sort((a, b) => a.depth - b.depth);
  const out = new Set<FieldError>();
  for (const m of matches) for (const e of m.errs) out.add(e);
  return out;
}

/**
 * Set the errors at `key`, dropping the entry when empty. Keeps the previous set
 * by reference when the new one is deep-equal, so an unchanged validation result
 * does not churn references downstream.
 *
 * @param map The per-form own-error map.
 * @param key The form whose errors to set.
 * @param errs The new error set.
 * @returns The updated map, or `map` unchanged when nothing differs.
 */
export function withEntry(
  map: ReadonlyMap<PathKey, ReadonlySet<FieldError>>,
  key: PathKey,
  errs: ReadonlySet<FieldError>,
): ReadonlyMap<PathKey, ReadonlySet<FieldError>> {
  const prev = map.get(key);
  if (prev === errs || (prev === undefined && errs.size === 0)) return map;
  if (prev !== undefined && fieldErrorSetsDeepEqual(prev, errs)) return map;
  const next = new Map(map);
  if (errs.size > 0) next.set(key, errs);
  else next.delete(key);
  return next;
}

/**
 * Drop the errors under `path` that belong to forms now clean, keeping those
 * still dirty. Use on a keepDirtyValues reset: a form whose value was kept stays
 * dirty and keeps its error; a form taken back to its reset value is clean and
 * loses it.
 *
 * @param map The per-form own-error map.
 * @param path The subtree root to prune.
 * @param dirtyPrefixes The post-reset dirty set; a key it contains is kept.
 * @returns The updated map, or `map` unchanged when nothing was dropped.
 */
export function keepDirtyErrors(
  map: ReadonlyMap<PathKey, ReadonlySet<FieldError>>,
  path: Path,
  dirtyPrefixes: ReadonlySet<PathKey>,
): ReadonlyMap<PathKey, ReadonlySet<FieldError>> {
  let changed = false;
  const next = new Map(map);
  for (const key of map.keys()) {
    if (isDescendantOrSelf(pathOf(key), path) && !dirtyPrefixes.has(key)) {
      next.delete(key);
      changed = true;
    }
  }
  return changed ? next : map;
}
