import {
  Drawer, Box, Typography, IconButton, Divider, List, ListItem,
  ListItemText, Button, Chip, Stack, CircularProgress,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { useAppDispatch, useAppSelector } from "../../store/index.js";
import { runConfigTest, reloadApache } from "../../store/apacheSlice.js";

interface Props {
  open: boolean;
  onClose: () => void;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ApachePanel({ open, onClose }: Props) {
  const dispatch = useAppDispatch();
  const { changes, configTestOutput, configTestStatus } = useAppSelector((s) => s.apache);

  const handleConfigTest = () => { dispatch(runConfigTest()); };

  const handleReload = async () => {
    await dispatch(reloadApache());
    onClose();
  };

  const statusChip = () => {
    if (configTestStatus === "running") return <Chip icon={<CircularProgress size={12} />} label="Checking..." size="small" />;
    if (configTestStatus === "ok") return <Chip icon={<CheckCircleIcon />} label="Config OK" color="success" size="small" />;
    if (configTestStatus === "error") return <Chip icon={<ErrorIcon />} label="Config Error" color="error" size="small" />;
    return null;
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: 420, p: 0 } }}>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>Apache Changes</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Divider />

      <List dense sx={{ flex: 0 }}>
        {changes.map((c, i) => (
          <ListItem key={i} sx={{ py: 0.5 }}>
            <ListItemText
              primary={<>
                <Typography component="span" sx={{ fontFamily: "monospace", fontSize: 13 }}>{c.name}</Typography>
                <Typography component="span" sx={{ fontSize: 12, color: "text.secondary" }}> — {c.action}</Typography>
              </>}
              secondary={formatTime(c.timestamp)}
              secondaryTypographyProps={{ sx: { fontSize: 11 } }}
            />
          </ListItem>
        ))}
      </List>

      <Divider />

      <Box sx={{ px: 2, pt: 1.5, flex: 1, display: "flex", flexDirection: "column", gap: 1.5, overflow: "hidden" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="body2" fontWeight={600}>Config Check</Typography>
          {statusChip()}
        </Box>

        <Box
          component="pre"
          sx={{
            bgcolor: "#0d1117", color: "#c9d1d9", fontFamily: "monospace", fontSize: 12,
            p: 1.5, borderRadius: 1, flex: 1, overflow: "auto", minHeight: 120, maxHeight: 320,
            whiteSpace: "pre-wrap", wordBreak: "break-all", m: 0,
          }}
        >
          {configTestOutput
            ? configTestOutput
            : <span style={{ opacity: 0.4 }}>$ apachectl configtest</span>
          }
        </Box>
      </Box>

      <Box sx={{ px: 2, py: 2 }}>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button
            variant="outlined"
            size="small"
            onClick={handleConfigTest}
            disabled={configTestStatus === "running"}
          >
            {configTestStatus === "running" ? "Checking..." : "Run Config Check"}
          </Button>
          <Button
            variant="contained"
            color="success"
            size="small"
            disabled={configTestStatus !== "ok"}
            onClick={handleReload}
          >
            Reload Apache
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
