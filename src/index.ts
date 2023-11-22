import {DependencyList, useEffect, useState} from 'react';
import {unstable_batchedUpdates} from 'react-dom';
import {ReadonlyJSONValue} from 'replicache';

export type Subscribable<Tx> = {
  subscribe<Data>(
    query: (tx: Tx) => Promise<Data>,
    options: {
      onData: (data: Data) => void;
      isEqual?: ((a: Data, b: Data) => boolean) | undefined;
    },
  ): () => void;
};

// We wrap all the callbacks in a `unstable_batchedUpdates` call to ensure that
// we do not render things more than once over all of the changed subscriptions.

let hasPendingCallback = false;
let callbacks: (() => void)[] = [];

function doCallback() {
  const cbs = callbacks;
  callbacks = [];
  hasPendingCallback = false;
  unstable_batchedUpdates(() => {
    for (const callback of cbs) {
      callback();
    }
  });
}

export type RemoveUndefined<T> = T extends undefined ? never : T;

export type UseSubscribeOptions<QueryRet, Default> = {
  /** Default can already be undefined since it is an unbounded type parameter. */
  default?: Default;
  dependencies?: DependencyList | undefined;
  isEqual?: ((a: QueryRet, b: QueryRet) => boolean) | undefined;
};

export type UseSubscribeOptionsNoIsEqual<QueryRet, Default> = Omit<
  UseSubscribeOptions<QueryRet, Default>,
  'isEqual'
>;

export function useSubscribe<Tx, QueryRet, Default = undefined>(
  r: Subscribable<Tx> | null | undefined,
  query: (tx: Tx) => Promise<QueryRet>,
  options: UseSubscribeOptions<QueryRet, Default>,
): RemoveUndefined<QueryRet> | Default;
export function useSubscribe<Tx, QueryRet extends ReadonlyJSONValue, undefined>(
  r: Subscribable<Tx> | null | undefined,
  query: (tx: Tx) => Promise<QueryRet>,
): RemoveUndefined<QueryRet> | undefined;
export function useSubscribe<Tx, QueryRet extends ReadonlyJSONValue, Default>(
  r: Subscribable<Tx> | null | undefined,
  query: (tx: Tx) => Promise<QueryRet>,
  options: UseSubscribeOptionsNoIsEqual<QueryRet, Default> | undefined,
): RemoveUndefined<QueryRet> | Default;
export function useSubscribe<Tx, QueryRet, Default>(
  r: Subscribable<Tx> | null | undefined,
  query: (tx: Tx) => Promise<QueryRet>,
  options: UseSubscribeOptions<QueryRet, Default> = {},
): RemoveUndefined<QueryRet> | Default {
  const {default: def, dependencies = [], isEqual} = options;
  const [snapshot, setSnapshot] = useState<QueryRet | undefined>(undefined);
  useEffect(() => {
    if (!r) {
      return;
    }

    const unsubscribe = r.subscribe(query, {
      onData: data => {
        // This is safe because we know that subscribe in fact can only return
        // `R` (the return type of query or def).
        callbacks.push(() => setSnapshot(data));
        if (!hasPendingCallback) {
          void Promise.resolve().then(doCallback);
          hasPendingCallback = true;
        }
      },
      isEqual,
    });

    return () => {
      unsubscribe();
      setSnapshot(undefined);
    };
    // NOTE: `def` and `query` not passed as a dep here purposely. It would be
    // more correct to pass them, but it's also a footgun since it's common to
    // pass object, array, or function literals which change on every render.
    // Also note that if this ever changes, it's a breaking change and should
    // be documented, as if callers pass an object/array/func literal, changing
    // this will cause a render loop that would be hard to debug.
  }, [r, ...dependencies]);
  if (snapshot === undefined) {
    return def as Default;
  }
  // This RemoveUndefined is just here to make the return type easier to read.
  // It should be exactly equivalent to what the type would be without this.
  // For some reason declaring the return type to be
  // RemoveUndefined<QueryRet> | Default doesn't typecheck.
  return snapshot as RemoveUndefined<QueryRet>;
}
