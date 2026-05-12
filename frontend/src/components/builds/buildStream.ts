import { store } from "../../store/index.js";
import { startBuild, addLine, finishBuild } from "../../store/buildSlice.js";

let controller: AbortController | null = null;

export async function runBuild(build: { id: number; name: string }) {
  // Abort any previous stream
  controller?.abort();
  controller = new AbortController();

  store.dispatch(startBuild({ id: build.id, name: build.name }));

  try {
    const res = await fetch(`/api/builds/${build.id}/run`, {
      method: "POST",
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
          const { line, status } = JSON.parse(raw);
          if (line !== undefined) store.dispatch(addLine(line));
          if (status) store.dispatch(finishBuild(status));
        } catch {}
      }
    }
  } catch (e: any) {
    if (e.name !== "AbortError") {
      store.dispatch(addLine(`[ERROR] ${e.message}`));
      store.dispatch(finishBuild("failed"));
    }
  }
}
