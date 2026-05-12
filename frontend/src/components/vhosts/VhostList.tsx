import { useEffect, useState } from "react";
import { useAppDispatch } from "../../store/index.js";
import { addChange } from "../../store/apacheSlice.js";
import {
  Box, Typography, Button, Table, TableHead, TableRow, TableCell,
  TableBody, Chip, IconButton, Tooltip, Stack, Dialog,
  DialogTitle, DialogContent, DialogContentText, DialogActions,
  List, ListItem, ListItemText, CircularProgress,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PowerIcon from "@mui/icons-material/Power";
import PowerOffIcon from "@mui/icons-material/PowerOff";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import api from "../../api/client.js";
import VhostWizard from "./VhostWizard.js";
import VhostEditor from "./VhostEditor.js";

interface Vhost {
  name: string;
  enabled: boolean;
  description: string | null;
  serverName: string | null;
  hasSSL: boolean;
}

function isFqdn(s: string): boolean {
  return /^[a-z0-9._-]+\.[a-z]{2,}$/i.test(s);
}

export default function VhostList() {
  const dispatch = useAppDispatch();
  const [vhosts, setVhosts] = useState<Vhost[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [sslTarget, setSslTarget] = useState<Vhost | null>(null);
  const [sslLines, setSslLines] = useState<string[]>([]);
  const [sslRunning, setSslRunning] = useState(false);
  const [sslDone, setSslDone] = useState(false);

  const load = async () => {
    const res = await api.get("/vhosts");
    setVhosts(res.data);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (name: string, enabled: boolean) => {
    await api.post(`/vhosts/${name}/toggle`, { enabled: !enabled });
    dispatch(addChange({ name, action: enabled ? "disabled" : "enabled" }));
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await api.delete(`/vhosts/${deleteTarget}`);
    dispatch(addChange({ name: deleteTarget, action: "deleted" }));
    setDeleteTarget(null);
    load();
  };

  const openSsl = (v: Vhost) => {
    setSslTarget(v);
    setSslLines([]);
    setSslRunning(false);
    setSslDone(false);
  };

  const runSsl = () => {
    if (!sslTarget?.serverName) return;
    setSslRunning(true);
    setSslLines([]);
    const es = new EventSource(
      `${api.defaults.baseURL}/vhosts/${sslTarget.name}/ssl-stream?domain=${encodeURIComponent(sslTarget.serverName)}`
    );
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.line === "[DONE]") {
        es.close();
        setSslRunning(false);
        setSslDone(true);
        load();
      } else {
        setSslLines((l) => [...l, data.line]);
      }
    };
    es.onerror = () => {
      es.close();
      setSslRunning(false);
      setSslDone(true);
    };
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
            <TableCell>SSL</TableCell>
            <TableCell>Description</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {vhosts.map((v) => (
            <TableRow key={v.name} hover>
              <TableCell sx={{ fontFamily: "monospace" }}>
                {v.name}
                {v.serverName && (
                  <Typography variant="caption" display="block" color="text.secondary">
                    {v.serverName}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                <Chip
                  label={v.enabled ? "enabled" : "disabled"}
                  color={v.enabled ? "success" : "default"}
                  size="small"
                />
              </TableCell>
              <TableCell>
                {v.hasSSL ? (
                  <Chip icon={<LockIcon />} label="SSL" color="success" size="small" variant="outlined" />
                ) : v.serverName && isFqdn(v.serverName) ? (
                  <Chip icon={<LockOpenIcon />} label="no SSL" color="warning" size="small" variant="outlined" />
                ) : (
                  <Typography variant="caption" color="text.disabled">—</Typography>
                )}
              </TableCell>
              <TableCell sx={{ color: "text.secondary", fontSize: 13 }}>
                {v.description ?? "—"}
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                  {!v.hasSSL && v.serverName && isFqdn(v.serverName) && (
                    <Tooltip title="Get SSL certificate">
                      <IconButton size="small" color="warning" onClick={() => openSsl(v)}>
                        <LockOpenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
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
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(v.name)}>
                      <DeleteIcon fontSize="small" />
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

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Vhost löschen?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{deleteTarget}</strong> wird deaktiviert und die Config-Datei gelöscht. Nicht rückgängig machbar.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Abbrechen</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>Löschen</Button>
        </DialogActions>
      </Dialog>

      {/* SSL Dialog */}
      <Dialog open={!!sslTarget} onClose={() => !sslRunning && setSslTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>SSL certificate — {sslTarget?.serverName}</DialogTitle>
        <DialogContent>
          {sslLines.length === 0 && !sslRunning && !sslDone && (
            <DialogContentText>
              Run certbot (webroot) for <strong>{sslTarget?.serverName}</strong>. Make sure DNS points to this server and the vhost is enabled.
            </DialogContentText>
          )}
          {(sslLines.length > 0 || sslRunning) && (
            <List dense sx={{ fontFamily: "monospace", fontSize: 12, bgcolor: "grey.900", borderRadius: 1, p: 1, maxHeight: 300, overflow: "auto" }}>
              {sslLines.map((l, i) => (
                <ListItem key={i} disablePadding sx={{ py: 0 }}>
                  <ListItemText primary={l} primaryTypographyProps={{ sx: { fontFamily: "monospace", fontSize: 12, color: l.startsWith("ERROR") ? "error.main" : "text.primary" } }} />
                </ListItem>
              ))}
              {sslRunning && <ListItem disablePadding><CircularProgress size={14} sx={{ m: 1 }} /></ListItem>}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSslTarget(null)} disabled={sslRunning}>Close</Button>
          {!sslDone && (
            <Button variant="contained" onClick={runSsl} disabled={sslRunning} startIcon={<LockIcon />}>
              {sslRunning ? "Running…" : "Run certbot"}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
