import { test, expect } from '@playwright/test'
import SharedMutex from '../src/core/SharedMutex'
import './helpers/patchDisposable'

test.describe('SharedMutex', () => {
  test('basic exclusive lock via lock()', async () => {
    const mutex = new SharedMutex()
    await expect(mutex.lock()).resolves.not.toThrow()
  })
})
