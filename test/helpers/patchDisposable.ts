/**
 * Polyfill Symbol.dispose and Symbol.asyncDispose
 *
 * Native definitions require Node 24+
 */

/* eslint-disable @typescript-eslint/no-unnecessary-condition */

if (!Symbol.dispose) {
  Object.defineProperty(Symbol, 'dispose', {
    value: Symbol.for('Symbol.dispose'),
    writable: false,
    enumerable: false,
    configurable: false,
  })
}

if (!Symbol.asyncDispose) {
  Object.defineProperty(Symbol, 'asyncDispose', {
    value: Symbol.for('Symbol.asyncDispose'),
    writable: false,
    enumerable: false,
    configurable: false,
  })
}
