import {expect} from '@esm-bundle/chai';
import {resolver} from '@rocicorp/resolver';
import React from 'react';
import {render} from 'react-dom';
import type {JSONValue} from 'replicache';
import {Replicache, TEST_LICENSE_KEY, WriteTransaction} from 'replicache';
import {useSubscribe} from './index';

function sleep(ms: number | undefined): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      def,
    );
    return <div>{subResult}</div>;
  }

  const div = document.createElement('div');

  render(<A key="a" rep={null} def="a" />, div);
  expect(div.textContent).to.equal('a');

  render(<A key="b" rep={undefined} def="b" />, div);
  expect(div.textContent).to.equal('b');

  const rep = new Replicache({
    name: 'null-undef-test',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      dummy: () => {},
    },
  });

  render(<A key="c" rep={rep} def="c" />, div);
  expect(div.textContent).to.equal('c');
  await promise;
  await sleep(1);
  expect(div.textContent).to.equal('hello');

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
      async tx => ((await tx.get('a')) as string | undefined) ?? null,
      null,
    );
    renderLog.push('render A', dataA);
    return <B rep={rep} dataA={dataA} />;
  }

  function B({rep, dataA}: {rep: MyRep; dataA: string | null}) {
    const dataB = useSubscribe(
      rep,
      async tx => ((await tx.get('b')) as string | undefined) ?? null,
      null,
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
  expect(renderLog).to.deep.equal(['render A', null, 'render B', null, null]);
  expect(div.innerHTML).to.equal('<div>a: </div><div>b: </div>');

  renderLog.length = 0;
  await rep.mutate.addData({a: 'a1', b: 'b2'});
  await sleep(1);
  expect(renderLog).to.deep.equal(['render A', 'a1', 'render B', 'a1', 'b2']);
  expect(div.innerHTML).to.equal('<div>a: a1</div><div>b: b2</div>');

  renderLog.length = 0;
  await rep.mutate.addData({b: 'b3'});
  await sleep(1);
  expect(renderLog).to.deep.equal(['render B', 'a1', 'b3']);
  expect(div.innerHTML).to.equal('<div>a: a1</div><div>b: b3</div>');

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
      def,
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
  expect(div.textContent).to.equal('default');
  await promise;
  await sleep(1);
  expect(div.textContent).to.equal('default');

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
  expect(div.textContent).to.equal('a');

  const rep2 = new Replicache({
    name: 'change-instance2',
    licenseKey: TEST_LICENSE_KEY,
    mutators: {},
  });

  const {promise: p2, resolve: r2} = resolver();
  render(<A rep={rep2} val="b" res={r2} />, div);
  await p2;
  await sleep(1);
  expect(div.textContent).to.equal('b');

  const {resolve: r3} = resolver();
  render(<A rep={undefined} val="c" res={r3} />, div);
  await sleep(1);
  expect(div.textContent).to.equal('');

  await rep1.close();
  await rep2.close();
});
