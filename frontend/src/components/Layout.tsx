import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  AppBar, Toolbar, Typography, IconButton, Tooltip, Divider,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import DnsIcon from "@mui/icons-material/Dns";
import BuildIcon from "@mui/icons-material/Build";
import LogoutIcon from "@mui/icons-material/Logout";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store/index.js";
import { logout } from "../store/authSlice.js";

const DRAWER_WIDTH = 220;

const NAV = [
  { label: "Dashboard", icon: <DashboardIcon />, path: "/" },
  { label: "Vhosts", icon: <DnsIcon />, path: "/vhosts" },
  { label: "Builds", icon: <BuildIcon />, path: "/builds" },
];

export default function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);

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
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
    </Box>
  );
}
