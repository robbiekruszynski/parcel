/**
 * Global hook for ending a session from the Android foreground notification.
 */

type StopHandler = () => Promise<void>;

let stopHandler: StopHandler | null = null;

export function registerSessionStopHandler(handler: StopHandler | null): void {
  stopHandler = handler;
}

export async function stopSessionFromNotification(): Promise<void> {
  if (stopHandler) {
    await stopHandler();
  }
}
