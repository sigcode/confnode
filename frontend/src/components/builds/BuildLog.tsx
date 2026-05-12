import { useEffect, useRef } from "react";
import {
  DialogTitle, DialogContent, DialogActions, Button, Box,
  LinearProgress, Chip,
} from "@mui/material";
import { useAppSelector, useAppDispatch } from "../../store/index.js";
import { closePanel, clearBuild } from "../../store/buildSlice.js";

export default function BuildLog() {
  const dispatch = useAppDispatch();
  const { active } = useAppSelector((s) => s.build);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.lines.length]);

  if (!active) return null;

  const done = active.status !== "running";

  const handleClose = () => {
    dispatch(closePanel());
    if (done) dispatch(clearBuild());
  };

  return (
    <>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        Build: {active.name}
        {active.status === "running" && <Chip label="running" color="warning" size="small" />}
        {active.status === "success" && <Chip label="success" color="success" size="small" />}
        {active.status === "failed" && <Chip label="failed" color="error" size="small" />}
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {!done && <LinearProgress />}
        <Box
          sx={{
            fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap",
            bgcolor: "#0d1117", color: "#c9d1d9", p: 2,
            minHeight: 300, maxHeight: 500, overflow: "auto",
          }}
        >
          {active.lines.map((l, i) => <div key={i}>{l}</div>)}
          <div ref={bottomRef} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>
          {done ? "Close" : "Hide (runs in background)"}
        </Button>
      </DialogActions>
    </>
  );
}
