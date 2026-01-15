import {resolver} from '@rocicorp/resolver';
import React from 'react';
import {flushSync} from 'react-dom';
import {createRoot, Root} from 'react-dom/client';
import type {JSONValue, ReadTransaction} from 'replicache';
import {Replicache, TEST_LICENSE_KEY, WriteTransaction} from 'replicache';
import {expect, expectTypeOf, test} from 'vitest';
import {Subscribable, useSubscribe} from './index.js';

function sleep(ms: number | undefined): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const roots = new WeakMap<HTMLElement, Root>();

function render(element: React.ReactNode, container: HTMLElement): void {
  let root = roots.get(container);
  if (!root) {
    root = createRoot(container);
    roots.set(container, root);
  }

  flushSync(() => {
    root.render(element);
  });
}

test('null/undefined replicache', async () => {
  const {promise, resolve} = resolver();
  function A({rep, def}: {rep: Replicache | null | undefined; def: string}) {
    const subResult = useSubscribe(
      rep,
      async () => {
        resolve();
        return 'hello';
      },
      {default: def},
    );
    return <div>{subResult}</div>;
  }

  const div = document.createElement('div');
  render(<A key="a" rep={null} def="a" />, div);
  expect(div.textContent).toBe('a');

  render(<A key="b" rep={undefined} def="b" />, div);
  expect(div.textContent).toBe('b');

  const rep = new Replicache({
    name: 'null-undef-test',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {
      dummy: () => undefined,
    },
  });

  render(<A key="c" rep={rep} def="c" />, div);
  expect(div.textContent).toBe('c');
  await promise;
  await sleep(1);
  expect(div.textContent).toBe('hello');

  await rep.close();
});

test('Batching of subscriptions', async () => {
  const mutators = {
    async addData(tx: WriteTransaction, data: Record<string, JSONValue>) {
      for (const [k, v] of Object.entries(data)) {
        await tx.put(k, v);
      }
    },
  };

  const renderLog: (string | null)[] = [];

  type MyRep = Replicache<typeof mutators>;
  const rep: MyRep = new Replicache({
    name: Math.random().toString(36).substring(2),
    mutators,
    licenseKey: TEST_LICENSE_KEY,
  });
  await rep.clientID;
  await sleep(1);

  const div = document.createElement('div');

  function A({rep}: {rep: MyRep}) {
    const dataA = useSubscribe(
      rep,
      // TODO: Use type param to get when new Replicache is released.
      async tx => (await tx.get('a')) as string | undefined,
      {default: null},
    );
    renderLog.push('render A', dataA);
    return <B rep={rep} dataA={dataA} />;
  }

  function B({rep, dataA}: {rep: MyRep; dataA: string | null}) {
    const dataB = useSubscribe(
      rep,
      async tx => (await tx.get('b')) as string | undefined,
      {default: null},
    );
    renderLog.push('render B', dataA, dataB);
    return (
      <>
        <div>a: {dataA}</div>
        <div>b: {dataB}</div>
      </>
    );
  }

  render(<A rep={rep} />, div);
  await sleep(1);
  expect(renderLog).toEqual(['render A', null, 'render B', null, null]);
  expect(div.innerHTML).toBe('<div>a: </div><div>b: </div>');

  renderLog.length = 0;
  await rep.mutate.addData({a: 'a1', b: 'b2'});
  await sleep(1);
  expect(renderLog).toEqual(['render A', 'a1', 'render B', 'a1', 'b2']);
  expect(div.innerHTML).toBe('<div>a: a1</div><div>b: b2</div>');

  renderLog.length = 0;
  await rep.mutate.addData({b: 'b3'});
  await sleep(1);
  expect(renderLog).toEqual(['render B', 'a1', 'b3']);
  expect(div.innerHTML).toBe('<div>a: a1</div><div>b: b3</div>');

  await rep.close();
});

test('returning undefined', async () => {
  const {promise, resolve} = resolver();
  function A({rep, def}: {rep: Replicache | null | undefined; def: string}) {
    const subResult = useSubscribe(
      rep,
      async () => {
        resolve();
        return undefined;
      },
      {default: def},
    );
    return <div>{subResult}</div>;
  }

  const div = document.createElement('div');

  const rep = new Replicache({
    name: 'return-undefined',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  render(<A key="c" rep={rep} def="default" />, div);
  expect(div.textContent).toBe('default');
  await promise;
  await sleep(1);
  expect(div.textContent).toBe('default');

  await rep.close();
});

test('changing subscribable instances', async () => {
  const {promise: p1, resolve: r1} = resolver();
  function A({
    rep,
    val,
    res,
  }: {
    rep: Replicache | null | undefined;
    val: string;
    res: () => void;
  }) {
    const subResult = useSubscribe(
      rep,
      async () => {
        res();
        return val;
      },
      undefined,
    );
    return <div>{subResult === undefined ? '' : val}</div>;
  }

  const div = document.createElement('div');

  const rep1 = new Replicache({
    name: 'change-instance',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  render(<A rep={rep1} val="a" res={r1} />, div);
  await p1;
  await sleep(1);
  expect(div.textContent).toBe('a');

  const rep2 = new Replicache({
    name: 'change-instance2',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  const {promise: p2, resolve: r2} = resolver();
  render(<A rep={rep2} val="b" res={r2} />, div);
  await p2;
  await sleep(1);
  expect(div.textContent).toBe('b');

  const {resolve: r3} = resolver();
  render(<A rep={undefined} val="c" res={r3} />, div);
  await sleep(1);
  // With keepPreviousData=true (default), previous data is preserved when rep becomes undefined
  // So subResult is 'b' (previous value), not undefined, thus val='c' is rendered
  expect(div.textContent).toBe('c');

  await rep1.close();
  await rep2.close();
});

test('using isEqual', async () => {
  const {promise, resolve} = resolver();

  const sentinel = Symbol();

  class FakeReplicache implements Subscribable<ReadTransaction> {
    subscribe<Data>(
      query: (tx: ReadTransaction) => Promise<Data>,
      {
        onData,
        isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b),
      }: {
        onData: (data: Data) => void;
        isEqual?: ((a: Data, b: Data) => boolean) | undefined;
      },
    ): () => void {
      const data = query({} as ReadTransaction);
      let previous: Data | typeof sentinel = sentinel;
      void data.then(data => {
        if (previous === sentinel || isEqual(previous, data)) {
          previous = data;
          return onData(data);
        }
      });

      return () => undefined;
    }
  }

  function A({
    rep,
    def,
  }: {
    rep: FakeReplicache | null | undefined;
    def: string;
  }) {
    const subResult = useSubscribe(
      rep,
      async () => {
        resolve();
        return 123n;
      },
      {
        isEqual(a, b) {
          return a === b;
        },
        default: def,
      },
    );
    return (
      <div>
        {typeof subResult}, {String(subResult)}
      </div>
    );
  }

  const div = document.createElement('div');

  render(<A key="a" rep={null} def="a" />, div);
  expect(div.textContent).toBe('string, a');

  render(<A key="b" rep={undefined} def="b" />, div);
  expect(div.textContent).toBe('string, b');

  const rep = new FakeReplicache();

  render(<A key="c" rep={rep} def="c" />, div);
  expect(div.textContent).toBe('string, c');
  await promise;
  await sleep(1);
  expect(div.textContent).toBe('bigint, 123');
});

// Type-only test - skipped at runtime but types are checked at compile time
test.skip('using isEqual [type checking]', () => {
  const use = (...args: unknown[]) => args;

  class FakeReplicache<Tx> implements Subscribable<Tx> {
    subscribe<Data>(
      query: (tx: Tx) => Promise<Data>,
      options: {
        onData: (data: Data) => void;
        isEqual?: ((a: Data, b: Data) => boolean) | undefined;
      },
    ): () => void {
      use(query, options);
      return () => undefined;
    }
  }

  {
    const s = useSubscribe(
      new FakeReplicache<ReadTransaction>(),
      tx => {
        use(tx);
        return Promise.resolve(123n);
      },
      {isEqual: (a, b) => a === b},
    );
    expectTypeOf(s).toEqualTypeOf<bigint | undefined>();
  }

  {
    // default not passed so it is undefined
    const s = useSubscribe(new FakeReplicache<ReadTransaction>(), tx => {
      use(tx);
      return Promise.resolve(123);
    });
    expectTypeOf(s).toEqualTypeOf<number | undefined>();
  }

  {
    const s = useSubscribe(new FakeReplicache<ReadTransaction>(), tx => {
      use(tx);
      const m = new Map([[1, true]]);
      return Promise.resolve(m);
    });
    expectTypeOf(s).toEqualTypeOf<Map<number, boolean> | undefined>();
  }

  {
    const s = useSubscribe(
      new FakeReplicache<ReadTransaction>(),
      tx => {
        use(tx);
        return Promise.resolve(true);
      },
      {default: 456},
    );
    expectTypeOf(s).toEqualTypeOf<boolean | number>();
  }

  {
    const s = useSubscribe(
      new FakeReplicache<ReadTransaction>(),
      tx => {
        use(tx);
        return Promise.resolve(123n);
      },
      {isEqual: (a, b) => a === b, default: 'abc' as const},
    );
    expectTypeOf(s).toEqualTypeOf<bigint | 'abc'>();
  }

  {
    const s = useSubscribe(new FakeReplicache<ReadTransaction>(), tx => {
      use(tx);
      return Promise.resolve(123n);
    });
    use(s);
  }
});

test('keepPreviousData: true - preserves data when switching instances', async () => {
  const {promise: p1, resolve: r1} = resolver();
  const {promise: p2, resolve: r2} = resolver();

  function A({
    rep,
    val,
    res,
  }: {
    rep: Replicache | null | undefined;
    val: string;
    res: () => void;
  }) {
    const subResult = useSubscribe(
      rep,
      async () => {
        res();
        await sleep(10); // Small delay to ensure async behavior
        return val;
      },
      {default: 'default', keepPreviousData: true},
    );
    return <div>{subResult}</div>;
  }

  const div = document.createElement('div');

  // Initial render with no rep
  render(<A rep={null} val="a" res={() => {}} />, div);
  expect(div.textContent).toBe('default');

  // First instance
  const rep1 = new Replicache({
    name: 'keep-prev-data-1',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  render(<A rep={rep1} val="data1" res={r1} />, div);
  expect(div.textContent).toBe('default'); // Still showing default
  await p1;
  await sleep(20);
  expect(div.textContent).toBe('data1'); // Now showing data1

  // Switch to second instance - should keep showing data1 until data2 arrives
  const rep2 = new Replicache({
    name: 'keep-prev-data-2',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  render(<A rep={rep2} val="data2" res={r2} />, div);
  expect(div.textContent).toBe('data1'); // PRESERVED previous data
  await p2;
  await sleep(20);
  expect(div.textContent).toBe('data2'); // Now showing new data

  await rep1.close();
  await rep2.close();
});

test('keepPreviousData: false - resets to default when switching instances', async () => {
  const {promise: p1, resolve: r1} = resolver();
  const {promise: p2, resolve: r2} = resolver();

  function A({
    rep,
    val,
    res,
  }: {
    rep: Replicache | null | undefined;
    val: string;
    res: () => void;
  }) {
    const subResult = useSubscribe(
      rep,
      async () => {
        res();
        await sleep(10);
        return val;
      },
      {default: 'default', keepPreviousData: false},
    );
    return <div>{subResult}</div>;
  }

  const div = document.createElement('div');

  // First instance
  const rep1 = new Replicache({
    name: 'no-keep-prev-data-1',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  render(<A rep={rep1} val="data1" res={r1} />, div);
  expect(div.textContent).toBe('default');
  await p1;
  await sleep(20);
  expect(div.textContent).toBe('data1');

  // Switch to second instance - should reset to default immediately
  const rep2 = new Replicache({
    name: 'no-keep-prev-data-2',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  render(<A rep={rep2} val="data2" res={r2} />, div);
  expect(div.textContent).toBe('default'); // RESET to default, not 'data1'
  await p2;
  await sleep(20);
  expect(div.textContent).toBe('data2');

  await rep1.close();
  await rep2.close();
});

test('keepPreviousData: rapid dependency changes (A → B → C)', async () => {
  const {promise: pA, resolve: rA} = resolver();
  const {promise: pB, resolve: rB} = resolver();
  const {promise: pC, resolve: rC} = resolver();

  const resolvers = {a: rA, b: rB, c: rC};

  function A({
    rep,
    val,
  }: {
    rep: Replicache | null | undefined;
    val: keyof typeof resolvers;
  }) {
    const subResult = useSubscribe(
      rep,
      async () => {
        resolvers[val]();
        await sleep(30); // Longer delay to simulate slow query
        return `data-${val}`;
      },
      {default: 'default', keepPreviousData: true},
    );
    return <div>{subResult}</div>;
  }

  const div = document.createElement('div');

  const repA = new Replicache({
    name: 'rapid-change-a',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });
  const repB = new Replicache({
    name: 'rapid-change-b',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });
  const repC = new Replicache({
    name: 'rapid-change-c',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  // Render A
  render(<A rep={repA} val="a" />, div);
  await pA;
  await sleep(40);
  expect(div.textContent).toBe('data-a');

  // Rapidly switch A → B → C without waiting
  render(<A rep={repB} val="b" />, div);
  await pB; // B query starts
  render(<A rep={repC} val="c" />, div);
  await pC; // C query starts

  // Wait for all queries to potentially complete
  await sleep(100);

  // Should show C's data, not stale data from A or B
  expect(div.textContent).toBe('data-c');

  await repA.close();
  await repB.close();
  await repC.close();
});

test('keepPreviousData: previous data was null', async () => {
  const {promise: p1, resolve: r1} = resolver();
  const {promise: p2, resolve: r2} = resolver();

  function A({
    rep,
    val,
    res,
  }: {
    rep: Replicache | null | undefined;
    val: string | null;
    res: () => void;
  }) {
    const subResult = useSubscribe(
      rep,
      async () => {
        res();
        await sleep(10);
        return val;
      },
      {default: 'default', keepPreviousData: true},
    );
    return <div>{String(subResult)}</div>;
  }

  const div = document.createElement('div');

  // First instance returns null
  const rep1 = new Replicache({
    name: 'null-prev-data-1',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  render(<A rep={rep1} val={null} res={r1} />, div);
  await p1;
  await sleep(20);
  expect(div.textContent).toBe('null'); // null is valid data (not undefined)

  // Switch to second instance - should preserve null
  const rep2 = new Replicache({
    name: 'null-prev-data-2',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  render(<A rep={rep2} val="data2" res={r2} />, div);
  expect(div.textContent).toBe('null'); // PRESERVED null as previous data
  await p2;
  await sleep(20);
  expect(div.textContent).toBe('data2');

  await rep1.close();
  await rep2.close();
});

test('keepPreviousData: multiple transitions (A → B → A → null → B)', async () => {
  function A({
    rep,
    val,
    onQuery,
  }: {
    rep: Replicache | null | undefined;
    val: string;
    onQuery?: () => void;
  }) {
    const subResult = useSubscribe(
      rep,
      async () => {
        onQuery?.();
        await sleep(10);
        return val;
      },
      {default: 'default', keepPreviousData: true, dependencies: [val]},
    );
    return <div>{subResult}</div>;
  }

  const div = document.createElement('div');

  const repA = new Replicache({
    name: 'multi-transition-a',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });
  const repB = new Replicache({
    name: 'multi-transition-b',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  // Transition 1: null → A
  const {promise: p1, resolve: r1} = resolver();
  render(<A rep={repA} val="dataA" onQuery={r1} />, div);
  await p1;
  await sleep(20);
  expect(div.textContent).toBe('dataA');

  // Transition 2: A → B
  const {promise: p2, resolve: r2} = resolver();
  render(<A rep={repB} val="dataB" onQuery={r2} />, div);
  expect(div.textContent).toBe('dataA'); // Keep A's data
  await p2;
  await sleep(20);
  expect(div.textContent).toBe('dataB');

  // Transition 3: B → A (same repA but different val triggers re-subscribe via dependencies)
  const {promise: p3, resolve: r3} = resolver();
  render(<A rep={repA} val="dataA2" onQuery={r3} />, div);
  expect(div.textContent).toBe('dataB'); // Keep B's data
  await p3;
  await sleep(20);
  expect(div.textContent).toBe('dataA2');

  // Transition 4: A → null
  render(<A rep={null} val="unused" />, div);
  expect(div.textContent).toBe('dataA2'); // Keep A's data even when rep is null

  // Transition 5: null → B
  const {promise: p5, resolve: r5} = resolver();
  render(<A rep={repB} val="dataB2" onQuery={r5} />, div);
  expect(div.textContent).toBe('dataA2'); // Still keeping previous data
  await p5;
  await sleep(20);
  expect(div.textContent).toBe('dataB2');

  await repA.close();
  await repB.close();
});

test('keepPreviousData: generation counter ignores stale data', async () => {
  const queryDelays: Record<string, number> = {
    fast: 10,
    slow: 100,
  };

  const {promise: pSlow, resolve: rSlow} = resolver();
  const {promise: pFast, resolve: rFast} = resolver();

  function A({
    rep,
    speed,
  }: {
    rep: Replicache | null | undefined;
    speed: keyof typeof queryDelays;
  }) {
    const subResult = useSubscribe(
      rep,
      async () => {
        if (speed === 'slow') {
          rSlow();
        } else {
          rFast();
        }
        await sleep(queryDelays[speed]);
        return `${speed}-data`;
      },
      {default: 'default', keepPreviousData: true},
    );
    return <div>{subResult}</div>;
  }

  const div = document.createElement('div');

  const repSlow = new Replicache({
    name: 'race-condition-slow',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  const repFast = new Replicache({
    name: 'race-condition-fast',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  // Start slow query
  render(<A rep={repSlow} speed="slow" />, div);
  await pSlow; // Slow query started (will take 100ms)
  expect(div.textContent).toBe('default');

  // Immediately switch to fast query (before slow completes)
  render(<A rep={repFast} speed="fast" />, div);
  await pFast; // Fast query started (will take 10ms)

  // Wait for fast to complete
  await sleep(30);
  expect(div.textContent).toBe('fast-data');

  // Wait for slow to complete (stale subscription)
  await sleep(100);

  // Should still show fast-data, NOT slow-data
  // The generation counter should have ignored the stale slow query result
  expect(div.textContent).toBe('fast-data');

  await repSlow.close();
  await repFast.close();
});
