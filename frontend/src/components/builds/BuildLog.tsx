import { useEffect, useRef } from "react";
import {
  DialogTitle, DialogContent, DialogActions, Button, Box,
  LinearProgress, Chip, Typography,
} from "@mui/material";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
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

  const done = active.status === "success" || active.status === "failed";
  const queued = active.status === "queued" || active.queuePosition > 0;

  const handleClose = () => {
    dispatch(closePanel());
    if (done) dispatch(clearBuild());
  };

  return (
    <>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        Build: {active.name}
        {queued && <Chip label={`queued · position ${active.queuePosition}`} color="warning" size="small" />}
        {!queued && active.status === "running" && <Chip label="running" color="info" size="small" />}
        {active.status === "success" && <Chip label="success" color="success" size="small" />}
        {active.status === "failed" && <Chip label="failed" color="error" size="small" />}
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {!done && !queued && <LinearProgress />}

        {queued ? (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, gap: 2, p: 4 }}>
            <HourglassEmptyIcon sx={{ fontSize: 48, color: "warning.main", opacity: 0.7 }} />
            <Typography variant="h6" color="text.secondary">
              Waiting in queue — position {active.queuePosition}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {active.queuePosition === 1 ? "1 build running ahead of this" : `${active.queuePosition - 1} builds ahead`}
            </Typography>
          </Box>
        ) : (
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
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>
          {done ? "Close" : "Hide (runs in background)"}
        </Button>
      </DialogActions>
    </>
  );
}
