import type Replicache from 'replicache';
import type {JSONValue, ReadTransaction} from 'replicache';
import {useEffect, useState} from 'react';

export function useSubscribe<R extends JSONValue>(
    rep: Replicache,
    query: (tx: ReadTransaction) => Promise<R>,
    def: R,
    deps: Array<any> = [],
  ): R {
  const [snapshot, setSnapshot] = useState<R>(def);
  useEffect(() => {
    return rep.subscribe(query, {
      onData: (data: R) => {
        setSnapshot(data);
      }
    });
  }, [rep, ...deps]);
  return snapshot;
}
