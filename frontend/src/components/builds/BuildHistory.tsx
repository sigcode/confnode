import { useEffect, useState } from "react";
import {
  DialogTitle, DialogContent, DialogActions, Button,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, Box, Typography,
} from "@mui/material";
import api from "../../api/client.js";

interface BuildRun {
  id: number;
  status: string;
  output: string;
  started_at: string | null;
  finished_at: string | null;
}

interface Props {
  build: { id: number; name: string };
  onClose: () => void;
}

export default function BuildHistory({ build, onClose }: Props) {
  const [runs, setRuns] = useState<BuildRun[]>([]);
  const [selected, setSelected] = useState<BuildRun | null>(null);

  useEffect(() => {
    api.get(`/builds/${build.id}`).then((r) => setRuns(r.data.runs));
  }, [build.id]);

  const statusColor = (s: string) =>
    s === "success" ? "success" : s === "failed" ? "error" : "warning";

  return (
    <>
      <DialogTitle>Build History: {build.name}</DialogTitle>
      <DialogContent>
        {selected ? (
          <>
            <Button size="small" onClick={() => setSelected(null)} sx={{ mb: 1 }}>← Back</Button>
            <Box sx={{
              fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap",
              bgcolor: "grey.950", color: "grey.100", p: 2, borderRadius: 1,
              maxHeight: 400, overflow: "auto",
            }}>
              {selected.output || "(no output)"}
            </Box>
          </>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Started</TableCell>
                <TableCell>Finished</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id} hover sx={{ cursor: "pointer" }} onClick={() => setSelected(r)}>
                  <TableCell>{r.id}</TableCell>
                  <TableCell><Chip label={r.status} color={statusColor(r.status)} size="small" /></TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{r.started_at ?? "—"}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{r.finished_at ?? "—"}</TableCell>
                </TableRow>
              ))}
              {runs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ textAlign: "center", color: "text.secondary" }}>
                    No runs yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </>
  );
}
