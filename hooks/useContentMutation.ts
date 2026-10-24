'use client';
import { useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import type { ActionResult, ErrorMessageCode } from '../lib/result';
interface ContentMutation {
  pending: boolean;
  error: ErrorMessageCode | null;
  fields: readonly string[];
  clear: () => void;
  run: <T>(
    schema: z.ZodType,
    input: unknown,
    action: (input: unknown) => Promise<ActionResult<T>>,
    onSuccess: (data: T) => void,
  ) => Promise<boolean>;
}
export function useContentMutation(onPendingChange?: (pending: boolean) => void): ContentMutation {
  const [pending, setPending] = useState(false),
    [error, setError] = useState<ErrorMessageCode | null>(null),
    [fields, setFields] = useState<string[]>([]);
  const busy = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run<T>(
    schema: z.ZodType,
    input: unknown,
    action: (input: unknown) => Promise<ActionResult<T>>,
    onSuccess: (data: T) => void,
  ): Promise<boolean> {
    if (busy.current) return false;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      setError('VALIDATION');
      setFields([...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))]);
      return false;
    }
    busy.current = true;
    onPendingChange?.(true);
    setPending(true);
    setError(null);
    setFields([]);
    try {
      const result = await action(parsed.data);
      if (!mounted.current) return false;
      if (!result.ok) {
        setError(result.error.code);
        setFields(Object.keys(result.error.fieldErrors ?? {}));
        return false;
      }
      onSuccess(result.data);
      return true;
    } catch {
      if (mounted.current) setError('NETWORK');
      return false;
    } finally {
      busy.current = false;
      onPendingChange?.(false);
      if (mounted.current) setPending(false);
    }
  }
  return {
    pending,
    error,
    fields,
    run,
    clear: () => {
      setError(null);
      setFields([]);
    },
  };
}
