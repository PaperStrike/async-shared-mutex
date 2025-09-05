import SharedMutex, { type LockHandle } from './SharedMutex'

/**
 * A function to be scheduled for execution.
 */
export type Task<T> = () => (T | PromiseLike<T>)

/**
 * Read/write style mutex with:
 *  - `lock()` / `tryLock()` for exclusive ownership
 *  - `lockShared()` / `tryLockShared()` for shared ownership
 *
 * Lifecycle:
 *  - Exclusive task waits for all previously outstanding tasks (shared or exclusive) to unlock before acquiring.
 *  - New shared tasks can start if no exclusive is active or pending ahead of them.
 */
export default class AsyncSharedMutex {
  private mutex = new SharedMutex()

  public async lock<T>(task: Task<T>): Promise<T> {
    const lck = await this.mutex.lock()
    return this.run(lck, task)
  }

  public tryLock<T>(task: Task<T>): Promise<T> | null {
    const lck = this.mutex.tryLock()
    return lck !== null
      ? this.run(lck, task)
      : null
  }

  public async lockShared<T>(task: Task<T>): Promise<T> {
    const lck = await this.mutex.lockShared()
    return this.run(lck, task)
  }

  public tryLockShared<T>(task: Task<T>): Promise<T> | null {
    const lck = this.mutex.tryLockShared()
    return lck !== null
      ? this.run(lck, task)
      : null
  }

  private async run<T>(handle: LockHandle, task: Task<T>): Promise<T> {
    try {
      return await task()
    }
    finally {
      handle.unlock()
    }
  }
}
