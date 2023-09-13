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

export function useSubscribe<Tx, D, R extends D>(
  r: Subscribable<Tx, D> | null | undefined,
  query: (tx: Tx) => Promise<R>,
  def: R,
  deps: Array<unknown> = [],
): R {
  const [snapshot, setSnapshot] = useState<R>(def);
  useEffect(() => {
    if (!r) {
      return;
    }

    const unsubscribe = r.subscribe(query, {
      onData: data => {
        // This is safe because we know that subscribe in fact can only return
        // `R` (the return type of query or def).
        callbacks.push(() => setSnapshot(data as R));
        if (!hasPendingCallback) {
          void Promise.resolve().then(doCallback);
          hasPendingCallback = true;
        }
      },
    });

    return () => {
      unsubscribe();
      setSnapshot(def);
    };
  }, [r, ...deps]);
  return snapshot;
}
