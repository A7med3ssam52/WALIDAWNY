/**
 * App ↔ service-worker bridge. Every call degrades gracefully: when the
 * service worker is missing or the message fails, `null`/`undefined` is
 * returned instead of throwing.
 */

/** Whether a service worker API is available in this browser context. */
export function isSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/** Resolve the active controller once the service worker is ready. */
export async function getController(): Promise<ServiceWorker | null> {
  if (!isSupported()) {
    return null;
  }
  try {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller;
  } catch {
    return null;
  }
}

const REPLY_TIMEOUT_MS = 15000;

/**
 * Post a message to the service worker over a MessageChannel and resolve with
 * the worker's reply (via the transferred port). Resolves `undefined` when no
 * worker is available or no reply arrives in time.
 */
export async function sendMessage(message: unknown): Promise<unknown> {
  const controller = await getController();
  if (!controller) {
    return undefined;
  }
  try {
    const channel = new MessageChannel();
    const reply = new Promise<unknown>((resolve) => {
      channel.port1.onmessage = (event: MessageEvent) => resolve(event.data);
      setTimeout(() => resolve(undefined), REPLY_TIMEOUT_MS);
    });
    controller.postMessage(message, [channel.port2]);
    return await reply;
  } catch {
    return undefined;
  }
}