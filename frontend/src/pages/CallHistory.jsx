import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  TextField,
  Select,
  MenuItem,
  Pagination,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import { api } from '../services/api';
import { toast } from 'react-toastify';

export default function CallHistory() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });
  const pageSize = 50;

  useEffect(() => {
    loadCallHistory();
  }, [page, filters]);

  const loadCallHistory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        pageSize,
      });

      if (filters.search) params.append('search', filters.search);
      if (filters.status) params.append('status', filters.status);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);

      const response = await api.get(`/admin/call-history?${params}`);

      if (response.data.success) {
        setCalls(response.data.calls || []);
        if (response.data.pagination) {
          setTotalPages(response.data.pagination.totalPages);
        }
      }
    } catch (error) {
      console.error('Failed to load call history:', error);
      toast.error('Failed to load call history');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field) => (event) => {
    setFilters({
      ...filters,
      [field]: event.target.value,
    });
    setPage(1);
  };

  const handleSearch = () => {
    setPage(1);
    loadCallHistory();
  };

  const handleExport = async () => {
    try {
      const response = await api.get('/admin/call-history/export', {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `call-history-${new Date().getTime()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentChild.removeChild(link);
      toast.success('Call history exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export call history');
    }
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
        return 'info';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Call History
      </Typography>

      {/* Filters */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 2 }}>
          <TextField
            label="Search Call ID or Number"
            size="small"
            value={filters.search}
            onChange={handleFilterChange('search')}
            fullWidth
          />

          <Select
            label="Status"
            size="small"
            value={filters.status}
            onChange={handleFilterChange('status')}
          >
            <MenuItem value="">All Status</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="answered">Answered</MenuItem>
            <MenuItem value="failed">Failed</MenuItem>
            <MenuItem value="no-answer">No Answer</MenuItem>
            <MenuItem value="ringing">Ringing</MenuItem>
          </Select>

          <TextField
            label="From Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filters.dateFrom}
            onChange={handleFilterChange('dateFrom')}
          />

          <TextField
            label="To Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filters.dateTo}
            onChange={handleFilterChange('dateTo')}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="contained" startIcon={<SearchIcon />} onClick={handleSearch}>
            Search
          </Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}>
            Export CSV
          </Button>
        </Box>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Table>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell>Call ID</TableCell>
                  <TableCell>API Key</TableCell>
                  <TableCell>Number</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>AMD Result</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Cost</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {calls.length > 0 ? (
                  calls.map((call) => (
                    <TableRow key={call.id}>
                      <TableCell sx={{ fontSize: '0.85rem' }} title={call.call_id}>
                        {call.call_id ? call.call_id.substring(0, 20) + '...' : 'N/A'}
                      </TableCell>
                      <TableCell>{call.api_key_name || 'Unknown'}</TableCell>
                      <TableCell>{call.number || 'N/A'}</TableCell>
                      <TableCell>
                        <Chip
                          label={call.status || 'N/A'}
                          color={getStatusColor(call.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{call.amd_status || 'N/A'}</TableCell>
                      <TableCell>
                        {call.bill_seconds ? `${call.bill_seconds}s` : (call.call_duration_seconds ? `${Math.round(call.call_duration_seconds)}s` : 'N/A')}
                      </TableCell>
                      <TableCell>
                        ${call.bill_cost ? parseFloat(call.bill_cost).toFixed(6) : '0.00'}
                      </TableCell>
                      <TableCell>{call.created_at ? new Date(call.created_at).toLocaleString() : 'N/A'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan="8" align="center">
                      No calls found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <Pagination count={totalPages} page={page} onChange={(e, value) => setPage(value)} />
              </Box>
            )}
          </>
        )}
      </TableContainer>
    </Box>
  );
}
