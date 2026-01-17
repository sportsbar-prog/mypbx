import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  Button,
  Chip,
  CircularProgress,
  TextField,
  Pagination,
} from '@mui/material';
import CoinIcon from '@mui/icons-material/AttachMoney';
import PhoneIcon from '@mui/icons-material/Phone';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PercentIcon from '@mui/icons-material/Percent';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import LogoutIcon from '@mui/icons-material/Logout';
import { api } from '../services/api';
import { toast } from 'react-toastify';

export default function UserDashboard() {
  const [stats, setStats] = useState({
    totalCredits: 0,
    callsToday: 0,
    successfulCallsToday: 0,
    successRate: 0,
    callsThisWeek: 0,
  });
  const [recentCalls, setRecentCalls] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [statusFilter, setStatusFilter] = useState('');
  const [callsPage, setCallsPage] = useState(1);
  const [totalCallsPages, setTotalCallsPages] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (activeTab === 'calls') {
      loadCallLogs();
    }
  }, [statusFilter, callsPage, activeTab]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const response = await api.get('/dashboard');

      if (response.data.success) {
        setStats(response.data.stats);
        setRecentCalls(response.data.recent_calls || []);
      } else {
        toast.error(response.data.error || 'Failed to load dashboard');
      }
    } catch (error) {
      console.error('Dashboard error:', error);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadCallLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: callsPage,
        page_size: pageSize,
        ...(statusFilter && { status: statusFilter })
      });
      const response = await api.get(`/call-logs?${params}`);

      if (response.data.success) {
        setCallLogs(response.data.logs || []);
        const totalPages = Math.ceil(response.data.total_count / pageSize);
        setTotalCallsPages(totalPages);
      }
    } catch (error) {
      console.error('Call logs error:', error);
      toast.error('Failed to load call logs');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('userApiKey');
    window.location.reload();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
      case 'answered':
        return 'success';
      case 'failed':
        return 'error';
      case 'no-answer':
        return 'warning';
      default:
        return 'default';
    }
  };

  const StatCard = ({ icon: Icon, title, value, color }) => (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="textSecondary" variant="body2" sx={{ mb: 1 }}>
              {title}
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
              {value}
            </Typography>
          </Box>
          <Icon sx={{ fontSize: 40, color }} />
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">API User Dashboard</Typography>
        <Button variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={handleLogout}>
          Logout
        </Button>
      </Box>

      {activeTab === 'overview' && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                icon={CoinIcon}
                title="Available Credits"
                value={stats.totalCredits?.toLocaleString() || '0'}
                color="#3498db"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                icon={PhoneIcon}
                title="Calls Today"
                value={stats.callsToday || '0'}
                color="#27ae60"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                icon={CheckCircleIcon}
                title="Successful Today"
                value={stats.successfulCallsToday || '0'}
                color="#f39c12"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                icon={PercentIcon}
                title="Success Rate"
                value={`${stats.successRate || 0}%`}
                color="#9b59b6"
              />
            </Grid>
            <Grid item xs={12}>
              <StatCard
                icon={CalendarTodayIcon}
                title="Calls This Week"
                value={stats.callsThisWeek || '0'}
                color="#1abc9c"
              />
            </Grid>
          </Grid>

          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Recent Calls</Typography>
              <Button size="small" onClick={loadDashboard} disabled={loading}>
                Refresh
              </Button>
            </Box>

            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                    <TableRow>
                      <TableCell>Call ID</TableCell>
                      <TableCell>Number</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>AMD Status</TableCell>
                      <TableCell>Duration</TableCell>
                      <TableCell>Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentCalls && recentCalls.length > 0 ? (
                      recentCalls.map((call) => (
                        <TableRow key={call.id}>
                          <TableCell sx={{ fontSize: '0.85rem' }} title={call.call_id}>
                            {call.call_id ? call.call_id.substring(0, 15) + '...' : 'N/A'}
                          </TableCell>
                          <TableCell>{call.number || 'N/A'}</TableCell>
                          <TableCell>
                            <Chip label={call.status || 'N/A'} color={getStatusColor(call.status)} size="small" />
                          </TableCell>
                          <TableCell>{call.amd_status || 'N/A'}</TableCell>
                          <TableCell>{call.duration ? `${call.duration}s` : 'N/A'}</TableCell>
                          <TableCell>{call.created_at ? new Date(call.created_at).toLocaleString() : 'N/A'}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan="6" align="center">
                          No recent calls
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </>
      )}

      {activeTab === 'calls' && (
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">Call Logs</Typography>
            <Select
              size="small"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCallsPage(1);
              }}
              sx={{ width: 200 }}
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="answered">Answered</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
              <MenuItem value="no-answer">No Answer</MenuItem>
              <MenuItem value="ringing">Ringing</MenuItem>
              <MenuItem value="in-progress">In Progress</MenuItem>
            </Select>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                    <TableRow>
                      <TableCell>Call ID</TableCell>
                      <TableCell>Number</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>AMD Status</TableCell>
                      <TableCell>Duration</TableCell>
                      <TableCell>Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {callLogs && callLogs.length > 0 ? (
                      callLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell sx={{ fontSize: '0.85rem' }} title={log.call_id}>
                            {log.call_id ? log.call_id.substring(0, 15) + '...' : 'N/A'}
                          </TableCell>
                          <TableCell>{log.number || 'N/A'}</TableCell>
                          <TableCell>
                            <Chip label={log.status || 'N/A'} color={getStatusColor(log.status)} size="small" />
                          </TableCell>
                          <TableCell>{log.amd_status || 'N/A'}</TableCell>
                          <TableCell>{log.duration ? `${log.duration}s` : 'N/A'}</TableCell>
                          <TableCell>{log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan="6" align="center">
                          No call logs found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {totalCallsPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                  <Pagination
                    count={totalCallsPages}
                    page={callsPage}
                    onChange={(e, value) => setCallsPage(value)}
                  />
                </Box>
              )}
            </>
          )}
        </Paper>
      )}

      {/* Tab Navigation */}
      <Box sx={{ display: 'flex', gap: 2, mt: 4, borderBottom: '1px solid #ddd', pb: 2 }}>
        <Button
          variant={activeTab === 'overview' ? 'contained' : 'text'}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </Button>
        <Button
          variant={activeTab === 'calls' ? 'contained' : 'text'}
          onClick={() => setActiveTab('calls')}
        >
          Call Logs
        </Button>
      </Box>
    </Box>
  );
}
