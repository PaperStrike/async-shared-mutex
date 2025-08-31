import { defer } from '../utils/ponyfill'

/**
 * A disposable that releases the lock (shared or exclusive) when disposed.
 */
export class LockHandle implements Disposable {
  public constructor(
    public release: () => void,
  ) {}

  public [Symbol.dispose]() {
    this.release()
  }
}

/**
 * A promise that resolves to a LockHandle once the lock is actually acquired.
 */
type LockPromise = Promise<LockHandle>

/**
 * A promise that resolves when the corresponding LockHandle is disposed (released).
 * It never rejects.
 */
type ReleasePromise = Promise<void>

/**
 * Read/write style mutex with:
 *  - `lock()` / `tryLock()` for exclusive ownership
 *  - `lockShared()` / `tryLockShared()` for shared ownership
 *
 * Lifecycle:
 *  - Exclusive lock waits for all previously outstanding locks (shared or exclusive) to release before acquiring.
 *  - New shared locks can start if no exclusive is active or pending ahead of them.
 */
export default class SharedMutex {
  /** The last exclusive holder (serializes exclusives) */
  protected exclusiveTail: ReleasePromise = Promise.resolve()

  /** The current shared cohort array */
  protected sharedGroup: ReleasePromise[] = []

  /** Total outstanding locks (both already delivered handles and those internally reserved/pending) */
  protected lockCount = 0

  public lock(): LockPromise {
    // If there are shared holders batched, drain (wait for) them before this exclusive.
    if (this.sharedGroup.length > 0) {
      this.exclusiveTail = Promise.all(this.sharedGroup).then(() => undefined)
      this.sharedGroup = []
    }

    const [lockPromise, releasePromise] = this.createPendingLock()
    this.exclusiveTail = releasePromise
    return lockPromise
  }

  public tryLock(): LockHandle | null {
    if (this.lockCount > 0) {
      return null
    }

    const [handle, releasePromise] = this.createAcquiredLock()
    this.exclusiveTail = releasePromise
    return handle
  }

  public lockShared(): LockPromise {
    const [lockPromise, releasePromise] = this.createPendingLock()
    this.sharedGroup.push(releasePromise)
    return lockPromise
  }

  public tryLockShared(): LockHandle | null {
    // If lockCount exceeds sharedGroup length, an exclusive lock is active (or already queued).
    if (this.lockCount > this.sharedGroup.length) {
      return null
    }

    const [handle, releasePromise] = this.createAcquiredLock()
    this.sharedGroup.push(releasePromise)
    return handle
  }

  /**
   * Returns a pair:
   *  - lockPromise: resolves to a LockHandle after prior exclusives finish.
   *  - releasePromise: resolves when that handle is disposed.
   */
  protected createPendingLock(): [lockPromise: LockPromise, releasePromise: ReleasePromise] {
    const { promise: lockPromise, resolve: resolveLock } = defer<LockHandle>()
    const [handle, releasePromise] = this.createAcquiredLock()

    // Chain acquisition after current exclusive tail completes.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.exclusiveTail.then(() => {
      resolveLock(handle)
    })

    return [lockPromise, releasePromise]
  }

  /**
   * Immediately acquires a lock (increments lockCount) and returns:
   *  - handle: the LockHandle that releases the lock when disposed
   *  - releasePromise: resolves when handle is disposed
   */
  protected createAcquiredLock(): [handle: LockHandle, releasePromise: ReleasePromise] {
    const { promise: releasePromise, resolve: resolveRelease } = defer()

    let hasReleased = false
    this.lockCount++

    const release = () => {
      if (hasReleased) return
      hasReleased = true
      this.lockCount--

      resolveRelease()
    }

    return [
      new LockHandle(release),
      releasePromise,
    ]
  }
}
