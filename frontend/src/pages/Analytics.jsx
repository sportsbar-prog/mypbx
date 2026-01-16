import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Card,
  CardContent,
  Chip,
} from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PercentIcon from '@mui/icons-material/Percent';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { api } from '../services/api';
import { toast } from 'react-toastify';

export default function Analytics() {
  const [period, setPeriod] = useState('7');
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/admin/analytics?days=${period}`);

      if (response.data.success) {
        setAnalytics(response.data);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!analytics) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Failed to load analytics data</Typography>
      </Box>
    );
  }

  const overview = analytics.overview || {};

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Analytics</Typography>
        <Select value={period} onChange={(e) => setPeriod(e.target.value)} sx={{ width: 200 }}>
          <MenuItem value="7">Last 7 Days</MenuItem>
          <MenuItem value="14">Last 14 Days</MenuItem>
          <MenuItem value="30">Last 30 Days</MenuItem>
          <MenuItem value="90">Last 90 Days</MenuItem>
        </Select>
      </Box>

      {/* Stats Grid */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            icon={PhoneIcon}
            title="Total Calls"
            value={(overview.totalCalls || 0).toLocaleString()}
            color="#3498db"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            icon={CheckCircleIcon}
            title="Completed"
            value={(overview.completedCalls || 0).toLocaleString()}
            color="#27ae60"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            icon={ErrorIcon}
            title="Failed"
            value={(overview.failedCalls || 0).toLocaleString()}
            color="#e74c3c"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            icon={PercentIcon}
            title="Success Rate"
            value={`${overview.successRate || 0}%`}
            color="#f39c12"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            icon={PersonIcon}
            title="Human Answered"
            value={(overview.humanCalls || 0).toLocaleString()}
            color="#9b59b6"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            icon={SmartToyIcon}
            title="Machine/VM"
            value={(overview.machineCalls || 0).toLocaleString()}
            color="#1abc9c"
          />
        </Grid>
      </Grid>

      {/* Status Breakdown */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Call Status Breakdown
            </Typography>
            {analytics.statusBreakdown && analytics.statusBreakdown.length > 0 ? (
              analytics.statusBreakdown.map((item) => (
                <Box key={item.status} sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">{item.status || 'Unknown'}</Typography>
                    <Typography variant="body2">
                      <strong>{item.count}</strong> ({item.percentage}%)
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      backgroundColor: '#eee',
                      borderRadius: '4px',
                      height: '20px',
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      sx={{
                        backgroundColor: '#3498db',
                        height: '100%',
                        width: `${item.percentage}%`,
                      }}
                    />
                  </Box>
                </Box>
              ))
            ) : (
              <Typography color="textSecondary">No data available</Typography>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              AMD Detection Results
            </Typography>
            {analytics.amdBreakdown && analytics.amdBreakdown.length > 0 ? (
              analytics.amdBreakdown.map((item) => (
                <Box key={item.amd_status} sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">{item.amd_status}</Typography>
                    <Typography variant="body2">
                      <strong>{item.count}</strong> ({item.percentage}%)
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      backgroundColor: '#eee',
                      borderRadius: '4px',
                      height: '20px',
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      sx={{
                        backgroundColor: '#27ae60',
                        height: '100%',
                        width: `${item.percentage}%`,
                      }}
                    />
                  </Box>
                </Box>
              ))
            ) : (
              <Typography color="textSecondary">No data available</Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Top API Keys */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Top API Keys by Usage
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell>API Key Name</TableCell>
                <TableCell align="right">Total Calls</TableCell>
                <TableCell align="right">Completed</TableCell>
                <TableCell align="right">Success Rate</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {analytics.topApiKeys && analytics.topApiKeys.length > 0 ? (
                analytics.topApiKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell>{key.name || 'Unknown'}</TableCell>
                    <TableCell align="right">{parseInt(key.total_calls).toLocaleString()}</TableCell>
                    <TableCell align="right">{parseInt(key.completed_calls).toLocaleString()}</TableCell>
                    <TableCell align="right">
                      <Chip
                        label={`${key.success_rate}%`}
                        color={parseFloat(key.success_rate) >= 50 ? 'success' : 'warning'}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan="4" align="center">
                    No data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Trunk Usage */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Trunk Usage Statistics
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell>Trunk</TableCell>
                <TableCell align="right">Total Calls</TableCell>
                <TableCell align="right">Success</TableCell>
                <TableCell align="right">Failed</TableCell>
                <TableCell align="right">Avg Response Time</TableCell>
                <TableCell>Last Used</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {analytics.trunkUsage && analytics.trunkUsage.stats && Object.entries(analytics.trunkUsage.stats).length > 0 ? (
                Object.entries(analytics.trunkUsage.stats).map(([trunk, stats]) => (
                  <TableRow key={trunk}>
                    <TableCell>{trunk}</TableCell>
                    <TableCell align="right">{stats.totalCalls || 0}</TableCell>
                    <TableCell align="right">
                      <Chip label={stats.successCalls || 0} color="success" size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <Chip label={stats.failedCalls || 0} color="error" size="small" />
                    </TableCell>
                    <TableCell align="right">
                      {stats.avgResponseTime ? Math.round(stats.avgResponseTime) + 'ms' : 'N/A'}
                    </TableCell>
                    <TableCell>{stats.lastUsed ? new Date(stats.lastUsed).toLocaleString() : 'Never'}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan="6" align="center">
                    No trunk usage data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
