/**
 * App-wide styled dialog system.
 *
 * Replaces the bare `Alert.alert` and `window.confirm` calls scattered
 * across the app — those use the OS / browser default chrome which
 * doesn't match the Cairo / purple palette. The single host (see
 * `components/ConfirmHost.tsx`) is mounted once at the root of the
 * tree and subscribes to the events emitted by these helpers.
 *
 *   const ok = await confirmDialog({ title, message, destructive });
 *   if (ok) deleteThing();
 *
 *   await infoDialog({ title, message }); // resolves on tap
 *
 * Both helpers return a Promise so they're a drop-in replacement for
 * any flow that previously branched on the `window.confirm` boolean
 * or passed an onPress callback to `Alert.alert`.
 */

export type DialogKind = "confirm" | "alert";

export interface DialogRequest {
  id: number;
  kind: DialogKind;
  title: string;
  message?: string;
  /** Defaults to the localized "Confirm" / "OK" depending on kind. */
  confirmLabel?: string;
  /** Defaults to the localized "Cancel". Ignored for alerts. */
  cancelLabel?: string;
  /** Renders the primary button red. */
  destructive?: boolean;
  /** Internal — set by confirmDialog/infoDialog. */
  resolve: (value: boolean) => void;
}

type Listener = (req: DialogRequest | null) => void;

let listener: Listener | null = null;
let queue: DialogRequest[] = [];
let nextId = 1;

/** Called by the host on mount. Replays any queued requests. */
export function setDialogListener(fn: Listener | null): void {
  listener = fn;
  if (fn && queue.length > 0) {
    // Replay one at a time — host shows them sequentially.
    const next = queue.shift();
    if (next) fn(next);
  }
}

/** Called by the host once a request is dismissed. Drains the queue. */
export function notifyDialogClosed(): void {
  if (queue.length > 0 && listener) {
    const next = queue.shift();
    if (next) listener(next);
  } else if (listener) {
    listener(null);
  }
}

function enqueue(req: DialogRequest): void {
  if (listener) {
    listener(req);
  } else {
    // Host isn't mounted yet (very early boot). Queue and flush when
    // it subscribes.
    queue.push(req);
  }
}

export function confirmDialog(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    enqueue({ id: nextId++, kind: "confirm", ...opts, resolve });
  });
}

export function infoDialog(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
}): Promise<void> {
  return new Promise((resolve) => {
    enqueue({
      id: nextId++,
      kind: "alert",
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel,
      resolve: () => resolve(),
    });
  });
}
