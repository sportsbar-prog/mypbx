import { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Button, TextField, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Alert, Snackbar, Accordion,
  AccordionSummary, AccordionDetails, Grid, Select, MenuItem, FormControl,
  InputLabel, Card, CardContent
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon,
  ExpandMore as ExpandMoreIcon, Refresh as RefreshIcon,
  Person as PersonIcon, Group as GroupIcon
} from '@mui/icons-material';

const API_URL = 'http://localhost:3000';

// Queue strategy options
const STRATEGIES = [
  { value: 'ringall', label: 'Ring All - Ring all members simultaneously' },
  { value: 'leastrecent', label: 'Least Recent - Member with longest idle time' },
  { value: 'fewestcalls', label: 'Fewest Calls - Member with fewest completed calls' },
  { value: 'random', label: 'Random - Random member selection' },
  { value: 'rrmemory', label: 'Round Robin Memory - Round robin with memory' },
  { value: 'linear', label: 'Linear - Ring members in order' },
  { value: 'wrandom', label: 'Weighted Random - Random with penalty weights' }
];

function Queues() {
  const [queues, setQueues] = useState([]);
  const [liveStatus, setLiveStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [expandedQueue, setExpandedQueue] = useState(null);
  
  // Dialogs
  const [queueDialog, setQueueDialog] = useState({ open: false, mode: 'add', data: {} });
  const [memberDialog, setMemberDialog] = useState({ open: false, queueName: '', data: {} });
  
  const token = localStorage.getItem('adminToken');
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const defaultQueue = {
    name: '',
    strategy: 'ringall',
    timeout: 15,
    wrapuptime: 0,
    members: []
  };

  const fetchQueues = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/asterisk/queues`, { headers });
      const data = await res.json();
      if (data.success) {
        setQueues(data.queues || []);
        if (data.liveStatus) setLiveStatus(data.liveStatus);
      } else {
        setError(data.error || 'Failed to load queues');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQueues(); }, []);

  const handleSaveQueue = async () => {
    const { mode, data } = queueDialog;
    try {
      const url = mode === 'add' 
        ? `${API_URL}/api/asterisk/queues`
        : `${API_URL}/api/asterisk/queues/${queueDialog.originalName}`;
      
      const res = await fetch(url, {
        method: mode === 'add' ? 'POST' : 'PUT',
        headers,
        body: JSON.stringify(data)
      });
      
      const result = await res.json();
      if (result.success) {
        setSuccess(mode === 'add' ? 'Queue created' : 'Queue updated');
        setQueueDialog({ open: false, mode: 'add', data: {} });
        fetchQueues();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to save queue');
    }
  };

  const handleDeleteQueue = async (name) => {
    if (!window.confirm(`Delete queue "${name}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/asterisk/queues/${name}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Queue deleted');
        fetchQueues();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to delete queue');
    }
  };

  const handleAddMember = async () => {
    try {
      const res = await fetch(`${API_URL}/api/asterisk/queues/${memberDialog.queueName}/members`, {
        method: 'POST',
        headers,
        body: JSON.stringify(memberDialog.data)
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Member added');
        setMemberDialog({ open: false, queueName: '', data: {} });
        fetchQueues();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to add member');
    }
  };

  const handleRemoveMember = async (queueName, memberInterface) => {
    try {
      const res = await fetch(`${API_URL}/api/asterisk/queues/${queueName}/members/${encodeURIComponent(memberInterface)}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Member removed');
        fetchQueues();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to remove member');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">📋 Queue Management</Typography>
        <Box>
          <Button startIcon={<RefreshIcon />} onClick={fetchQueues} sx={{ mr: 1 }}>
            Refresh
          </Button>
          <Button 
            startIcon={<AddIcon />} 
            variant="contained" 
            onClick={() => setQueueDialog({ open: true, mode: 'add', data: { ...defaultQueue } })}
          >
            Add Queue
          </Button>
        </Box>
      </Box>

      {/* Live Status */}
      {liveStatus && (
        <Card variant="outlined" sx={{ mb: 3, bgcolor: '#f5f5f5' }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Live Queue Status from Asterisk:</Typography>
            <Box sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
              {liveStatus}
            </Box>
          </CardContent>
        </Card>
      )}

      {loading && <Typography>Loading...</Typography>}

      {queues.length === 0 && !loading && (
        <Alert severity="info">
          No queues configured. Create a queue to manage call distribution.
        </Alert>
      )}

      {queues.map((queue) => (
        <Accordion 
          key={queue.name}
          expanded={expandedQueue === queue.name}
          onChange={() => setExpandedQueue(expandedQueue === queue.name ? null : queue.name)}
          sx={{ mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <GroupIcon color="primary" />
                <Typography variant="h6">{queue.name}</Typography>
                <Chip label={queue.strategy} size="small" variant="outlined" />
                <Chip 
                  icon={<PersonIcon />} 
                  label={`${queue.members?.length || 0} members`} 
                  size="small" 
                />
              </Box>
              <Box onClick={(e) => e.stopPropagation()}>
                <IconButton 
                  size="small" 
                  onClick={() => setQueueDialog({ 
                    open: true, 
                    mode: 'edit', 
                    originalName: queue.name,
                    data: { ...queue } 
                  })}
                >
                  <EditIcon />
                </IconButton>
                <IconButton size="small" color="error" onClick={() => handleDeleteQueue(queue.name)}>
                  <DeleteIcon />
                </IconButton>
              </Box>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={4}>
                <Typography variant="body2"><strong>Strategy:</strong> {queue.strategy}</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="body2"><strong>Timeout:</strong> {queue.timeout}s</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="body2"><strong>Wrap-up Time:</strong> {queue.wrapuptime}s</Typography>
              </Grid>
            </Grid>

            <Box sx={{ mb: 2 }}>
              <Button 
                startIcon={<AddIcon />} 
                size="small" 
                variant="outlined"
                onClick={() => setMemberDialog({ open: true, queueName: queue.name, data: { interface: '', penalty: 0 } })}
              >
                Add Member
              </Button>
            </Box>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Interface</TableCell>
                    <TableCell>Penalty</TableCell>
                    <TableCell width={80}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {queue.members?.map((member, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <code>{member.interface}</code>
                      </TableCell>
                      <TableCell>{member.penalty}</TableCell>
                      <TableCell>
                        <IconButton 
                          size="small" 
                          color="error" 
                          onClick={() => handleRemoveMember(queue.name, member.interface)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!queue.members || queue.members.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        <Typography color="textSecondary">No members</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      ))}

      {/* Add/Edit Queue Dialog */}
      <Dialog open={queueDialog.open} onClose={() => setQueueDialog({ open: false, mode: 'add', data: {} })} maxWidth="sm" fullWidth>
        <DialogTitle>{queueDialog.mode === 'add' ? 'Create Queue' : 'Edit Queue'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Queue Name"
                value={queueDialog.data.name || ''}
                onChange={(e) => setQueueDialog({ ...queueDialog, data: { ...queueDialog.data, name: e.target.value } })}
                disabled={queueDialog.mode === 'edit'}
                placeholder="e.g., support, sales"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Strategy</InputLabel>
                <Select
                  value={queueDialog.data.strategy || 'ringall'}
                  label="Strategy"
                  onChange={(e) => setQueueDialog({ ...queueDialog, data: { ...queueDialog.data, strategy: e.target.value } })}
                >
                  {STRATEGIES.map(s => (
                    <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Timeout (seconds)"
                type="number"
                value={queueDialog.data.timeout || 15}
                onChange={(e) => setQueueDialog({ ...queueDialog, data: { ...queueDialog.data, timeout: parseInt(e.target.value) || 15 } })}
                helperText="How long to ring each member"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Wrap-up Time (seconds)"
                type="number"
                value={queueDialog.data.wrapuptime || 0}
                onChange={(e) => setQueueDialog({ ...queueDialog, data: { ...queueDialog.data, wrapuptime: parseInt(e.target.value) || 0 } })}
                helperText="Delay after call before next"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQueueDialog({ open: false, mode: 'add', data: {} })}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveQueue}>
            {queueDialog.mode === 'add' ? 'Create' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={memberDialog.open} onClose={() => setMemberDialog({ open: false, queueName: '', data: {} })} maxWidth="sm" fullWidth>
        <DialogTitle>Add Member to {memberDialog.queueName}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={8}>
              <TextField
                fullWidth
                label="Interface"
                value={memberDialog.data.interface || ''}
                onChange={(e) => setMemberDialog({ ...memberDialog, data: { ...memberDialog.data, interface: e.target.value } })}
                placeholder="e.g., PJSIP/1001, Local/1001@from-internal"
                helperText="Channel technology and resource"
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                fullWidth
                label="Penalty"
                type="number"
                value={memberDialog.data.penalty || 0}
                onChange={(e) => setMemberDialog({ ...memberDialog, data: { ...memberDialog.data, penalty: parseInt(e.target.value) || 0 } })}
                helperText="Higher = lower priority"
              />
            </Grid>
          </Grid>
          <Alert severity="info" sx={{ mt: 2 }}>
            <strong>Interface Examples:</strong><br/>
            • PJSIP/1001 - Direct SIP extension<br/>
            • Local/1001@internal - Local channel<br/>
            • SIP/user@provider - External SIP
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMemberDialog({ open: false, queueName: '', data: {} })}>Cancel</Button>
          <Button variant="contained" onClick={handleAddMember}>Add Member</Button>
        </DialogActions>
      </Dialog>

      {/* Notifications */}
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
      <Snackbar open={!!success} autoHideDuration={3000} onClose={() => setSuccess(null)}>
        <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>
      </Snackbar>
    </Box>
  );
}

export default Queues;
