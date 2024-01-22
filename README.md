# replicache-react

[![npm version](https://badge.fury.io/js/replicache-react.svg)](https://www.npmjs.com/package/replicache-react)

<br />
  <pre>npm i <a href="https://www.npmjs.com/package/replicache-react">replicache-react</a></pre>
  <br />

Provides a `useSubscribe()` hook for React which wraps Replicache's `subscribe()` method.

## API

### function useSubscribe

React hook that allows you monitor replicache changes

| Parameter        | Type                                        | Description                                                                      |
| :--------------- | :------------------------------------------ | :------------------------------------------------------------------------------- |
| `rep`            | `Replicache`                                | Replicache instance that is being monitored                                      |
| `query`          | `(tx: ReadTransaction) => Promise<R>`       | Query that retrieves data to be watched                                          |
| `options?`       | `Object \| undefined`                       | Option bag containing the named arguments listed below ⬇️                        |
| `.defaut?`       | `R \| undefined = undefined`                | Default value returned on first render _or_ whenever `query` returns `undefined` |
| `.dependencies?` | `Array<any> = []`                           | List of dependencies, query will be rerun when any of these change               |
| `.isEqual?`      | `((a: R, b: R) => boolean) = jsonDeepEqual` | Compare two returned values. Used to know whether to refire subscription.        |

## Usage

example of `useSubscribe` in todo app that is watching a specific category

```js
const {category} = props;
const todos = useSubscribe(
  replicache,
  tx => {
    return tx
      .scan({prefix: `/todo/${category}`})
      .values()
      .toArray();
  },
  {
    default: [],
    dependencies: [category],
  },
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

### 5.0.1

Change package to pure ESM. See See https://github.com/rocicorp/replicache-react/pull/61 for more information.

### 5.0.0

Add support for custom `isEqual`. See https://github.com/rocicorp/replicache-react/pull/59 for more information.

### 4.0.1

Removes `def` from default dependencies. This is how it was before 0.4.0. Including by default makes it very easy to accidentally trigger render loops. People can added it explicitly if they really want.

### 4.0.0

This release changes the semantics of `def` slightly. In previous releases, `def` was returned only until `query` returned, then `useSubscribe` returns `query`'s result. Now, `def` is returned initially, but also if `query` returns `undefined`.

This is an ergonomic benefit because it avoids having to type the default in two places. Before:

```ts
useSubscribe(r, tx => (await tx.get('count')) ?? 0, 0);
```

now:

```ts
useSubscribe(r, tx => tx.get('count'), 0);
```
