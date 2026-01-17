import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PhoneIcon from '@mui/icons-material/Phone';
import DevicesIcon from '@mui/icons-material/Devices';
import CallIcon from '@mui/icons-material/Call';
import SettingsIcon from '@mui/icons-material/Settings';
import BuildIcon from '@mui/icons-material/Build';
import HistoryIcon from '@mui/icons-material/History';
import BarChartIcon from '@mui/icons-material/BarChart';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import CodeIcon from '@mui/icons-material/Code';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import PersonIcon from '@mui/icons-material/Person';
import TerminalIcon from '@mui/icons-material/Terminal';
import GroupWorkIcon from '@mui/icons-material/GroupWork';

const drawerWidth = 240;

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { text: 'Channels', icon: <PhoneIcon />, path: '/channels' },
  { text: 'Endpoints', icon: <DevicesIcon />, path: '/endpoints' },
  { text: 'Call Control', icon: <CallIcon />, path: '/call-control' },
  { text: 'Call History', icon: <HistoryIcon />, path: '/call-history' },
  { text: 'Analytics', icon: <BarChartIcon />, path: '/analytics' },
  { divider: true, section: 'Asterisk Control' },
  { text: 'Dialplan Editor', icon: <AccountTreeIcon />, path: '/dialplan' },
  { text: 'SIP Users', icon: <PersonIcon />, path: '/sip-users' },
  { text: 'Queues', icon: <GroupWorkIcon />, path: '/queues' },
  { text: 'Asterisk CLI', icon: <TerminalIcon />, path: '/asterisk-control' },
  { divider: true, section: 'Configuration' },
  { text: 'SIP Trunks', icon: <NetworkCheckIcon />, path: '/trunks' },
  { text: 'PJSIP Config', icon: <CodeIcon />, path: '/pjsip-config' },
  { text: 'API Keys', icon: <SettingsIcon />, path: '/settings' },
  { text: 'System Settings', icon: <BuildIcon />, path: '/system-settings' },
  { text: 'User Dashboard', icon: <DashboardIcon />, path: '/user-dashboard' },
];

export default function Layout({ children, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsername');
    if (onLogout) {
      onLogout();
    }
    navigate('/login');
  };

  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          Asterisk GUI
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item, index) => {
          if (item.divider) {
            return (
              <React.Fragment key={`divider-${index}`}>
                <Divider sx={{ my: 1 }} />
                {item.section && (
                  <ListItem>
                    <ListItemText 
                      primary={item.section} 
                      primaryTypographyProps={{ 
                        variant: 'caption',
                        color: 'text.secondary',
                        fontWeight: 'bold'
                      }} 
                    />
                  </ListItem>
                )}
              </React.Fragment>
            );
          }
          return (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Asterisk PBX Management
          </Typography>
          <IconButton
            color="inherit"
            aria-label="logout"
            onClick={handleLogout}
            title="Logout"
          >
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
