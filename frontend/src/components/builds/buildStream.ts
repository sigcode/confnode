import { store } from "../../store/index.js";
import {
  startBuild, addLine, setQueuePosition, setBuildRunning,
  finishBuild, setQueue, QueueItem,
} from "../../store/buildSlice.js";

let controller: AbortController | null = null;

export async function runBuild(build: { id: number; name: string }) {
  controller?.abort();
  controller = new AbortController();

  try {
    // Step 1: enqueue — get run_id and queue position immediately
    const triggerRes = await fetch(`/api/builds/${build.id}/run`, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
    });
    if (!triggerRes.ok) {
      const err = await triggerRes.json().catch(() => ({ error: "trigger failed" }));
      store.dispatch(startBuild({ id: build.id, name: build.name, runId: 0, queuePosition: 0 }));
      store.dispatch(addLine(`[ERROR] ${err.error ?? "trigger failed"}`));
      store.dispatch(finishBuild("failed"));
      return;
    }
    const { run_id, position } = await triggerRes.json();

    store.dispatch(startBuild({ id: build.id, name: build.name, runId: run_id, queuePosition: position }));

    // Step 2: connect SSE stream for this run
    const res = await fetch(`/api/builds/runs/${run_id}/stream`, {
      credentials: "include",
      signal: controller.signal,
    });

    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        if (!part.startsWith("data:")) continue;
        const raw = part.replace(/^data: /, "").trim();
        try {
          const msg = JSON.parse(raw);
          if (msg.queued) store.dispatch(setQueuePosition(msg.position ?? 0));
          if (msg.running) store.dispatch(setBuildRunning());
          if (msg.line !== undefined) store.dispatch(addLine(msg.line));
          if (msg.status) store.dispatch(finishBuild(msg.status));
        } catch {}
      }
    }
  } catch (e: any) {
    if (e.name !== "AbortError") {
      store.dispatch(addLine(`[ERROR] ${e.message}`));
      store.dispatch(finishBuild("failed"));
    }
  }

  // Refresh queue state after build finishes or fails
  loadQueue();
}

export async function loadQueue() {
  try {
    const res = await fetch("/api/builds/queue", { credentials: "include" });
    if (res.ok) {
      const items: QueueItem[] = await res.json();
      store.dispatch(setQueue(items));
    }
  } catch {}
}
