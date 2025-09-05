import { defer } from '../utils/ponyfill'

/**
 * A disposable that unlocks the mutex (shared or exclusive) when disposed.
 */
export class LockHandle implements Disposable {
  public constructor(
    public unlock: () => void,
  ) {}

  public [Symbol.dispose]() {
    this.unlock()
  }
}

/**
 * A promise that resolves to a LockHandle once the lock is actually acquired.
 */
type LockPromise = Promise<LockHandle>

/**
 * A promise that resolves when the corresponding LockHandle is disposed (mutex unlocked).
 * It never rejects.
 */
type UnlockPromise = Promise<void>

/**
 * Read/write style mutex with:
 *  - `lock()` / `tryLock()` for exclusive ownership
 *  - `lockShared()` / `tryLockShared()` for shared ownership
 *
 * Lifecycle:
 *  - Exclusive lock waits for all previously outstanding locks (shared or exclusive) to be unlocked before acquiring.
 *  - New shared locks can start if no exclusive is active or pending ahead of them.
 */
export default class SharedMutex {
  /** The last exclusive holder (serializes exclusives) */
  protected exclusiveTail: UnlockPromise = Promise.resolve()

  /** The current shared cohort array */
  protected sharedGroup: UnlockPromise[] = []

  /** Total outstanding mutex holders (both delivered handles and pending reservations) */
  protected lockCount = 0

  public lock(): LockPromise {
  // If there are shared holders batched, drain (wait for) them before this exclusive.
    if (this.sharedGroup.length > 0) {
      this.exclusiveTail = Promise.all(this.sharedGroup).then(() => undefined)
      this.sharedGroup = []
    }

    const [lockPromise, unlockPromise] = this.createPendingLock()
    this.exclusiveTail = unlockPromise
    return lockPromise
  }

  public tryLock(): LockHandle | null {
    if (this.lockCount > 0) {
      return null
    }

    const [handle, unlockPromise] = this.createAcquiredLock()
    this.exclusiveTail = unlockPromise
    return handle
  }

  public lockShared(): LockPromise {
    const [lockPromise, unlockPromise] = this.createPendingLock()
    this.sharedGroup.push(unlockPromise)
    return lockPromise
  }

  public tryLockShared(): LockHandle | null {
  // If lockCount exceeds sharedGroup length, an exclusive lock is active (or already queued).
    if (this.lockCount > this.sharedGroup.length) {
      return null
    }

    const [handle, unlockPromise] = this.createAcquiredLock()
    this.sharedGroup.push(unlockPromise)
    return handle
  }

  /**
   * Returns a pair:
   *  - lockPromise: resolves to a LockHandle after prior exclusives finish.
   *  - unlockPromise: resolves when that handle is disposed.
   */
  protected createPendingLock(): [lockPromise: LockPromise, unlockPromise: UnlockPromise] {
    const { promise: lockPromise, resolve: resolveLock } = defer<LockHandle>()
    const [handle, unlockPromise] = this.createAcquiredLock()

    // Chain acquisition after current exclusive tail completes.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.exclusiveTail.then(() => {
      resolveLock(handle)
    })

    return [lockPromise, unlockPromise]
  }

  /**
   * Immediately acquires the mutex (increments lockCount) and returns:
   *  - handle: the LockHandle that unlocks the mutex when disposed
   *  - unlockPromise: resolves when handle is disposed
   */
  protected createAcquiredLock(): [handle: LockHandle, unlockPromise: UnlockPromise] {
    const { promise: unlockPromise, resolve: resolveUnlock } = defer()

    let hasUnlocked = false
    this.lockCount++

    const unlock = () => {
      if (hasUnlocked) return
      hasUnlocked = true
      this.lockCount--

      resolveUnlock()
    }

    return [
      new LockHandle(unlock),
      unlockPromise,
    ]
  }
}
