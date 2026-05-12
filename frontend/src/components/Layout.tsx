import { useState } from "react";
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  AppBar, Toolbar, Typography, IconButton, Tooltip, Divider, Chip, Dialog,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import DnsIcon from "@mui/icons-material/Dns";
import BuildIcon from "@mui/icons-material/Build";
import PeopleIcon from "@mui/icons-material/People";
import TuneIcon from "@mui/icons-material/Tune";
import LogoutIcon from "@mui/icons-material/Logout";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import SyncIcon from "@mui/icons-material/Sync";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store/index.js";
import { logout } from "../store/authSlice.js";
import { openPanel } from "../store/buildSlice.js";
import ApachePanel from "./apache/ApachePanel.js";
import BuildLog from "./builds/BuildLog.js";

const DRAWER_WIDTH = 220;

const NAV = [
  { label: "Dashboard", icon: <DashboardIcon />, path: "/" },
  { label: "Vhosts", icon: <DnsIcon />, path: "/vhosts" },
  { label: "Builds", icon: <BuildIcon />, path: "/builds" },
  { label: "Users", icon: <PeopleIcon />, path: "/users" },
  { label: "Config", icon: <TuneIcon />, path: "/config" },
];

export default function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const apacheChanges = useAppSelector((s) => s.apache.changes);
  const activeBuild = useAppSelector((s) => s.build.active);
  const buildPanelOpen = useAppSelector((s) => s.build.panelOpen);
  const buildQueue = useAppSelector((s) => s.build.queue);
  const [apachePanelOpen, setApachePanelOpen] = useState(false);

  const handleLogout = async () => {
    await dispatch(logout());
    nav("/login");
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Typography variant="h6" fontWeight={700} letterSpacing={1}>
            Configurator
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            {activeBuild && (
              <Chip
                icon={<SyncIcon sx={(activeBuild.status === "running" || activeBuild.status === "queued") ? { animation: "spin 1s linear infinite", "@keyframes spin": { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } } } : {}} />}
                label={`Build: ${activeBuild.name}${buildQueue.filter(q => q.status === "queued").length > 0 ? ` (+${buildQueue.filter(q => q.status === "queued").length})` : ""}`}
                color={activeBuild.status === "queued" ? "warning" : activeBuild.status === "running" ? "info" : activeBuild.status === "success" ? "success" : "error"}
                size="small"
                onClick={() => dispatch(openPanel())}
                sx={{ cursor: "pointer", fontWeight: 600 }}
              />
            )}
            {apacheChanges.length > 0 && (
              <Chip
                icon={<WarningAmberIcon />}
                label={`Apache pending (${apacheChanges.length})`}
                color="warning"
                size="small"
                onClick={() => setApachePanelOpen(true)}
                sx={{ cursor: "pointer", fontWeight: 600 }}
              />
            )}
            <Typography variant="body2" sx={{ opacity: 0.7 }}>{user?.username}</Typography>
            <Tooltip title="Logout">
              <IconButton color="inherit" onClick={handleLogout} size="small">
                <LogoutIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box", pt: 8 },
        }}
      >
        <List dense>
          {NAV.map(({ label, icon, path }) => (
            <ListItemButton
              key={path}
              selected={loc.pathname === path}
              onClick={() => nav(path)}
              sx={{ borderRadius: 1, mx: 1, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{icon}</ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          ))}
        </List>
        <Divider />
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3, pt: 10, ml: `${DRAWER_WIDTH}px` }}>
        <Outlet />
      </Box>

      <ApachePanel open={apachePanelOpen} onClose={() => setApachePanelOpen(false)} />

      <Dialog open={buildPanelOpen} maxWidth="md" fullWidth>
        <BuildLog />
      </Dialog>
    </Box>
  );
}
