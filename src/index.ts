import type {Replicache} from 'replicache';
import type {ReadonlyJSONValue, ReadTransaction} from 'replicache';
import {useEffect, useState} from 'react';
import {unstable_batchedUpdates} from 'react-dom';

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

export type Subscribeable = Pick<Replicache, 'subscribe'>;

export function useSubscribe<R extends ReadonlyJSONValue>(
  subscribeable: Subscribeable | null | undefined,
  query: (tx: ReadTransaction) => Promise<R>,
  def: R,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps: Array<any> = [],
): R {
  const [snapshot, setSnapshot] = useState<R>(def);
  useEffect(() => {
    if (!subscribeable) {
      return;
    }

    return subscribeable.subscribe(query, {
      onData: (data: R) => {
        callbacks.push(() => setSnapshot(data));
        if (!hasPendingCallback) {
          void Promise.resolve().then(doCallback);
          hasPendingCallback = true;
        }
      },
    });
  }, [subscribeable, ...deps]);
  return snapshot;
}
