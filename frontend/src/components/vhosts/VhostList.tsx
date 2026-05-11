import { useEffect, useState } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableRow, TableCell,
  TableBody, Chip, IconButton, Tooltip, Stack, Dialog,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import PowerIcon from "@mui/icons-material/Power";
import PowerOffIcon from "@mui/icons-material/PowerOff";
import api from "../../api/client.js";
import VhostWizard from "./VhostWizard.js";
import VhostEditor from "./VhostEditor.js";

interface Vhost {
  name: string;
  enabled: boolean;
  description: string | null;
}

export default function VhostList() {
  const [vhosts, setVhosts] = useState<Vhost[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);

  const load = async () => {
    const res = await api.get("/vhosts");
    setVhosts(res.data);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (name: string, enabled: boolean) => {
    await api.post(`/vhosts/${name}/toggle`, { enabled: !enabled });
    load();
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>Virtual Hosts</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setWizardOpen(true)}>
            New Vhost (Wizard)
          </Button>
          <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setEditTarget("")}>
            New (Expert)
          </Button>
        </Stack>
      </Box>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Description</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {vhosts.map((v) => (
            <TableRow key={v.name} hover>
              <TableCell sx={{ fontFamily: "monospace" }}>{v.name}</TableCell>
              <TableCell>
                <Chip
                  label={v.enabled ? "enabled" : "disabled"}
                  color={v.enabled ? "success" : "default"}
                  size="small"
                />
              </TableCell>
              <TableCell sx={{ color: "text.secondary", fontSize: 13 }}>
                {v.description ?? "—"}
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                  <Tooltip title={v.enabled ? "Disable" : "Enable"}>
                    <IconButton size="small" onClick={() => toggle(v.name, v.enabled)}>
                      {v.enabled ? <PowerOffIcon fontSize="small" /> : <PowerIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit config">
                    <IconButton size="small" onClick={() => setEditTarget(v.name)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={wizardOpen} onClose={() => setWizardOpen(false)} maxWidth="sm" fullWidth>
        <VhostWizard onDone={() => { setWizardOpen(false); load(); }} />
      </Dialog>

      <Dialog open={editTarget !== null} onClose={() => setEditTarget(null)} maxWidth="lg" fullWidth>
        {editTarget !== null && (
          <VhostEditor name={editTarget} onDone={() => { setEditTarget(null); load(); }} />
        )}
      </Dialog>
    </Box>
  );
}
