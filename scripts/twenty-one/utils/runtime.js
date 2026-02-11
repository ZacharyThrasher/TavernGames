/**
 * Shared runtime helpers for async flow and non-fatal effect calls.
 */

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withWarning(context, operation, fallbackValue = undefined) {
  try {
    return await operation();
  } catch (error) {
    console.warn(`Tavern Twenty-One | ${context}:`, error);
    return fallbackValue;
  }
}

export function fireAndForget(context, operationOrPromise) {
  const promise = typeof operationOrPromise === "function"
    ? Promise.resolve().then(operationOrPromise)
    : Promise.resolve(operationOrPromise);

  void promise.catch((error) => {
    console.warn(`Tavern Twenty-One | ${context}:`, error);
  });
}
