/**
 * Parse JSON off the main thread when possible (large per-service payloads).
 */
export function parseFeaturesJson(text: string): Promise<unknown> {
  if (typeof window === "undefined") {
    return Promise.resolve(JSON.parse(text));
  }
  if (typeof Worker === "undefined") {
    return Promise.resolve(JSON.parse(text));
  }
  return new Promise((resolve, reject) => {
    const workerUrl = new URL("/workers/features-parse.worker.js", window.location.origin);
    const worker = new Worker(workerUrl);
    const timeout = window.setTimeout(() => {
      worker.terminate();
      try {
        resolve(JSON.parse(text));
      } catch (e) {
        reject(e);
      }
    }, 120_000);
    worker.onmessage = (ev: MessageEvent<{ ok?: boolean; data?: unknown; error?: string }>) => {
      window.clearTimeout(timeout);
      worker.terminate();
      if (ev.data?.ok && ev.data.data !== undefined) {
        resolve(ev.data.data);
      } else {
        try {
          resolve(JSON.parse(text));
        } catch (e) {
          reject(new Error(ev.data?.error || "parse failed"));
        }
      }
    };
    worker.onerror = () => {
      window.clearTimeout(timeout);
      worker.terminate();
      try {
        resolve(JSON.parse(text));
      } catch (e) {
        reject(e);
      }
    };
    worker.postMessage({ text });
  });
}
