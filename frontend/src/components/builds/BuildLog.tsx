import { useEffect, useRef, useState } from "react";
import {
  DialogTitle, DialogContent, DialogActions, Button, Box,
  LinearProgress, Alert, Chip,
} from "@mui/material";

interface Build {
  id: number;
  name: string;
}

interface Props {
  build: Build;
  onClose: () => void;
}

export default function BuildLog({ build, onClose }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
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
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            if (!part.startsWith("data:")) continue;
            const raw = part.replace(/^data: /, "").trim();
            if (raw === "[DONE]") { setDone(true); continue; }
            try {
              const { line } = JSON.parse(raw);
              if (line !== undefined) setLines((l) => [...l, line]);
            } catch {}
          }
        }
      } catch (e: any) {
        if (e.name !== "AbortError") setError(e.message);
      } finally {
        setDone(true);
      }
    })();

    return () => controller.abort();
  }, [build.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        Build: {build.name}
        {!done ? (
          <Chip label="running" color="warning" size="small" />
        ) : (
          <Chip label="done" color="success" size="small" />
        )}
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {!done && <LinearProgress />}
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
        <Box
          sx={{
            fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap",
            bgcolor: "grey.950", color: "grey.100", p: 2,
            minHeight: 300, maxHeight: 500, overflow: "auto",
          }}
        >
          {lines.map((l, i) => <div key={i}>{l}</div>)}
          <div ref={bottomRef} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={!done}>Close</Button>
      </DialogActions>
    </>
  );
}
