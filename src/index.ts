import {DependencyList, useEffect, useRef, useState} from 'react';

/**
 * Interface for objects that support reactive subscriptions to query results.
 *
 * @template Tx - The transaction type used by the subscribable object
 *
 * @example
 * ```typescript
 * const replicache: Subscribable<ReadTransaction> = new Replicache({...});
 * const unsubscribe = replicache.subscribe(
 *   async (tx) => await tx.get('key'),
 *   { onData: (data) => console.log(data) }
 * );
 * ```
 */
export type Subscribable<Tx> = {
  /**
   * Subscribe to query results. The query will be re-run whenever dependencies change.
   *
   * @template Data - The return type of the query
   * @param query - Async function that runs the query using the transaction
   * @param options - Subscription options
   * @param options.onData - Callback invoked with query results
   * @param options.isEqual - Optional equality function to prevent unnecessary updates
   * @returns Unsubscribe function to clean up the subscription
   */
  subscribe<Data>(
    query: (tx: Tx) => Promise<Data>,
    options: {
      onData: (data: Data) => void;
      isEqual?: ((a: Data, b: Data) => boolean) | undefined;
    },
  ): () => void;
};

// React 19+ has automatic batching for all updates (including microtasks).
// We batch state updates via microtask to ensure we do not render more than
// once over all changed subscriptions.

let hasPendingCallback = false;
let callbacks: (() => void)[] = [];

function doCallback() {
  const cbs = callbacks;
  callbacks = [];
  hasPendingCallback = false;
  for (const callback of cbs) {
    try {
      callback();
    } catch (e) {
      // Log but don't let one bad callback block others
      console.error('useSubscribe callback error:', e);
    }
  }
}

/**
 * Removes `undefined` from a union type.
 *
 * @example
 * ```typescript
 * type A = RemoveUndefined<string | undefined>; // string
 * type B = RemoveUndefined<number | null | undefined>; // number | null
 * ```
 */
export type RemoveUndefined<T> = Exclude<T, undefined>;

/**
 * Options for configuring the `useSubscribe` hook.
 *
 * @template QueryRet - The return type of the query function
 * @template Default - The type of the default value (defaults to `undefined`)
 */
export type UseSubscribeOptions<QueryRet, Default> = {
  /**
   * Default value to return while the query is loading or when `r` is null/undefined.
   * Can be undefined since it is an unbounded type parameter.
   */
  default?: Default;
  /**
   * Dependencies array similar to `useEffect`. When these change, the subscription
   * will be re-created. By default, only changes to `r` trigger re-subscription.
   */
  dependencies?: DependencyList | undefined;
  /**
   * Custom equality function to determine if query results have changed.
   * If not provided, uses reference equality (`===`).
   *
   * @param a - Previous query result
   * @param b - New query result
   * @returns `true` if values are equal (prevents re-render), `false` otherwise
   */
  isEqual?: ((a: QueryRet, b: QueryRet) => boolean) | undefined;
  /**
   * When `true` (default), preserves the previous snapshot value during dependency
   * transitions instead of resetting to undefined. This eliminates UI flash when
   * switching between subscriptions with different dependencies.
   *
   * Set to `false` to reset to the default value on every subscription change.
   *
   * @default true
   */
  keepPreviousData?: boolean;
};

/**
 * Runs a query and returns the result. Re-runs automatically whenever the
 * query changes.
 *
 * NOTE: Changing `r` will cause the query to be re-run, but changing `query`
 * or `options` will not (by default). This is by design because these two
 * values are often object/array/function literals which change on every
 * render. If you want to re-run the query when these change, you can pass
 * them as dependencies.
 *
 * @param r - The Replicache instance to subscribe to (or null/undefined)
 * @param query - The query function to run against the Replicache transaction
 * @param options - Configuration options
 * @param options.default - Default value returned before first data or when query returns undefined
 * @param options.dependencies - Additional dependencies that trigger re-subscription when changed
 * @param options.isEqual - Custom equality function to compare query results
 * @param options.keepPreviousData - When true (default), preserves previous data during
 *   dependency transitions instead of resetting to undefined. This eliminates UI flash
 *   when switching between subscriptions. Set to false to reset immediately.
 *
 * @example
 * // Basic usage
 * const todos = useSubscribe(rep, tx => tx.scan({prefix: '/todo'}).values().toArray(), {
 *   default: [],
 * });
 *
 * @example
 * // With dependencies - re-subscribes when category changes, no flash
 * const todos = useSubscribe(rep, tx => getTodosByCategory(tx, category), {
 *   default: [],
 *   dependencies: [category],
 *   keepPreviousData: true, // default, can omit
 * });
 */
export function useSubscribe<Tx, QueryRet, Default = undefined>(
  r: Subscribable<Tx> | null | undefined,
  query: (tx: Tx) => Promise<QueryRet>,
  options: UseSubscribeOptions<QueryRet, Default> = {},
): RemoveUndefined<QueryRet> | Default {
  const {
    default: def,
    dependencies = [],
    isEqual,
    keepPreviousData = true,
  } = options;
  const [snapshot, setSnapshot] = useState<QueryRet | undefined>(undefined);
  const prevSnapshotRef = useRef<QueryRet | undefined>(undefined);
  const generationRef = useRef<number>(0);
  // Track the subscribable to detect transitions during render (before effect runs)
  const prevRRef = useRef<typeof r>(undefined);
  // Track deps to detect dependency changes during render
  const prevDepsRef = useRef<ReadonlyArray<unknown>>([]);
  // Track whether effect has run at least once (to detect initial vs transition)
  const hasRunEffectRef = useRef(false);

  // Detect if we're in a transition (r or deps changed since last effect)
  // Only consider it a transition after the first effect run (hasRunEffectRef guards initial mount)
  const depsChanged =
    dependencies.length !== prevDepsRef.current.length ||
    dependencies.some((dep, i) => !Object.is(dep, prevDepsRef.current[i]));
  const hasTransitioned =
    (r !== prevRRef.current || depsChanged) && hasRunEffectRef.current;

  useEffect(() => {
    // Mark that effect has run at least once (for transition detection)
    hasRunEffectRef.current = true;
    // Update refs after effect runs
    prevRRef.current = r;
    prevDepsRef.current = dependencies;

    if (!r) {
      return;
    }

    // Capture current snapshot when deps change (fixes showing oldest data instead of most recent)
    if (keepPreviousData && snapshot !== undefined) {
      prevSnapshotRef.current = snapshot;
    }

    // Increment generation counter to invalidate stale subscription callbacks
    const currentGen = ++generationRef.current;
    let isMounted = true;

    const unsubscribe = r.subscribe(query, {
      onData: data => {
        // Ignore callbacks from stale subscriptions
        if (generationRef.current !== currentGen) {
          return;
        }

        // Track the previous value for keepPreviousData feature
        prevSnapshotRef.current = data;
        // This is safe because we know that subscribe in fact can only return
        // `R` (the return type of query or def).
        callbacks.push(() => {
          // Prevent setState after unmount
          if (isMounted) {
            setSnapshot(data);
          }
        });
        if (!hasPendingCallback) {
          void Promise.resolve().then(doCallback);
          hasPendingCallback = true;
        }
      },
      isEqual,
    });

    return () => {
      isMounted = false;
      unsubscribe();
      // Always clear prevSnapshotRef to prevent memory leak (ref holds stale data)
      prevSnapshotRef.current = undefined;
      // Only reset snapshot state if keepPreviousData is false
      if (!keepPreviousData) {
        setSnapshot(undefined);
      }
    };
  }, [r, ...(dependencies ?? [])]);

  // Handle transitions: when deps changed and keepPreviousData is false, show default immediately
  if (hasTransitioned && !keepPreviousData) {
    // Safe: def is Default type by parameter definition
    return def as Default;
  }

  // Return previous data while new subscription initializes (eliminates flash)
  if (snapshot === undefined) {
    if (keepPreviousData && prevSnapshotRef.current !== undefined) {
      // Safe: prevSnapshotRef holds QueryRet from previous successful subscription
      return prevSnapshotRef.current as RemoveUndefined<QueryRet>;
    }
    // Safe: def is Default type by parameter definition
    return def as Default;
  }
  // Safe: snapshot is QueryRet (not undefined) after the guard above
  return snapshot as RemoveUndefined<QueryRet>;
}
