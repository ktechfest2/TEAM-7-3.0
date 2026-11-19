/**
 * Embedded rows come back as an object for one-to-one relations and an array for one-to-many
 * (unit_results became one-to-many when results were split per election). Always an array.
 */
export const many = <T,>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
