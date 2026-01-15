# replicache-react

[![npm version](https://badge.fury.io/js/replicache-react.svg)](https://www.npmjs.com/package/replicache-react)

<br />
  <pre>npm i <a href="https://www.npmjs.com/package/replicache-react">replicache-react</a></pre>
  <br />

Provides a `useSubscribe()` hook for React which wraps Replicache's `subscribe()` method.

## API

### function useSubscribe

React hook that allows you monitor replicache changes

| Parameter            | Type                                        | Description                                                                                                       |
| :------------------- | :------------------------------------------ | :---------------------------------------------------------------------------------------------------------------- |
| `rep`                | `Replicache`                                | Replicache instance that is being monitored                                                                       |
| `query`              | `(tx: ReadTransaction) => Promise<R>`       | Query that retrieves data to be watched                                                                           |
| `options?`           | `Object \| undefined`                       | Option bag containing the named arguments listed below ⬇️                                                         |
| `.default?`          | `R \| undefined = undefined`                | Default value returned on first render _or_ whenever `query` returns `undefined`                                  |
| `.dependencies?`     | `Array<any> = []`                           | List of dependencies, query will be rerun when any of these change                                                |
| `.isEqual?`          | `((a: R, b: R) => boolean) = jsonDeepEqual` | Compare two returned values. Used to know whether to refire subscription.                                         |
| `.keepPreviousData?` | `boolean = true`                            | Preserves previous data during dependency transitions to eliminate UI flash. Set to `false` to reset immediately. |

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

## `keepPreviousData` Option

The `keepPreviousData` option (default: `true`) eliminates UI flash when navigating between views with different subscription dependencies.

### The Problem

When switching between subscriptions (e.g., navigating between categories), the hook traditionally resets to `undefined` or the default value, causing a brief flash of empty content before new data loads:

```
User switches from category "work" to "personal":
1. Hook unsubscribes from "work" → returns default: []
2. UI renders empty list (FLASH!)
3. New subscription fires with "personal" data
4. UI renders "personal" todos
```

### The Solution

With `keepPreviousData: true` (default), the hook preserves the previous subscription's data while the new subscription initializes:

```
User switches from category "work" to "personal":
1. Hook unsubscribes from "work" → KEEPS "work" data displayed
2. New subscription fires with "personal" data
3. UI renders "personal" todos (seamless transition)
```

### Disabling

Set `keepPreviousData: false` if you want to show the default value during transitions:

```typescript
const todos = useSubscribe(rep, tx => getTodosByCategory(tx, category), {
  default: [],
  dependencies: [category],
  keepPreviousData: false, // Show [] during category switch
});
```

## Changelog

### 6.1.0

- Add `keepPreviousData` option (default: `true`) to eliminate UI flash during subscription transitions
- Add generation counter to prevent stale subscription callbacks from updating state
- Add isMounted guard to prevent setState after component unmount
- Improve error isolation in batched callbacks
- Add comprehensive JSDoc documentation

### 6.0.0

Remove `unstable_batchedUpdates` - no longer needed with React 19's automatic batching.
Requires React 19+. See https://react.dev/blog/2024/12/05/react-19

### 5.0.1

Change package to pure ESM. See https://github.com/rocicorp/replicache-react/pull/61 for more information.

### 5.0.0

- Add support for custom `isEqual`. See https://github.com/rocicorp/replicache-react/pull/59 for more information.
- Requires Replicache 14.

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

### 3.1.0

Support a new generic form of `ReadTransaction`. New Replicaches and Reflects have `tx.get<T>` and `tx.scan<T>`. This update adds support for these to `replicache-react`. See: https://github.com/rocicorp/replicache-react/pull/55

### 3.0.0

Support (and require) Replicache 13.

### 2.11.0

When changing the value of `r` passed in, return the `def` value again, until the new subscription fires. See: https://github.com/rocicorp/replicache-react/commit/369d7513b09f48598db338c6776a9a22c7198e5c
