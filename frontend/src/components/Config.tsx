import { useEffect, useState } from "react";
import {
  Box, Typography, Card, CardContent, TextField, Button,
  Alert, LinearProgress, Divider,
} from "@mui/material";
import api from "../api/client.js";

export default function Config() {
  const [gitSshKey, setGitSshKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/config").then((r) => {
      setGitSshKey(r.data.git?.ssh_key ?? "");
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSuccess(null);
    setError(null);
    try {
      await api.put("/config", { git: { ssh_key: gitSshKey } });
      setSuccess("Configuration saved.");
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>Configuration</Typography>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      <Card variant="outlined" sx={{ maxWidth: 520 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} mb={0.5}>Git</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            SSH private key used for cloning and pulling from private repositories (git@...).
            The key must be accessible by the agent process (runs as root).
          </Typography>
          <TextField
            label="SSH Private Key Path"
            value={gitSshKey}
            onChange={(e) => setGitSshKey(e.target.value)}
            fullWidth
            placeholder="/root/.ssh/id_ed25519"
            helperText="Leave empty to use the system default or the path set in config.yaml"
            disabled={loading}
          />
        </CardContent>
      </Card>

      <Box mt={2}>
        <Button variant="contained" onClick={save} disabled={saving || loading}>
          Save
        </Button>
      </Box>
    </Box>
  );
}
