import { useState } from "react";
import {
  Box, Typography, Card, CardContent, TextField, Button,
  Alert, LinearProgress,
} from "@mui/material";
import api from "../api/client.js";

export default function Settings() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) {
      setError("New passwords don't match");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await api.post("/settings/password", {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setSuccess(true);
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>Settings</Typography>
      <Card variant="outlined" sx={{ maxWidth: 420 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>Change Password</Typography>
          {loading && <LinearProgress sx={{ mb: 2 }} />}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>Password changed successfully.</Alert>}
          <Box component="form" onSubmit={submit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField label="Current Password" type="password" value={form.currentPassword}
              onChange={set("currentPassword")} fullWidth required />
            <TextField label="New Password" type="password" value={form.newPassword}
              onChange={set("newPassword")} fullWidth required inputProps={{ minLength: 8 }}
              helperText="Minimum 8 characters" />
            <TextField label="Confirm New Password" type="password" value={form.confirm}
              onChange={set("confirm")} fullWidth required />
            <Button type="submit" variant="contained" disabled={loading}>
              Change Password
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
