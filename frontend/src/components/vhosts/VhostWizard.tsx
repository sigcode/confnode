import { useState } from "react";
import {
  DialogTitle, DialogContent, DialogActions, Button, TextField,
  MenuItem, FormControlLabel, Checkbox, Box, Typography, Alert,
  LinearProgress,
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
    ssl: false,
  });
  const [sslLog, setSslLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "ssl">("form");

  const set = (k: string) => (e: any) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

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

      // Enable site automatically
      await api.post(`/vhosts/${name}/toggle`, { enabled: true });

      if (form.ssl) {
        setStep("ssl");
        setSslLog(["Requesting SSL certificate..."]);
        const response = await fetch(`/api/vhosts/${name}/ssl`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: form.domain }),
          credentials: "include",
        });
        const reader = response.body!.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = dec.decode(value);
          const lines = text.split("\n").filter((l) => l.startsWith("data:"));
          for (const line of lines) {
            const data = JSON.parse(line.replace("data: ", ""));
            if (data.line === "[DONE]") break;
            setSslLog((prev) => [...prev, data.line]);
          }
        }
      }

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

        {step === "form" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField label="Domain" value={form.domain} onChange={set("domain")}
              placeholder="example.com" fullWidth required />
            <TextField label="Document Root" value={form.path} onChange={set("path")}
              placeholder="/var/www/mysite" fullWidth required />
            <TextField label="PHP Version" select value={form.phpVersion} onChange={set("phpVersion")} fullWidth>
              {PHP_VERSIONS.map((v) => (
                <MenuItem key={v} value={v}>PHP {v}</MenuItem>
              ))}
            </TextField>
            <TextField label="Description (optional)" value={form.description}
              onChange={set("description")} fullWidth />
            <FormControlLabel
              control={<Checkbox checked={form.ssl} onChange={set("ssl")} />}
              label="Issue SSL certificate via Certbot"
            />
          </Box>
        )}

        {step === "ssl" && (
          <Box sx={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap",
            bgcolor: "grey.900", color: "grey.100", p: 2, borderRadius: 1, maxHeight: 300, overflow: "auto" }}>
            {sslLog.join("\n")}
          </Box>
        )}
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
