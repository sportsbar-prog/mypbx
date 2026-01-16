import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Channels from './pages/Channels';
import Endpoints from './pages/Endpoints';
import CallControl from './pages/CallControl';
import Settings from './pages/Settings';
import SystemSettings from './pages/SystemSettings';
import CallHistory from './pages/CallHistory';
import Analytics from './pages/Analytics';
import TrunkManagement from './pages/TrunkManagement';
import PJSIPConfig from './pages/PJSIPConfig';
import UserDashboard from './pages/UserDashboard';
import Dialplan from './pages/Dialplan';
import SipUsers from './pages/SipUsers';
import AsteriskControl from './pages/AsteriskControl';
import Queues from './pages/Queues';
import apiClient from './services/api';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function ProtectedRoute({ children, isAuthenticated }) {
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if token exists
    const token = localStorage.getItem('adminToken');
    if (token) {
      // Set auth header
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  if (loading) {
    return null; // or a loading spinner
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/channels" element={<Channels />} />
          <Route path="/endpoints" element={<Endpoints />} />
          <Route path="/call-control" element={<CallControl />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/system-settings" element={<SystemSettings />} />
          <Route path="/call-history" element={<CallHistory />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/trunks" element={<TrunkManagement />} />
          <Route path="/pjsip-config" element={<PJSIPConfig />} />
          <Route path="/user-dashboard" element={<UserDashboard />} />
          <Route path="/dialplan" element={<Dialplan />} />
          <Route path="/sip-users" element={<SipUsers />} />
          <Route path="/asterisk-control" element={<AsteriskControl />} />
          <Route path="/queues" element={<Queues />} />
        </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
      <ToastContainer position="bottom-right" autoClose={3000} />
    </ThemeProvider>
  );
}

export default App;
