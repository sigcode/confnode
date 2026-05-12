import { useEffect, useState } from "react";
import { useAppDispatch } from "../../store/index.js";
import { addChange } from "../../store/apacheSlice.js";
import {
  DialogTitle, DialogContent, DialogActions, Button, TextField,
  Box, Alert, LinearProgress, MenuItem,
} from "@mui/material";
import Editor from "@monaco-editor/react";
import api from "../../api/client.js";

const PHP_VERSIONS = ["8.4", "8.3", "8.1"];

interface Props {
  name: string;     // empty string = new vhost
  onDone: () => void;
}

export default function VhostEditor({ name, onDone }: Props) {
  const dispatch = useAppDispatch();
  const isNew = name === "";
  const [vhostName, setVhostName] = useState(name);
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [phpVersion, setPhpVersion] = useState("8.4");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew) {
      api.get(`/vhosts/${name}`).then((r) => {
        setContent(r.data.content);
        setDescription(r.data.description ?? "");
        setLoading(false);
      }).catch((e) => {
        setError(e.response?.data?.error ?? e.message);
        setLoading(false);
      });
    } else {
      setContent(DEFAULT_TEMPLATE);
    }
  }, [name, isNew]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/vhosts/${vhostName}`, { content, description });
      dispatch(addChange({ name: vhostName, action: isNew ? "created" : "config updated" }));
      onDone();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  };

  const changePhp = async () => {
    setSaving(true);
    try {
      await api.post(`/vhosts/${vhostName}/php-version`, { version: phpVersion });
      dispatch(addChange({ name: vhostName, action: "php version changed" }));
      const res = await api.get(`/vhosts/${vhostName}`);
      setContent(res.data.content);
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogTitle>{isNew ? "New Virtual Host (Expert)" : `Edit: ${name}`}</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {(loading || saving) && <LinearProgress />}
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        <Box sx={{ p: 2, display: "flex", gap: 2, alignItems: "center" }}>
          {isNew && (
            <TextField
              label="Config Name" value={vhostName} size="small"
              onChange={(e) => setVhostName(e.target.value)}
              helperText="e.g. example.com (without .conf)"
            />
          )}
          <TextField
            label="Description" value={description} size="small" sx={{ flex: 1 }}
            onChange={(e) => setDescription(e.target.value)}
          />
          {!isNew && (
            <>
              <TextField label="PHP Version" select value={phpVersion} size="small"
                onChange={(e) => setPhpVersion(e.target.value)} sx={{ width: 130 }}>
                {PHP_VERSIONS.map((v) => <MenuItem key={v} value={v}>PHP {v}</MenuItem>)}
              </TextField>
              <Button variant="outlined" size="small" onClick={changePhp} disabled={saving}>
                Switch PHP
              </Button>
            </>
          )}
        </Box>

        <Editor
          height="500px"
          language="apache"
          theme="vs-dark"
          value={content}
          onChange={(v) => setContent(v ?? "")}
          options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !vhostName || !content}>
          Save
        </Button>
      </DialogActions>
    </>
  );
}

const DEFAULT_TEMPLATE = `<VirtualHost *:80>
    ServerName example.com
    DocumentRoot /var/www/example

    <FilesMatch \\.php$>
        SetHandler "proxy:unix:/run/php/php8.4-fpm.sock|fcgi://localhost"
    </FilesMatch>

    <Directory /var/www/example>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/example-error.log
    CustomLog \${APACHE_LOG_DIR}/example-access.log combined
</VirtualHost>
`;
