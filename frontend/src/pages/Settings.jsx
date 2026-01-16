import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { toast } from 'react-toastify';
import { api } from '../services/api';

export default function Settings() {
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [formData, setFormData] = useState({
    key_name: '',
    credits: 0,
    rate_per_second: 0,
    rate_limit: 100,
  });

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/keys');
      if (response.data.success) {
        setApiKeys(response.data.keys);
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
      toast.error('Failed to fetch API keys');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (key = null) => {
    if (key) {
      setEditingKey(key);
      setFormData({
        key_name: key.key_name,
        credits: key.credits,
        rate_per_second: key.rate_per_second || 0,
        rate_limit: key.rate_limit,
      });
    } else {
      setEditingKey(null);
      setFormData({
        key_name: '',
        credits: 0,
        rate_per_second: 0,
        rate_limit: 100,
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingKey(null);
  };

  const handleSave = async () => {
    try {
      if (!formData.key_name) {
        toast.error('API Key name is required');
        return;
      }

      if (editingKey) {
        const response = await api.put(`/admin/keys/${editingKey.id}`, formData);
        if (response.data.success) {
          toast.success('API key updated successfully');
          fetchApiKeys();
          handleCloseDialog();
        }
      } else {
        const response = await api.post('/admin/keys', formData);
        if (response.data.success) {
          toast.success('API key created successfully');
          fetchApiKeys();
          handleCloseDialog();
        }
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      toast.error('Failed to save API key');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this API key?')) {
      try {
        await api.delete(`/admin/keys/${id}`);
        toast.success('API key deleted successfully');
        fetchApiKeys();
      } catch (error) {
        console.error('Error deleting API key:', error);
        toast.error('Failed to delete API key');
      }
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      <Grid container spacing={3}>
        {/* Connection Settings */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Connection Settings
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Asterisk Host: localhost:8088
            </Typography>
            <Typography variant="body2" color="textSecondary">
              ARI User: admin
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Backend API: http://localhost:3000
            </Typography>
          </Paper>
        </Grid>

        {/* System Information */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              System Information
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Frontend Version: 1.0.0
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Backend Version: 1.0.0
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Billing: Per-Second (Enabled)
            </Typography>
          </Paper>
        </Grid>

        {/* API Keys Management */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">
                API Keys Management
              </Typography>
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDialog()}
              >
                Create New Key
              </Button>
            </Box>

            {loading ? (
              <Box display="flex" justifyContent="center">
                <CircularProgress />
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell><strong>Name</strong></TableCell>
                      <TableCell align="right"><strong>Credits</strong></TableCell>
                      <TableCell align="right"><strong>Rate ($/sec)</strong></TableCell>
                      <TableCell align="right"><strong>Rate Limit</strong></TableCell>
                      <TableCell align="center"><strong>Active</strong></TableCell>
                      <TableCell align="center"><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {apiKeys.map((key) => (
                      <TableRow key={key.id} hover>
                        <TableCell>{key.key_name}</TableCell>
                        <TableCell align="right">
                          ${typeof key.credits === 'number' ? key.credits.toFixed(2) : 0}
                        </TableCell>
                        <TableCell align="right">
                          ${typeof key.rate_per_second === 'number' ? key.rate_per_second.toFixed(6) : 0}
                        </TableCell>
                        <TableCell align="right">{key.rate_limit}</TableCell>
                        <TableCell align="center">
                          <Chip
                            label={key.is_active ? 'Active' : 'Inactive'}
                            color={key.is_active ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Button
                            size="small"
                            startIcon={<EditIcon />}
                            onClick={() => handleOpenDialog(key)}
                            sx={{ mr: 1 }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            startIcon={<DeleteIcon />}
                            onClick={() => handleDelete(key.id)}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>

        {/* Configuration Files Info */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Configuration Files
            </Typography>
            <Typography variant="body2" paragraph>
              • ari.conf - ARI configuration
            </Typography>
            <Typography variant="body2" paragraph>
              • pjsip.conf - SIP endpoints
            </Typography>
            <Typography variant="body2" paragraph>
              • extensions.conf - Dialplan
            </Typography>
            <Typography variant="body2" color="textSecondary">
              All configuration files are located in /etc/asterisk/
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* API Key Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingKey ? 'Edit API Key' : 'Create New API Key'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            fullWidth
            label="API Key Name"
            value={formData.key_name}
            onChange={(e) => setFormData({ ...formData, key_name: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Credits"
            type="number"
            value={formData.credits}
            onChange={(e) => setFormData({ ...formData, credits: parseFloat(e.target.value) })}
            margin="normal"
            inputProps={{ step: '0.01', min: '0' }}
          />
          <TextField
            fullWidth
            label="Rate Per Second ($)"
            type="number"
            value={formData.rate_per_second}
            onChange={(e) => setFormData({ ...formData, rate_per_second: parseFloat(e.target.value) })}
            margin="normal"
            inputProps={{ step: '0.000001', min: '0' }}
            helperText="Cost per second (e.g., 0.01 = $0.01/sec = $0.60/min)"
          />
          <TextField
            fullWidth
            label="Rate Limit (requests/min)"
            type="number"
            value={formData.rate_limit}
            onChange={(e) => setFormData({ ...formData, rate_limit: parseInt(e.target.value) })}
            margin="normal"
            inputProps={{ min: '1' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" color="primary">
            {editingKey ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
