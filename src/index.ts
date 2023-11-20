import {DependencyList, useEffect, useState} from 'react';
import {unstable_batchedUpdates} from 'react-dom';
import type {ReadonlyJSONValue} from 'replicache';

export type Subscribable<Tx> = {
  subscribe<Data extends ReadonlyJSONValue | undefined>(
    query: (tx: Tx) => Promise<Data>,
    {onData}: {onData: (data: Data) => void},
  ): () => void;
};

export type SubscribableWithIsEqual<Tx> = {
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
  deps?: DependencyList | undefined;
  isEqual?: ((a: QueryRet, b: QueryRet) => boolean) | undefined;
};

function isUseSubscribeOptions<Default, QueryRet>(
  v: Default | UseSubscribeOptions<QueryRet, Default>,
): v is UseSubscribeOptions<QueryRet, Default> {
  return (
    typeof v === 'object' &&
    v !== null &&
    ('default' in v || 'isEqual' in v || 'deps' in v)
  );
}

export function useSubscribe<Tx, QueryRet, Default = undefined>(
  r: SubscribableWithIsEqual<Tx> | null | undefined,
  query: (tx: Tx) => Promise<QueryRet>,
  options: UseSubscribeOptions<QueryRet, Default>,
): RemoveUndefined<QueryRet> | Default;
export function useSubscribe<
  Tx,
  Data extends ReadonlyJSONValue | undefined,
  QueryRet extends Data,
  Default = undefined,
>(
  r: Subscribable<Tx> | null | undefined,
  query: (tx: Tx) => Promise<QueryRet>,
  def?: Default,
  deps?: DependencyList,
): RemoveUndefined<QueryRet> | Default;
export function useSubscribe<Tx, QueryRet, Default>(
  r: Subscribable<Tx> | SubscribableWithIsEqual<Tx> | null | undefined,
  query: (tx: Tx) => Promise<QueryRet>,
  defaultOrOptions?: Default | UseSubscribeOptions<QueryRet, Default>,
  maybeDeps?: DependencyList,
): RemoveUndefined<QueryRet> | Default {
  if (isUseSubscribeOptions(defaultOrOptions)) {
    return useSubscribeImpl(
      r as SubscribableWithIsEqual<Tx>,
      query,
      defaultOrOptions,
    );
  }
  return useSubscribeImpl(r as SubscribableWithIsEqual<Tx>, query, {
    default: defaultOrOptions,
    deps: maybeDeps,
  });
}

function useSubscribeImpl<Tx, QueryRet, Default>(
  r: SubscribableWithIsEqual<Tx> | null | undefined,
  query: (tx: Tx) => Promise<QueryRet>,
  options: UseSubscribeOptions<QueryRet, Default>,
): RemoveUndefined<QueryRet> | Default {
  const {default: def, deps = [], isEqual} = options;
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
  }, [r, ...deps]);
  if (snapshot === undefined) {
    return def as Default;
  }
  // This RemoveUndefined is just here to make the return type easier to read.
  // It should be exactly equivalent to what the type would be without this.
  // For some reason declaring the return type to be
  // RemoveUndefined<QueryRet> | Default doesn't typecheck.
  return snapshot as RemoveUndefined<QueryRet>;
}
