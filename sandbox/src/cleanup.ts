export async function runWithCleanup<T>(operation: () => Promise<T>, cleanup: () => Promise<void>): Promise<T> {
  try {
    return await operation();
  } finally {
    await cleanup();
  }
}
