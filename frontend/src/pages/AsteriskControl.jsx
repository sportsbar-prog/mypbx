import { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Button, TextField, Grid, Card, CardContent,
  Alert, Snackbar, Chip, List, ListItem, ListItemText, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import {
  Terminal as TerminalIcon, Refresh as RefreshIcon,
  CheckCircle as CheckIcon, Error as ErrorIcon,
  PlayArrow as RunIcon
} from '@mui/icons-material';
import { api } from '../services/api';

// Predefined safe commands
const QUICK_COMMANDS = [
  { label: 'Show Channels', cmd: 'core show channels' },
  { label: 'Show Calls', cmd: 'core show calls' },
  { label: 'PJSIP Endpoints', cmd: 'pjsip show endpoints' },
  { label: 'PJSIP Registrations', cmd: 'pjsip show registrations' },
  { label: 'Show Queues', cmd: 'queue show' },
  { label: 'Show Bridges', cmd: 'bridge show all' },
  { label: 'Core Version', cmd: 'core show version' },
  { label: 'Uptime', cmd: 'core show uptime' },
  { label: 'Show Hints', cmd: 'core show hints' },
  { label: 'Dialplan', cmd: 'dialplan show' },
  { label: 'Module List', cmd: 'module show' },
  { label: 'Voicemail Users', cmd: 'voicemail show users' }
];

const RELOAD_MODULES = [
  { value: 'all', label: 'All (reload)' },
  { value: 'pjsip', label: 'PJSIP' },
  { value: 'dialplan', label: 'Dialplan' },
  { value: 'features', label: 'Features' },
  { value: 'cdr', label: 'CDR' },
  { value: 'logger', label: 'Logger' },
  { value: 'voicemail', label: 'Voicemail' }
];

function AsteriskControl() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [selectedModule, setSelectedModule] = useState('all');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await api.get('/asterisk/status');
      if (res.data.success) {
        setStatus(res.data.status);
        setError(null);
      } else {
        setError(res.data.error || 'Failed to fetch Asterisk status');
        setStatus(null);
        console.error('Status fetch error:', res.data.error);
      }
    } catch (err) {
      setError(`Failed to fetch Asterisk status: ${err.message}`);
      setStatus(null);
      console.error('Status fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const executeCommand = async (cmd) => {
    const commandToRun = cmd || command;
    if (!commandToRun.trim()) return;
    
    setExecuting(true);
    setOutput('');
    try {
      const res = await api.post('/asterisk/cli', { command: commandToRun });
      if (res.data.success) {
        setOutput(res.data.output);
      } else {
        setOutput(`Error: ${res.data.error}\n\nAllowed commands:\n${(res.data.allowedCommands || []).join('\n')}`);
      }
    } catch (err) {
      setOutput(`Error: ${err.message}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleReload = async () => {
    setSuccess(null);
    setError(null);

    try {
      const res = await api.post('/asterisk/reload', { module: selectedModule });
      if (res.data.success) {
        setSuccess(res.data.message || `Reloaded ${selectedModule} successfully`);
        if (res.data.output) setOutput(res.data.output);
        fetchStatus();
      } else {
        setError(res.data.error || res.data.message || 'Reload failed');
        if (res.data.output) setOutput(res.data.output);
      }
    } catch (err) {
      setError(`Failed to reload: ${err.message}`);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">🖥️ Asterisk Control Panel</Typography>
        <Button startIcon={<RefreshIcon />} onClick={fetchStatus}>
          Refresh Status
        </Button>
      </Box>

      {/* Status Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>System Status</Typography>
              {loading ? (
                <CircularProgress size={24} />
              ) : error ? (
                <Alert severity="error">{error}</Alert>
              ) : status ? (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {status.ariConnected ? (
                      <Chip icon={<CheckIcon />} label="ARI Connected" color="success" size="small" />
                    ) : (
                      <Chip icon={<ErrorIcon />} label="ARI Disconnected" color="error" size="small" />
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {status.version || 'Version: Unknown'}
                  </Typography>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {status.uptime || 'Uptime: Unknown'}
                  </Typography>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {status.channels || 'Channels: Unknown'}
                  </Typography>
                </Box>
              ) : (
                <Alert severity="warning">Unable to get Asterisk status</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Reload Configuration</Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <FormControl sx={{ minWidth: 200 }}>
                  <InputLabel>Module</InputLabel>
                  <Select
                    value={selectedModule}
                    label="Module"
                    onChange={(e) => setSelectedModule(e.target.value)}
                    size="small"
                  >
                    {RELOAD_MODULES.map(mod => (
                      <MenuItem key={mod.value} value={mod.value}>{mod.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button variant="contained" onClick={handleReload}>
                  Reload
                </Button>
              </Box>
              <Alert severity="info" sx={{ mt: 2 }}>
                Reload applies configuration changes without restarting Asterisk
              </Alert>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* CLI Console */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TerminalIcon /> Asterisk CLI Console
        </Typography>
        
        {/* Quick Commands */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>Quick Commands:</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {QUICK_COMMANDS.map((qc) => (
              <Chip 
                key={qc.cmd}
                label={qc.label}
                onClick={() => {
                  setCommand(qc.cmd);
                  executeCommand(qc.cmd);
                }}
                clickable
                variant="outlined"
                size="small"
              />
            ))}
          </Box>
        </Box>

        {/* Command Input */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            fullWidth
            label="Asterisk CLI Command"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && executeCommand()}
            placeholder="e.g., core show channels"
            size="small"
          />
          <Button 
            variant="contained" 
            onClick={() => executeCommand()}
            disabled={executing || !command.trim()}
            startIcon={executing ? <CircularProgress size={16} /> : <RunIcon />}
          >
            Run
          </Button>
        </Box>

        {/* Output */}
        <Paper 
          variant="outlined" 
          sx={{ 
            p: 2, 
            bgcolor: '#1e1e1e', 
            color: '#00ff00',
            fontFamily: 'monospace',
            fontSize: 12,
            minHeight: 300,
            maxHeight: 500,
            overflow: 'auto',
            whiteSpace: 'pre-wrap'
          }}
        >
          {executing ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} sx={{ color: '#00ff00' }} />
              <span>Executing...</span>
            </Box>
          ) : output ? (
            output
          ) : (
            <Typography sx={{ color: '#666' }}>
              {'> Enter a command or click a quick command above\n> Output will appear here'}
            </Typography>
          )}
        </Paper>

        <Alert severity="warning" sx={{ mt: 2 }}>
          Only safe read-only commands are allowed for security. For write operations, use the specific management pages.
        </Alert>
      </Paper>

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

export default AsteriskControl;
