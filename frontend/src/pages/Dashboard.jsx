import React, { useState, useEffect } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
} from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import DevicesIcon from '@mui/icons-material/Devices';
import CallMadeIcon from '@mui/icons-material/CallMade';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { api } from '../services/api';
import socketService from '../services/socket';
import { toast } from 'react-toastify';

export default function Dashboard() {
  const [stats, setStats] = useState({
    activeChannels: 0,
    totalEndpoints: 0,
    callsToday: 0,
    systemStatus: 'Unknown',
  });
  const [asteriskInfo, setAsteriskInfo] = useState(null);
  const [callHistory, setCallHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    fetchCallHistory();
    socketService.connect();

    const unsubscribe = socketService.on('ari_event', handleAriEvent);

    return () => {
      unsubscribe();
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [channelsRes, endpointsRes, infoRes] = await Promise.all([
        api.getChannels(),
        api.getEndpoints(),
        api.getAsteriskInfo(),
      ]);

      setStats({
        activeChannels: channelsRes.data.length,
        totalEndpoints: endpointsRes.data.length,
        callsToday: 0, // This would come from a database
        systemStatus: 'Running',
      });

      setAsteriskInfo(infoRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to fetch dashboard data');
    }
  };

  const fetchCallHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await api.get('/admin/call-history?limit=10');
      if (response.data.success) {
        setCallHistory(response.data.calls || []);
      }
    } catch (error) {
      console.error('Error fetching call history:', error);
      // Don't show toast for this as it's optional
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAriEvent = (event) => {
    console.log('ARI Event:', event);
    // Update stats based on events
    if (event.type === 'StasisStart') {
      setStats((prev) => ({ ...prev, activeChannels: prev.activeChannels + 1 }));
    } else if (event.type === 'StasisEnd') {
      setStats((prev) => ({ ...prev, activeChannels: Math.max(0, prev.activeChannels - 1) }));
      // Refresh call history on new call end
      fetchCallHistory();
    }
  };

  const StatCard = ({ title, value, icon, color }) => (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography color="textSecondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4">{value}</Typography>
          </Box>
          <Box
            sx={{
              backgroundColor: color,
              borderRadius: '50%',
              width: 56,
              height: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Channels"
            value={stats.activeChannels}
            icon={<PhoneIcon />}
            color="#1976d2"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Endpoints"
            value={stats.totalEndpoints}
            icon={<DevicesIcon />}
            color="#2e7d32"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Calls Today"
            value={stats.callsToday}
            icon={<CallMadeIcon />}
            color="#ed6c02"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="System Status"
            value={stats.systemStatus}
            icon={<TrendingUpIcon />}
            color="#9c27b0"
          />
        </Grid>

        {asteriskInfo && (
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Asterisk Information
              </Typography>
              <Typography variant="body1">
                Version: {asteriskInfo.build?.version || 'Unknown'}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                System: {asteriskInfo.system?.name || 'Unknown'}
              </Typography>
            </Paper>
          </Grid>
        )}

        {/* Recent Call History with Billing */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recent Call History
            </Typography>
            {loadingHistory ? (
              <Box display="flex" justifyContent="center">
                <CircularProgress />
              </Box>
            ) : callHistory.length > 0 ? (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell><strong>Call ID</strong></TableCell>
                      <TableCell><strong>Number</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                      <TableCell align="right"><strong>Duration (sec)</strong></TableCell>
                      <TableCell align="right"><strong>Cost ($)</strong></TableCell>
                      <TableCell><strong>Time</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {callHistory.map((call) => (
                      <TableRow key={call.id} hover>
                        <TableCell sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {call.call_id}
                        </TableCell>
                        <TableCell>{call.number}</TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              color: call.status === 'completed' ? '#2e7d32' : 'inherit',
                              textTransform: 'capitalize'
                            }}
                          >
                            {call.status}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {call.bill_seconds || 0}
                        </TableCell>
                        <TableCell align="right">
                          ${typeof call.bill_cost === 'number' ? call.bill_cost.toFixed(6) : 0}
                        </TableCell>
                        <TableCell>
                          {new Date(call.created_at).toLocaleDateString()} {new Date(call.created_at).toLocaleTimeString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography variant="body2" color="textSecondary">
                No calls recorded yet
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
