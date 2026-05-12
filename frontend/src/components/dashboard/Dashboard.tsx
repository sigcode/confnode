import { useEffect, useState, useCallback } from "react";
import {
  Grid, Card, CardContent, Typography, Chip, Button, Box,
  CircularProgress, Stack, Snackbar, Alert,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import api from "../../api/client.js";

interface Service {
  name: string;
  active: boolean;
  output?: string;
}

type Action = "start" | "stop" | "restart" | "reload";

const ACTIONS: Record<string, Action[]> = {
  apache2: ["start", "restart", "reload", "stop"],
  httpd: ["start", "restart", "reload", "stop"],
  mariadb: ["start", "restart", "stop"],
};
const phpFpmActions: Action[] = ["start", "restart"];

export default function Dashboard() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/dashboard/status");
      setServices(res.data.services);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 30_000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  const control = async (service: string, action: Action) => {
    setActing(`${service}-${action}`);
    try {
      const res = await api.post("/dashboard/control", { service, action });
      if (res.data?.error) setError(res.data.error);
      await fetchStatus();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message ?? "unknown error");
    } finally {
      setActing(null);
    }
  };

  const actionsFor = (name: string): Action[] => {
    if (ACTIONS[name]) return ACTIONS[name];
    if (name.includes("fpm")) return phpFpmActions;
    return [];
  };

  return (
    <Box>
      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>Dashboard</Typography>
        <Button startIcon={<RefreshIcon />} size="small" onClick={fetchStatus} disabled={loading}>
          Refresh
        </Button>
      </Box>

      {loading && services.length === 0 ? (
        <CircularProgress />
      ) : (
        <Grid container spacing={2}>
          {services.map((svc) => (
            <Grid item xs={12} sm={6} md={4} key={svc.name}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600}>{svc.name}</Typography>
                    <Chip
                      label={svc.active ? "active" : "inactive"}
                      color={svc.active ? "success" : "default"}
                      size="small"
                    />
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {actionsFor(svc.name).map((action) => {
                      const key = `${svc.name}-${action}`;
                      return (
                        <Button
                          key={action}
                          size="small"
                          variant="outlined"
                          disabled={acting === key}
                          onClick={() => control(svc.name, action)}
                        >
                          {acting === key ? <CircularProgress size={14} /> : action}
                        </Button>
                      );
                    })}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
