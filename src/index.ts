import type {Replicache} from 'replicache';
import type {ReadonlyJSONValue, ReadTransaction} from 'replicache';
import {useEffect, useState} from 'react';
import {unstable_batchedUpdates} from 'react-dom';

// We wrap all the callbacks in a `unstable_batchedUpdates` call to ensure that
// we do not render things more than once overv all of the changed subscriptions.

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

export function useSubscribe<R extends ReadonlyJSONValue>(
  rep: Replicache | null | undefined,
  query: (tx: ReadTransaction) => Promise<R>,
  def: R,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps: Array<any> = [],
): R {
  const [snapshot, setSnapshot] = useState<R>(def);
  console.log('snapshot is', snapshot);
  useEffect(() => {
    if (!rep) {
      return;
    }
    console.log('has rep, running subscribe');

    return rep.subscribe(query, {
      onData: (data: R) => {
        console.log('got data', data, 'adding callback');
        callbacks.push(() => setSnapshot(data));
        if (!hasPendingCallback) {
          console.log('calling callback');
          void Promise.resolve().then(doCallback);
          hasPendingCallback = true;
        }
      },
    });
  }, [rep, ...deps]);
  return snapshot;
}
