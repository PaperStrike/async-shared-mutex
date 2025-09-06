import { test, expect } from '@playwright/test'
import LeakDetector from 'jest-leak-detector'
import SharedMutex, { LockHandle } from '../src/core/SharedMutex'
import './helpers/patchDisposable'

test.describe('LockHandle', () => {
  test('unlock function is called on dispose', () => {
    let unlocked = false
    {
      using _h = new LockHandle(() => {
        unlocked = true
      })
    }
    expect(unlocked).toBe(true)
  })

  test('unlock is idempotent when called or disposed multiple times', () => {
    let unlockCount = 0
    const handle = new LockHandle(() => {
      unlockCount++
    })

    handle.unlock()
    handle.unlock()
    {
      using _h1 = handle
      using _h2 = handle
    }

    expect(unlockCount).toBe(1)
  })

  test('the passed function closure is discarded after unlock', async () => {
    let obj: object | null = {}
    const detector = new LeakDetector(obj)

    // capture o in closure
    const handle = new LockHandle(((o: object) => () => void o)(obj))
    obj = null

    // Before unlock, obj is still referenced by the closure in handle
    await expect(detector.isLeaking()).resolves.toBe(true)

    handle.unlock()

    // After unlock, the closure should be discarded and obj collectible
    await expect(detector.isLeaking()).resolves.toBe(false)
  })
})

test.describe('SharedMutex', () => {
  test('basic exclusive lock via lock()', async () => {
    const mutex = new SharedMutex()
    await expect(mutex.lock()).resolves.not.toThrow()
  })
})
