import { useEffect, useState } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableRow, TableCell,
  TableBody, IconButton, Tooltip, Dialog, Chip, Stack,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import HistoryIcon from "@mui/icons-material/History";
import api from "../../api/client.js";
import BuildForm from "./BuildForm.js";
import BuildLog from "./BuildLog.js";
import BuildHistory from "./BuildHistory.js";

interface Build {
  id: number;
  name: string;
  repo_url: string;
  repo_branch: string;
  deploy_path: string;
  build_key: string;
  post_command: string | null;
  has_submodules: number;
}

export default function BuildList() {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [formTarget, setFormTarget] = useState<Build | null | "new">(null);
  const [runTarget, setRunTarget] = useState<Build | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Build | null>(null);

  const load = async () => {
    const res = await api.get("/builds");
    setBuilds(res.data);
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: number) => {
    if (!confirm("Delete this build?")) return;
    await api.delete(`/builds/${id}`);
    load();
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>Builds</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormTarget("new")}>
          New Build
        </Button>
      </Box>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Repo</TableCell>
            <TableCell>Branch</TableCell>
            <TableCell>Deploy Path</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {builds.map((b) => (
            <TableRow key={b.id} hover>
              <TableCell sx={{ fontWeight: 600 }}>{b.name}</TableCell>
              <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                {b.repo_url.replace(/^https?:\/\//, "")}
              </TableCell>
              <TableCell><Chip label={b.repo_branch} size="small" variant="outlined" /></TableCell>
              <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{b.deploy_path}</TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                  <Tooltip title="Run">
                    <IconButton size="small" color="success" onClick={() => setRunTarget(b)}>
                      <PlayArrowIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="History">
                    <IconButton size="small" onClick={() => setHistoryTarget(b)}>
                      <HistoryIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => setFormTarget(b)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => remove(b.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
          {builds.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} sx={{ textAlign: "center", color: "text.secondary", py: 4 }}>
                No builds yet
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={formTarget !== null} onClose={() => setFormTarget(null)} maxWidth="sm" fullWidth>
        {formTarget !== null && (
          <BuildForm
            build={formTarget === "new" ? null : formTarget}
            onDone={() => { setFormTarget(null); load(); }}
          />
        )}
      </Dialog>

      <Dialog open={runTarget !== null} onClose={() => setRunTarget(null)} maxWidth="md" fullWidth>
        {runTarget && <BuildLog build={runTarget} onClose={() => setRunTarget(null)} />}
      </Dialog>

      <Dialog open={historyTarget !== null} onClose={() => setHistoryTarget(null)} maxWidth="md" fullWidth>
        {historyTarget && <BuildHistory build={historyTarget} onClose={() => setHistoryTarget(null)} />}
      </Dialog>
    </Box>
  );
}
