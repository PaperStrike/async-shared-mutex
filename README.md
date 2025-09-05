# async-shared-mutex

[![npm Package](https://img.shields.io/npm/v/async-shared-mutex?logo=npm "async-shared-mutex")](https://www.npmjs.com/package/async-shared-mutex)


Lightweight shared (reader) / exclusive (writer) mutex for TypeScript / ESM. Two flavors:

* `SharedMutex` – low‑level handle based API (you manage the critical section).
* `AsyncSharedMutex` – convenience API that runs a function while holding the lock.

Both support shared (concurrent) and exclusive (mutually exclusive) acquisition.

## Quick start (task style)

```ts
import { AsyncSharedMutex } from 'async-shared-mutex'

const mtx = new AsyncSharedMutex()

// Exclusive (writer)
await mtx.lock(async () => {
  // only one task may run here
  await doWrite()
})

// Shared (reader) – many may run together
const [a, b, c] = await Promise.all([
  mtx.lockShared(() => readValue('a')),
  mtx.lockShared(() => readValue('b')),
  mtx.lockShared(() => readValue('c')),
])
```

## Quick start (handle style)

```ts
import { SharedMutex } from 'async-shared-mutex'

const mtx = new SharedMutex()

// Exclusive
const exclusive = await mtx.lock()
try {
  await doWrite()
}
finally {
  exclusive.unlock()
}

// Shared
const shared = await mtx.lockShared()
try {
  const v = await readValue()
  console.log(v)
}
finally {
  shared.unlock()
}
```

### With TypeScript `using` (TS 5.2+)

```ts
import { SharedMutex } from 'async-shared-mutex'
const mtx = new SharedMutex()

async function doStuff() {
  using lock = await mtx.lock() // unlocks automatically at end of scope
  await mutate()
}
```

> If your runtime lacks native `Symbol.dispose`, add a small polyfill (see `test/helpers/patchDisposable.ts` for an example) or keep calling `unlock()` manually.

## When to use

Use for coordinating access to a resource where:

* Multiple readers may safely proceed concurrently.
* Writers need full exclusivity (no readers or other writers).
* Writers should not starve behind an ever‑arriving stream of readers.

## Semantics

* Shared acquisitions overlap with other shared acquisitions provided no earlier exclusive is pending / active.
* An exclusive waits for all currently active (or already queued *before it*) shared holders to finish, then runs alone.
* Shared acquisitions requested **after** an exclusive has queued must wait until that exclusive finishes.
* Exclusives are serialized in request order.
* Errors inside a task (or your critical section) propagate; the lock still releases.
* `try*` variants attempt an instantaneous acquisition; they return `null` if not immediately possible (no waiting side effects).

This gives predictable writer progress (no writer starvation) while still batching readers that arrive before the next writer.

## API

### `class SharedMutex`

Low level; you get handles you must release.

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `lock()` | `Promise<LockHandle>` | Await for an exclusive (writer) handle. |
| `tryLock()` | `LockHandle \| null` | Immediate exclusive attempt. `null` if busy. |
| `lockShared()` | `Promise<LockHandle>` | Await for a shared (reader) handle. |
| `tryLockShared()` | `LockHandle \| null` | Immediate shared attempt (fails if an exclusive is active/pending). |

`LockHandle`:

* `unlock(): void` – idempotent; may be called multiple times.
* `[Symbol.dispose]()` – same as `unlock()` enabling `using`.

### `class AsyncSharedMutex`

Wraps `SharedMutex` and runs a function while holding the mutex.

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `lock(task)` | `Promise<T>` | Run `task` exclusively. |
| `tryLock(task)` | `Promise<T> \| null` | Immediate exclusive attempt. If acquired, runs `task`; else `null`. |
| `lockShared(task)` | `Promise<T>` | Run `task` under a shared lock. |
| `tryLockShared(task)` | `Promise<T> \| null` | Immediate shared attempt. |

`task` signature: `() => T | PromiseLike<T>`

### Error handling

If `task` throws / rejects, the mutex is unlocked and the error is re-thrown. No additional wrapping.

### Ordering example

```txt
time →
S S S (queued)    E (queued after those S)  S S (queued after E)
|<--- overlap --->|<--- exclusive alone --->|<--- overlap --->|
```

## Patterns

Debounce writes while permitting many simultaneous reads:

```ts
const stateMtx = new AsyncSharedMutex()
let state: Data

export const readState = () => stateMtx.lockShared(() => state)
export const updateState = (patch: Partial<Data>) => stateMtx.lock(async () => {
  state = { ...state, ...patch }
})
```

Attempt a fast read path that falls back to waiting if a writer is in flight:

```ts
const mtx = new SharedMutex()

export async function getSnapshot(): Promise<Snapshot> {
  const h = mtx.tryLockShared() || await mtx.lockShared()
  try {
    return snapshot()
  }
  finally {
    h.unlock()
  }
}
```

## Target

Modern Node / browsers, ES2022.

## Limitations / Notes

* Not reentrant – calling lock methods from inside an already held lock will deadlock your logic (no detection performed).
* Fairness beyond the described ordering is not attempted (e.g. readers arriving while a long queue of writers exists will wait until those writers finish).
* No timeout / cancellation primitive provided. Compose with `AbortController` in your tasks if required.

## Comparison

| | `SharedMutex` | `AsyncSharedMutex` |
| - | - | - |
| Style | Manual handles | Higher level task runner |
| Cleanup | Call `unlock()` / `using` | Automatic around function |
| Overhead | Slightly lower | Wrapper promise per task |

## License

MIT

---

Feel free to open issues / PRs for ideas (timeouts, cancellation helpers, metrics, etc.).
