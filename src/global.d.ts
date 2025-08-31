declare global {
  function setTimeout(callback: () => void, ms: number): number
}

export {}
