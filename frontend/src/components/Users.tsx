import { useEffect, useState } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableRow, TableCell,
  TableBody, IconButton, Tooltip, Stack, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions, TextField, Alert,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import LockResetIcon from "@mui/icons-material/LockReset";
import api from "../api/client.js";
import { useAppSelector } from "../store/index.js";

interface User {
  id: number;
  username: string;
  created_at: string;
}

export default function Users() {
  const currentUserId = useAppSelector((s) => s.auth.user as any)?.id;
  const [users, setUsers] = useState<User[]>([]);
  const [newDialog, setNewDialog] = useState(false);
  const [pwTarget, setPwTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    const res = await api.get("/users");
    setUsers(res.data);
  };
  useEffect(() => { load(); }, []);

  const clearMessages = () => { setError(null); setSuccess(null); };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>Users</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { clearMessages(); setNewDialog(true); }}>
          New User
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={clearMessages}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={clearMessages}>{success}</Alert>}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Username</TableCell>
            <TableCell>Created</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id} hover>
              <TableCell sx={{ fontFamily: "monospace" }}>
                {u.username}
                {u.id === currentUserId && (
                  <Typography component="span" sx={{ ml: 1, fontSize: 11, color: "text.secondary" }}>(you)</Typography>
                )}
              </TableCell>
              <TableCell sx={{ color: "text.secondary", fontSize: 13 }}>
                {new Date(u.created_at).toLocaleDateString("de-DE")}
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                  <Tooltip title="Change password">
                    <IconButton size="small" onClick={() => { clearMessages(); setPwTarget(u); }}>
                      <LockResetIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error"
                      disabled={u.id === currentUserId}
                      onClick={() => { clearMessages(); setDeleteTarget(u); }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <NewUserDialog open={newDialog} onClose={() => setNewDialog(false)}
        onDone={(msg) => { setSuccess(msg); load(); }} onError={setError} />

      <ChangePasswordDialog user={pwTarget} onClose={() => setPwTarget(null)}
        onDone={(msg) => { setSuccess(msg); setPwTarget(null); }} onError={setError} />

      <DeleteDialog user={deleteTarget} onClose={() => setDeleteTarget(null)}
        onDone={() => { setSuccess(`User deleted.`); setDeleteTarget(null); load(); }} onError={setError} />
    </Box>
  );
}

function NewUserDialog({ open, onClose, onDone, onError }: {
  open: boolean; onClose: () => void;
  onDone: (msg: string) => void; onError: (e: string) => void;
}) {
  const [form, setForm] = useState({ username: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  const reset = () => setForm({ username: "", password: "", confirm: "" });

  const submit = async () => {
    if (form.password !== form.confirm) { onError("Passwords don't match"); return; }
    setLoading(true);
    try {
      await api.post("/users", { username: form.username, password: form.password });
      reset(); onClose(); onDone(`User "${form.username}" created.`);
    } catch (e: any) {
      onError(e.response?.data?.error ?? e.message);
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} maxWidth="xs" fullWidth>
      <DialogTitle>New User</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField label="Username" value={form.username} autoFocus
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} fullWidth />
          <TextField label="Password" type="password" value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            fullWidth helperText="Min. 8 characters" />
          <TextField label="Confirm Password" type="password" value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} fullWidth />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={loading || !form.username || form.password.length < 8}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ChangePasswordDialog({ user, onClose, onDone, onError }: {
  user: User | null; onClose: () => void;
  onDone: (msg: string) => void; onError: (e: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => { setPassword(""); setConfirm(""); };

  const submit = async () => {
    if (!user) return;
    if (password !== confirm) { onError("Passwords don't match"); return; }
    setLoading(true);
    try {
      await api.put(`/users/${user.id}/password`, { password });
      reset(); onDone(`Password changed for "${user.username}".`);
    } catch (e: any) {
      onError(e.response?.data?.error ?? e.message);
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={!!user} onClose={() => { reset(); onClose(); }} maxWidth="xs" fullWidth>
      <DialogTitle>Change Password — {user?.username}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField label="New Password" type="password" value={password} autoFocus
            onChange={(e) => setPassword(e.target.value)} fullWidth helperText="Min. 8 characters" />
          <TextField label="Confirm Password" type="password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} fullWidth />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={loading || password.length < 8}>
          Change
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ user, onClose, onDone, onError }: {
  user: User | null; onClose: () => void;
  onDone: () => void; onError: (e: string) => void;
}) {
  const submit = async () => {
    if (!user) return;
    try {
      await api.delete(`/users/${user.id}`);
      onDone();
    } catch (e: any) {
      onError(e.response?.data?.error ?? e.message);
      onClose();
    }
  };

  return (
    <Dialog open={!!user} onClose={onClose}>
      <DialogTitle>Delete User?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          User <strong>{user?.username}</strong> will be permanently deleted.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" onClick={submit}>Delete</Button>
      </DialogActions>
    </Dialog>
  );
}
