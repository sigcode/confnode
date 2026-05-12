import { useState } from "react";
import { useAppDispatch } from "../../store/index.js";
import { addChange } from "../../store/apacheSlice.js";
import {
  DialogTitle, DialogContent, DialogActions, Button, TextField,
  MenuItem, Box, Alert, LinearProgress,
} from "@mui/material";
import api from "../../api/client.js";

const PHP_VERSIONS = ["8.4", "8.3", "8.1"];

interface Props {
  onDone: () => void;
}

export default function VhostWizard({ onDone }: Props) {
  const [form, setForm] = useState({
    domain: "",
    path: "/var/www/",
    phpVersion: "8.4",
    description: "",
  });
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string) => (e: any) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/vhosts/wizard", {
        domain: form.domain,
        path: form.path,
        phpVersion: form.phpVersion,
        description: form.description || undefined,
      });
      const { name } = res.data;
      await api.post(`/vhosts/${name}/toggle`, { enabled: true });
      dispatch(addChange({ name, action: "created" }));
      onDone();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <DialogTitle>New Virtual Host</DialogTitle>
      <DialogContent>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField label="Domain" value={form.domain} onChange={set("domain")}
            placeholder="example.sguenther.codesrv.it" fullWidth required />
          <TextField label="Document Root" value={form.path} onChange={set("path")}
            placeholder="/var/www/mysite" fullWidth required />
          <TextField label="PHP Version" select value={form.phpVersion} onChange={set("phpVersion")} fullWidth>
            {PHP_VERSIONS.map((v) => (
              <MenuItem key={v} value={v}>PHP {v}</MenuItem>
            ))}
          </TextField>
          <TextField label="Description (optional)" value={form.description}
            onChange={set("description")} fullWidth />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onDone} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={loading || !form.domain || !form.path}>
          Create
        </Button>
      </DialogActions>
    </>
  );
}
