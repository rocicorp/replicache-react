import {useEffect, useState} from 'react';
import {unstable_batchedUpdates} from 'react-dom';

interface SubscribeOptions<Data> {
  onData: (data: Data) => void;
}

type Query<ReadTransaction, Ret> = (tx: ReadTransaction) => Promise<Ret>;

interface Subscribable<ReadTransaction, Ret> {
  subscribe: (
    query: Query<ReadTransaction, Ret>,
    opts: SubscribeOptions<Ret>,
  ) => void;
}

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

export function useSubscribe<ReadTransaction, Ret>(
  rep: Subscribable<ReadTransaction, Ret> | undefined | null,
  query: Query<ReadTransaction, Ret>,
  def: Ret,
  deps: Array<unknown> = [],
): Ret {
  const [snapshot, setSnapshot] = useState<Ret>(def);
  useEffect(() => {
    if (!rep) {
      return;
    }

    return rep.subscribe(query, {
      onData: (data: Ret) => {
        callbacks.push(() => setSnapshot(data));
        if (!hasPendingCallback) {
          void Promise.resolve().then(doCallback);
          hasPendingCallback = true;
        }
      },
    });
  }, [rep, ...deps]);
  return snapshot;
}
