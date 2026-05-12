import { useState } from "react";
import { Box, Card, CardContent, TextField, Button, Typography, Alert } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAppDispatch } from "../store/index.js";
import { login } from "../store/authSlice.js";
import logo from "../assets/logo.svg";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dispatch = useAppDispatch();
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await dispatch(login({ username, password })).unwrap();
      nav("/");
    } catch {
      setError("Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <Card sx={{ width: 360 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, mb: 3 }}>
            <img src={logo} alt="" style={{ width: 32, height: 32, opacity: 0.9 }} />
            <Typography variant="h5" fontWeight={700}>Portmaster</Typography>
          </Box>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Box component="form" onSubmit={submit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)}
              fullWidth autoFocus required />
            <TextField label="Password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} fullWidth required />
            <Button type="submit" variant="contained" fullWidth disabled={loading} size="large">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
