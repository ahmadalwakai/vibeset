import * as z from 'zod/mini';

/** Shared with classic server wrappers so browser and server IDs follow one rule. */
export const actorIdSchema = z
  .string()
  .check(z.trim(), z.minLength(1), z.maxLength(256), z.regex(/^[^\s\u0000-\u001f\u007f]+$/));

export const themeIdSchema = z.uuid().check(z.length(36), z.toLowerCase());
