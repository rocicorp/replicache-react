# replicache-react

[![npm version](https://badge.fury.io/js/replicache-react.svg)](https://www.npmjs.com/package/replicache-react)

<br />
  <pre>npm i <a href="https://www.npmjs.com/package/replicache-react">replicache-react</a></pre>
  <br />

Build your UI using `subscribe()` (or `useSubscribe` in React).
Whenever the data in Replicache changes — either due to changes in this tab, another tab, or on the server — the affected UI automatically updates. <br />
Replicache only refires subscriptions when the query results have actually changed, eliminating wasteful re-renders.


## API

### function useSubscribe

React hook that allows you monitor replicache changes

| Parameter | Type | Description |
| :-- | :-- | :-- |
| `rep` | Replicache | Replicache instance that is being monitored |
| `query` | (tx: ReadTransaction) => Promise<R> | Query that retrieves data to be watched |
| `def` | R |  default value returned on first render *or* whenever `query` returns `undefined` |
| `deps` | Array<any> = [] | OPTIONAL: list of dependencies, query will be rerun when any of these change |

## Usage

example of `useSubscribe` in todo app that is watching a specific category

```js
const {category} = props
const todos = useSubscribe(
    replicache, 
    tx => tx.scan({prefix: `/todo/${category}`}).values().toArray(), 
    [], 
    [category]
);

return (
  <ul>
    {todos.map(t => (
      <li>{t.title}</li>
    ))}
  </ul>
);
```

## Changelog

### 0.4.0

This release changes the semantics of `def` slightly. In previous releases, `def` was returned only until `query` returned, then `useSubscribe` returns `query`'s result. Now, `def` is returned initially, but also if `query` returns `undefined`.

This is an ergonomic benefit because it avoids having to type the default in two places. Before:

```ts
useSubscribe(r, tx => (await tx.get("count")) ?? 0, 0)
```

now:

```ts
useSubscribe(r, tx => tx.get("count"), 0)
```
