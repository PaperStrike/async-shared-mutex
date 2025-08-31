import { test, expect } from '@playwright/test'
import AsyncSharedMutex from '../src/core/AsyncSharedMutex'

const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms))

test.describe('AsyncSharedMutex', () => {
  test('exclusive lock executes task and returns value', async () => {
    const mtx = new AsyncSharedMutex()
    const result = await mtx.lock(async () => {
      await delay(5)
      return 123
    })
    expect(result).toBe(123)
  })

  test('exclusive tasks do not overlap', async () => {
    const mtx = new AsyncSharedMutex()
    let concurrent = 0
    const seen: number[] = []

    const run = (id: number) => mtx.lock(async () => {
      concurrent++
      expect(concurrent).toBe(1) // must be exclusive
      seen.push(id)
      await delay(10)
      concurrent--
    })

    await Promise.all([run(1), run(2), run(3)])
    expect(seen).toEqual([1, 2, 3])
  })

  test('shared tasks overlap (concurrency > 1 at some point)', async () => {
    const mtx = new AsyncSharedMutex()
    let concurrent = 0
    let maxConcurrent = 0

    const shared = () => mtx.lockShared(async () => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await delay(20)
      concurrent--
      return concurrent
    })

    await Promise.all([shared(), shared(), shared()])
    expect(maxConcurrent).toBeGreaterThan(1)
  })

  test('exclusive waits for prior shared tasks', async () => {
    const mtx = new AsyncSharedMutex()
    let sharedCompleted = 0
    const shared = () => mtx.lockShared(async () => {
      await delay(10)
      sharedCompleted++
    })

    const sharedAll = Promise.all([shared(), shared(), shared()])

    let exclusiveRan = false
    await mtx.lock(() => {
      expect(sharedCompleted).toBe(3)
      exclusiveRan = true
    })
    await sharedAll
    expect(exclusiveRan).toBe(true)
  })

  test('shared tasks queued after an exclusive do not overlap with it', async () => {
    const mtx = new AsyncSharedMutex()
    let exclusiveActive = false
    const starts: string[] = []

    const exclusive = mtx.lock(async () => {
      exclusiveActive = true
      starts.push('exclusive-start')
      await delay(20)
      starts.push('exclusive-end')
      exclusiveActive = false
    })

    await delay(5) // ensure exclusive requested before scheduling shared

    const s1 = mtx.lockShared(() => {
      starts.push('s1')
      expect(exclusiveActive).toBe(false)
    })
    const s2 = mtx.lockShared(() => {
      starts.push('s2')
      expect(exclusiveActive).toBe(false)
    })

    await Promise.all([exclusive, s1, s2])
    // Order should have exclusive start before its end, and shared after end.
    const idxExclusiveEnd = starts.indexOf('exclusive-end')
    const idxS1 = starts.indexOf('s1')
    const idxS2 = starts.indexOf('s2')
    expect(idxExclusiveEnd).toBeLessThan(idxS1)
    expect(idxExclusiveEnd).toBeLessThan(idxS2)
  })

  test('tryLock succeeds only when free and releases automatically', async () => {
    const mtx = new AsyncSharedMutex()
    let inLock = false

    const first = mtx.tryLock(async () => {
      inLock = true
      await delay(10)
      inLock = false
      return 'held'
    })
    expect(first).not.toBeNull()

    const second = mtx.tryLock(() => 'second')
    expect(second).toBeNull() // cannot acquire while first holds

    const value = await first!
    expect(value).toBe('held')

    const third = mtx.tryLock(() => 'third')
    expect(third).not.toBeNull()
    expect(await third).toBe('third')
    expect(inLock).toBe(false)
  })

  test('tryLockShared allows multiple shared holders', async () => {
    const mtx = new AsyncSharedMutex()
    let maxConcurrent = 0
    let concurrent = 0

    const a = mtx.tryLockShared(async () => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await delay(10)
      concurrent--
      return 'a'
    })
    expect(a).not.toBeNull()
    const b = mtx.tryLockShared(async () => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await delay(10)
      concurrent--
      return 'b'
    })
    expect(b).not.toBeNull()
    await Promise.all([a!, b!])
    expect(maxConcurrent).toBeGreaterThan(1)
  })

  test('error in task still releases lock for subsequent tasks', async () => {
    const mtx = new AsyncSharedMutex()
    await expect(async () => {
      await mtx.lock(async () => {
        await delay(5)
        throw new Error('boom')
      })
    }).rejects.toThrow('boom')

    // Should be able to acquire again
    const v = await mtx.lock(() => 123)
    expect(v).toBe(123)
  })
})
