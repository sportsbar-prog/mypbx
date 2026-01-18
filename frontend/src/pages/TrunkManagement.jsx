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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Chip,
  Alert,
  Grid,
  InputLabel,
  FormControl,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import { api } from '../services/api';
import { toast } from 'react-toastify';

const providerConfigs = {
  telnyx: {
    name: 'Telnyx',
    fields: ['username', 'password', 'did'],
  },
  signalwire: {
    name: 'SignalWire',
    fields: ['username', 'password', 'space_name', 'from_user'],
  },
  twilio: {
    name: 'Twilio Elastic SIP',
    fields: ['username', 'password', 'termination_uri', 'from_user'],
  },
  vonage: {
    name: 'Vonage (Nexmo)',
    fields: ['username', 'password', 'from_user'],
  },
  bandwidth: {
    name: 'Bandwidth',
    fields: ['username', 'password', 'from_user'],
  },
  voipms: {
    name: 'VoIP.ms',
    fields: ['username', 'password', 'server_location'],
  },
  flowroute: {
    name: 'Flowroute',
    fields: ['username', 'password', 'server_region', 'from_user'],
  },
  plivo: {
    name: 'Plivo',
    fields: ['username', 'password', 'from_user'],
  },
  custom_credential: {
    name: 'Custom (Credential Auth)',
    fields: ['sip_server', 'sip_port', 'username', 'password', 'from_user'],
  },
  custom_ip: {
    name: 'Custom (IP Auth)',
    fields: ['sip_server', 'sip_port', 'match_ip', 'from_user'],
  },
};

export default function TrunkManagement() {
  const [trunks, setTrunks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingTrunk, setEditingTrunk] = useState(null);
  const [formData, setFormData] = useState({
    trunk_name: '',
    provider: '',
    username: '',
    password: '',
    did: '',
    sip_server: '',
    sip_port: 5060,
    from_user: '',
    space_name: '',
    termination_uri: '',
    server_location: '',
    server_region: '',
    match_ip: '',
    context: 'internal',
    codecs: '',
    port: 5566,
    external_ip: '',
    local_net: '',
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadTrunks();
  }, []);

  const loadTrunks = async () => {
    setLoading(true);
    try {
      const response = await api.get('/trunks');

      if (response.data.success) {
        setTrunks(response.data.trunks || []);
      }
    } catch (error) {
      console.error('Failed to load trunks:', error);
      toast.error('Failed to load trunks');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (trunk = null) => {
    if (trunk) {
      setEditingTrunk(trunk);
      setFormData(trunk);
    } else {
      setEditingTrunk(null);
      setFormData({
        trunk_name: '',
        provider: '',
        username: '',
        password: '',
        did: '',
        sip_server: '',
        sip_port: 5060,
        from_user: '',
        space_name: '',
        termination_uri: '',
        server_location: '',
        server_region: '',
        match_ip: '',
        context: 'internal',
        codecs: '',
        port: 5566,
        external_ip: '',
        local_net: '',
      });
    }
    setShowAdvanced(false);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingTrunk(null);
  };

  const handleSave = async () => {
    try {
      if (!formData.trunk_name || !formData.provider) {
        toast.error('Trunk name and provider are required');
        return;
      }

      if (editingTrunk) {
        const response = await api.put(`/trunks/${editingTrunk.trunk_name}`, formData);
        if (response.data.success) {
          toast.success('Trunk updated successfully');
          loadTrunks();
          handleCloseDialog();
        }
      } else {
        const response = await api.post('/trunks', formData);
        if (response.data.success) {
          toast.success('Trunk created successfully');
          loadTrunks();
          handleCloseDialog();
        }
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error.response?.data?.error || 'Failed to save trunk configuration');
    }
  };

  const handleDelete = async (trunkName) => {
    if (!window.confirm(`Are you sure you want to delete trunk "${trunkName}"?`)) {
      return;
    }

    try {
      const response = await api.delete(`/trunks/${trunkName}`);
      if (response.data.success) {
        toast.success('Trunk deleted successfully');
        loadTrunks();
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete trunk');
    }
  };

  const handleAssign = async (trunkName) => {
    try {
      const response = await api.post('/trunks/assign', { trunk_name: trunkName });
      if (response.data.success) {
        toast.success(`Trunk "${trunkName}" assigned successfully`);
        loadTrunks();
      }
    } catch (error) {
      console.error('Assign error:', error);
      toast.error('Failed to assign trunk');
    }
  };

  const handleUnassign = async (trunkName) => {
    try {
      const response = await api.post('/trunks/unassign', { trunk_name: trunkName });
      if (response.data.success) {
        toast.success(`Trunk "${trunkName}" unassigned successfully`);
        loadTrunks();
      }
    } catch (error) {
      console.error('Unassign error:', error);
      toast.error('Failed to unassign trunk');
    }
  };

  const getProviderColor = (provider) => {
    const colors = {
      telnyx: '#00d49e',
      signalwire: '#006dff',
      twilio: '#f22f46',
      vonage: '#000000',
      bandwidth: '#00bceb',
      voipms: '#2d8cff',
      flowroute: '#ff6b00',
      plivo: '#4caf50',
    };
    return colors[provider] || '#666666';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">SIP Trunk Management</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
            Add Trunk
          </Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadTrunks}>
            Refresh
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell>Trunk Name</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Assignment</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {trunks && trunks.length > 0 ? (
                trunks.map((trunk) => (
                  <TableRow key={trunk.trunk_name}>
                    <TableCell>{trunk.trunk_name}</TableCell>
                    <TableCell>
                      <Chip
                        label={providerConfigs[trunk.provider]?.name || trunk.provider}
                        style={{
                          backgroundColor: getProviderColor(trunk.provider),
                          color: 'white',
                        }}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={trunk.status || 'Unknown'}
                        color={trunk.status === 'Registered' ? 'success' : 'error'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={trunk.isAssigned ? 'Active' : 'Inactive'}
                        color={trunk.isAssigned ? 'success' : 'warning'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<EditIcon />}
                          onClick={() => handleOpenDialog(trunk)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          variant={trunk.isAssigned ? 'outlined' : 'contained'}
                          color={trunk.isAssigned ? 'error' : 'success'}
                          onClick={() => (trunk.isAssigned ? handleUnassign(trunk.trunk_name) : handleAssign(trunk.trunk_name))}
                        >
                          {trunk.isAssigned ? 'Unassign' : 'Assign'}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => handleDelete(trunk.trunk_name)}
                        >
                          Delete
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan="5" align="center">
                    No trunks configured. Click "Add Trunk" to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Configuration Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingTrunk ? 'Edit SIP Trunk' : 'Configure New SIP Trunk'}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Trunk Name"
              fullWidth
              value={formData.trunk_name}
              onChange={(e) => setFormData({ ...formData, trunk_name: e.target.value })}
              disabled={!!editingTrunk}
              placeholder="e.g., main-trunk"
            />

            <FormControl fullWidth>
              <InputLabel>Provider</InputLabel>
              <Select
                label="Provider"
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                disabled={!!editingTrunk}
              >
                <MenuItem value="">-- Select Provider --</MenuItem>
                {Object.entries(providerConfigs).map(([key, config]) => (
                  <MenuItem key={key} value={key}>
                    {config.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {formData.provider && providerConfigs[formData.provider] && (
              <>
                {providerConfigs[formData.provider].fields.map((field) => (
                  <TextField
                    key={field}
                    label={field.replace(/_/g, ' ').toUpperCase()}
                    fullWidth
                    type={field.includes('password') ? 'password' : 'text'}
                    value={formData[field] || ''}
                    onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                  />
                ))}
              </>
            )}

            <FormControlLabel
              control={<Checkbox checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} />}
              label="Show Advanced Options"
            />

            {showAdvanced && (
              <>
                <TextField
                  label="Context"
                  fullWidth
                  value={formData.context}
                  onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                />
                <TextField
                  label="Codecs"
                  fullWidth
                  value={formData.codecs}
                  onChange={(e) => setFormData({ ...formData, codecs: e.target.value })}
                  placeholder="Leave empty for provider defaults"
                />
                <TextField
                  label="Port"
                  type="number"
                  fullWidth
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                />
                <TextField
                  label="External IP (NAT)"
                  fullWidth
                  value={formData.external_ip}
                  onChange={(e) => setFormData({ ...formData, external_ip: e.target.value })}
                />
                <TextField
                  label="Local Network CIDR"
                  fullWidth
                  value={formData.local_net}
                  onChange={(e) => setFormData({ ...formData, local_net: e.target.value })}
                />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">
            {editingTrunk ? 'Update' : 'Create'} Trunk
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
