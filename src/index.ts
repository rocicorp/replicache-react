import {useEffect, useState} from 'react';
import {unstable_batchedUpdates} from 'react-dom';

export type Subscribable<Tx, Data> = {
  subscribe: (
    query: (tx: Tx) => Promise<Data>,
    {onData}: {onData: (data: Data) => void},
  ) => () => void;
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

export function useSubscribe<Tx, Data, QueryRet extends Data, Default>(
  r: Subscribable<Tx, Data> | null | undefined,
  query: (tx: Tx) => Promise<QueryRet>,
  def: Default,
  deps: Array<unknown> = [],
) {
  const [snapshot, setSnapshot] = useState<QueryRet | undefined>(undefined);
  useEffect(() => {
    if (!r) {
      return;
    }

    const unsubscribe = r.subscribe(query, {
      onData: data => {
        // This is safe because we know that subscribe in fact can only return
        // `R` (the return type of query or def).
        callbacks.push(() => setSnapshot(data as QueryRet));
        if (!hasPendingCallback) {
          void Promise.resolve().then(doCallback);
          hasPendingCallback = true;
        }
      },
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
    return def;
  }
  // This RemoveUndefined is just here to make the return type easier to read.
  // It should be exactly equivalent to what the type would be without this.
  // For some reason declaring the return type to be
  // RemoveUndefined<QueryRet> | Default doesn't typecheck.
  return snapshot as RemoveUndefined<QueryRet>;
}
