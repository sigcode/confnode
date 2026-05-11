import { useState } from "react";
import {
  DialogTitle, DialogContent, DialogActions, Button, TextField,
  Box, Alert, LinearProgress, InputAdornment, IconButton, Tooltip,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import api from "../../api/client.js";

interface Build {
  id: number;
  name: string;
  repo_url: string;
  repo_branch: string;
  deploy_path: string;
  build_key: string;
  post_command: string | null;
}

interface Props {
  build: Build | null;
  onDone: () => void;
}

export default function BuildForm({ build, onDone }: Props) {
  const isNew = build === null;
  const [form, setForm] = useState({
    name: build?.name ?? "",
    repo_url: build?.repo_url ?? "",
    repo_branch: build?.repo_branch ?? "main",
    deploy_path: build?.deploy_path ?? "/var/www/",
    post_command: build?.post_command ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { ...form, post_command: form.post_command || undefined };
      if (isNew) {
        const res = await api.post("/builds", body);
        setSavedKey(res.data.build_key);
      } else {
        await api.put(`/builds/${build.id}`, body);
        onDone();
      }
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  };

  const webhookUrl = savedKey
    ? `${window.location.origin}/api/webhook/build/${savedKey}`
    : build?.build_key
    ? `${window.location.origin}/api/webhook/build/${build.build_key}`
    : null;

  return (
    <>
      <DialogTitle>{isNew ? "New Build" : `Edit: ${build?.name}`}</DialogTitle>
      <DialogContent>
        {saving && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {savedKey && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Build created! Webhook URL copied below.
          </Alert>
        )}

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField label="Name" value={form.name} onChange={set("name")} fullWidth required />
          <TextField label="Repository URL" value={form.repo_url} onChange={set("repo_url")}
            placeholder="https://github.com/user/repo" fullWidth required />
          <TextField label="Branch" value={form.repo_branch} onChange={set("repo_branch")} fullWidth />
          <TextField label="Deploy Path" value={form.deploy_path} onChange={set("deploy_path")}
            placeholder="/var/www/mysite" fullWidth required />
          <TextField label="Post Command (optional)" value={form.post_command}
            onChange={set("post_command")} placeholder="npm install && npm run build" fullWidth />

          {webhookUrl && (
            <TextField
              label="Webhook URL"
              value={webhookUrl}
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy">
                      <IconButton onClick={() => navigator.clipboard.writeText(webhookUrl)} size="small">
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
              fullWidth
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onDone}>
          {savedKey ? "Close" : "Cancel"}
        </Button>
        {!savedKey && (
          <Button variant="contained" onClick={save} disabled={saving || !form.name || !form.repo_url}>
            Save
          </Button>
        )}
      </DialogActions>
    </>
  );
}
