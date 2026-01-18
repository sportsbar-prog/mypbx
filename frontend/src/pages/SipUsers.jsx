import { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Button, TextField, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Alert, Snackbar, Switch,
  FormControlLabel, Grid, Card, CardContent, Tooltip, Divider, Select,
  MenuItem, FormControl, InputLabel, InputAdornment
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon,
  Refresh as RefreshIcon, PlayArrow as ApplyIcon, Visibility,
  VisibilityOff, Phone as PhoneIcon, Person as PersonIcon,
  ContentCopy as CopyIcon, Settings as SettingsIcon
} from '@mui/icons-material';
import { api } from '../services/api';

// Common codec options
const CODEC_OPTIONS = ['ulaw', 'alaw', 'g722', 'g729', 'opus', 'gsm'];

// Transport options
const TRANSPORT_OPTIONS = [
  { value: 'transport-udp', label: 'UDP (5060)' },
  { value: 'transport-tcp', label: 'TCP (5060)' },
  { value: 'transport-tls', label: 'TLS (5061)' },
  { value: 'transport-wss', label: 'WSS (WebSocket)' }
];

// Context presets
const CONTEXT_PRESETS = ['default', 'internal', 'external', 'local', 'from-internal', 'from-external'];

function SipUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showPasswords, setShowPasswords] = useState({});
  
  // Dialog state
  const [dialog, setDialog] = useState({ open: false, mode: 'add', data: {} });
  const [configDialog, setConfigDialog] = useState({ open: false, user: null });

  const defaultUser = {
    username: '',
    password: '',
    context: 'default',
    codecs: 'ulaw,alaw,g722',
    transport: 'transport-udp',
    callerid: '',
    maxContacts: 5,
    directMedia: false,
    rtp_symmetric: true,
    force_rport: true,
    rewrite_contact: true,
    enabled: true
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/asterisk/sip-users');
      if (res.data.success) {
        setUsers(res.data.users || []);
      } else {
        setError(res.data.error || 'Failed to load SIP users');
      }
    } catch (err) {
      setError(`Failed to connect to server: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleSave = async () => {
    const { mode, data } = dialog;
    try {
      // Map old field names to new ones
      const payload = {
        username: data.username,
        secret: data.password || data.secret, // Map password to secret
        extension: data.extension || data.username, // Use username as extension if not provided
        context: data.context,
        codecs: data.codecs,
        transport: data.transport,
        callerid: data.callerid,
        template_type: data.template_type || 'basic_user',
        max_contacts: data.maxContacts || data.max_contacts,
        voicemail: data.voicemail || '',
        call_limit: data.call_limit || 5,
        notes: data.notes || ''
      };
      
      const res = mode === 'add'
        ? await api.post('/asterisk/sip-users', payload)
        : await api.put(`/asterisk/sip-users/${dialog.originalUsername}`, payload);
      
      if (res.data.success) {
        setSuccess(mode === 'add' ? 'SIP user created' : 'SIP user updated');
        setDialog({ open: false, mode: 'add', data: {} });
        fetchUsers();
      } else {
        setError(res.data.error);
      }
    } catch (err) {
      setError(`Failed to save SIP user: ${err.message}`);
    }
  };

  const handleDelete = async (username) => {
    if (!window.confirm(`Delete SIP user "${username}"?`)) return;
    try {
      const res = await api.delete(`/asterisk/sip-users/${username}`);
      if (res.data.success) {
        setSuccess('SIP user deleted');
        fetchUsers();
      } else {
        setError(res.data.error);
      }
    } catch (err) {
      setError(`Failed to delete SIP user: ${err.message}`);
    }
  };

  const handleApply = async () => {
    if (!window.confirm('Apply SIP users to Asterisk? This will write pjsip_users.conf')) return;
    try {
      const res = await api.post('/asterisk/sip-users/apply', {});
      if (res.data.success) {
        setSuccess('SIP users applied to Asterisk');
      } else {
        setError(res.data.error);
      }
    } catch (err) {
      setError(`Failed to apply SIP users: ${err.message}`);
    }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setDialog({ ...dialog, data: { ...dialog.data, password } });
  };

  const generateSoftphoneConfig = (user) => {
    return `; Softphone Configuration for ${user.username}
; ----------------------------------------
; Server: ${window.location.hostname}
; Port: 5060 (UDP) or 5061 (TLS)
; Username: ${user.username}
; Password: (use the password you set)
; Domain: ${window.location.hostname}
; Transport: UDP or TCP
; STUN: stun.l.google.com:19302

; For Zoiper/Linphone:
Account Name: ${user.username}
Domain: ${window.location.hostname}
Username: ${user.username}
Outbound Proxy: ${window.location.hostname}
Transport: UDP

; For MicroSIP:
Domain: ${window.location.hostname}
User: ${user.username}
Display name: ${user.callerid || user.username}

; SIP URI: sip:${user.username}@${window.location.hostname}`;
  };

  const togglePassword = (username) => {
    setShowPasswords({ ...showPasswords, [username]: !showPasswords[username] });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">📱 SIP Users (Softphones)</Typography>
        <Box>
          <Button startIcon={<RefreshIcon />} onClick={fetchUsers} sx={{ mr: 1 }}>
            Refresh
          </Button>
          <Button 
            startIcon={<AddIcon />} 
            variant="contained" 
            onClick={() => setDialog({ open: true, mode: 'add', data: { ...defaultUser } })} 
            sx={{ mr: 1 }}
          >
            Add User
          </Button>
          <Button startIcon={<ApplyIcon />} variant="contained" color="success" onClick={handleApply}>
            Apply to Asterisk
          </Button>
        </Box>
      </Box>

      {/* Quick Info Card */}
      <Card variant="outlined" sx={{ mb: 3, bgcolor: '#e3f2fd' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>🎧 Softphone Registration Info</Typography>
          <Grid container spacing={2}>
            <Grid item xs={3}>
              <Typography variant="body2"><strong>Server:</strong> {window.location.hostname}</Typography>
            </Grid>
            <Grid item xs={3}>
              <Typography variant="body2"><strong>UDP Port:</strong> 5060</Typography>
            </Grid>
            <Grid item xs={3}>
              <Typography variant="body2"><strong>TLS Port:</strong> 5061</Typography>
            </Grid>
            <Grid item xs={3}>
              <Typography variant="body2"><strong>Protocol:</strong> PJSIP</Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading && <Typography>Loading...</Typography>}

      {users.length === 0 && !loading && (
        <Alert severity="info">
          No SIP users found. Create one to allow softphone registration.
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Username</TableCell>
              <TableCell>Caller ID</TableCell>
              <TableCell>Context</TableCell>
              <TableCell>Codecs</TableCell>
              <TableCell>Transport</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.username}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PersonIcon color="primary" />
                    <strong>{user.username}</strong>
                  </Box>
                </TableCell>
                <TableCell>{user.callerid || '-'}</TableCell>
                <TableCell>
                  <Chip label={user.context} size="small" variant="outlined" />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.codecs}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip 
                    label={user.transport?.replace('transport-', '').toUpperCase() || 'UDP'} 
                    size="small" 
                    color={user.transport?.includes('tls') ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  <Chip 
                    label={user.enabled !== false ? 'Active' : 'Disabled'} 
                    color={user.enabled !== false ? 'success' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Softphone Config">
                    <IconButton size="small" onClick={() => setConfigDialog({ open: true, user })}>
                      <SettingsIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton 
                      size="small" 
                      onClick={() => setDialog({ 
                        open: true, 
                        mode: 'edit', 
                        originalUsername: user.username,
                        data: { ...defaultUser, ...user } 
                      })}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => handleDelete(user.username)}>
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit User Dialog */}
      <Dialog open={dialog.open} onClose={() => setDialog({ open: false, mode: 'add', data: {} })} maxWidth="md" fullWidth>
        <DialogTitle>
          {dialog.mode === 'add' ? '➕ Create SIP User' : '✏️ Edit SIP User'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {/* Basic Info */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>Basic Information</Typography>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Username"
                value={dialog.data.username || ''}
                onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, username: e.target.value } })}
                disabled={dialog.mode === 'edit'}
                placeholder="e.g., 1001, john.doe"
                helperText="SIP extension/username"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Extension (E.164)"
                value={dialog.data.extension || dialog.data.username || ''}
                onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, extension: e.target.value } })}
                placeholder="e.g., 1001, +15551234567"
                helperText="Phone number or extension"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Password"
                type={showPasswords['dialog'] ? 'text' : 'password'}
                value={dialog.data.password || ''}
                onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, password: e.target.value } })}
                placeholder={dialog.mode === 'edit' ? 'Leave blank to keep' : 'Enter password'}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => togglePassword('dialog')} size="small">
                        {showPasswords['dialog'] ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                      <Button size="small" onClick={generatePassword}>Generate</Button>
                    </InputAdornment>
                  )
                }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Caller ID"
                value={dialog.data.callerid || ''}
                onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, callerid: e.target.value } })}
                placeholder='"John Doe" <1001>'
                helperText='Format: "Name" <number>'
              />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Context</InputLabel>
                <Select
                  value={dialog.data.context || 'default'}
                  label="Context"
                  onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, context: e.target.value } })}
                >
                  {CONTEXT_PRESETS.map(ctx => (
                    <MenuItem key={ctx} value={ctx}>{ctx}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Codecs & Transport */}
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" color="primary" gutterBottom>Codecs & Transport</Typography>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Codecs"
                value={dialog.data.codecs || ''}
                onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, codecs: e.target.value } })}
                placeholder="ulaw,alaw,g722"
                helperText={
                  <Box component="span">
                    Available: {CODEC_OPTIONS.map((c, i) => (
                      <Chip 
                        key={c} 
                        label={c} 
                        size="small" 
                        sx={{ mr: 0.5, cursor: 'pointer' }}
                        onClick={() => {
                          const current = dialog.data.codecs || '';
                          const codecs = current ? current.split(',').map(s => s.trim()) : [];
                          if (!codecs.includes(c)) {
                            codecs.push(c);
                            setDialog({ ...dialog, data: { ...dialog.data, codecs: codecs.join(',') } });
                          }
                        }}
                      />
                    ))}
                  </Box>
                }
              />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Transport</InputLabel>
                <Select
                  value={dialog.data.transport || 'transport-udp'}
                  label="Transport"
                  onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, transport: e.target.value } })}
                >
                  {TRANSPORT_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Max Contacts"
                type="number"
                value={dialog.data.maxContacts || 5}
                onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, maxContacts: parseInt(e.target.value) || 5 } })}
                helperText="Max simultaneous registrations"
              />
            </Grid>

            {/* NAT Settings */}
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" color="primary" gutterBottom>NAT Settings</Typography>
            </Grid>
            <Grid item xs={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={dialog.data.directMedia === true}
                    onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, directMedia: e.target.checked } })}
                  />
                }
                label="Direct Media"
              />
            </Grid>
            <Grid item xs={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={dialog.data.rtp_symmetric !== false}
                    onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, rtp_symmetric: e.target.checked } })}
                  />
                }
                label="RTP Symmetric"
              />
            </Grid>
            <Grid item xs={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={dialog.data.force_rport !== false}
                    onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, force_rport: e.target.checked } })}
                  />
                }
                label="Force rport"
              />
            </Grid>
            <Grid item xs={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={dialog.data.rewrite_contact !== false}
                    onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, rewrite_contact: e.target.checked } })}
                  />
                }
                label="Rewrite Contact"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={dialog.data.enabled !== false}
                    onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, enabled: e.target.checked } })}
                  />
                }
                label="Enabled"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog({ open: false, mode: 'add', data: {} })}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            {dialog.mode === 'add' ? 'Create User' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Softphone Config Dialog */}
      <Dialog open={configDialog.open} onClose={() => setConfigDialog({ open: false, user: null })} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          📱 Softphone Configuration: {configDialog.user?.username}
          <Button 
            startIcon={<CopyIcon />}
            onClick={() => {
              navigator.clipboard.writeText(generateSoftphoneConfig(configDialog.user));
              setSuccess('Config copied to clipboard');
            }}
          >
            Copy
          </Button>
        </DialogTitle>
        <DialogContent>
          {configDialog.user && (
            <>
              <Card variant="outlined" sx={{ mb: 2, bgcolor: '#f5f5f5' }}>
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2"><strong>Server:</strong> {window.location.hostname}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2"><strong>Username:</strong> {configDialog.user.username}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2"><strong>Port:</strong> 5060 (UDP) / 5061 (TLS)</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2"><strong>Context:</strong> {configDialog.user.context}</Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
              
              <Typography variant="subtitle2" gutterBottom>Configuration Template:</Typography>
              <TextField
                fullWidth
                multiline
                rows={15}
                value={generateSoftphoneConfig(configDialog.user)}
                InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }}
              />

              <Alert severity="info" sx={{ mt: 2 }}>
                <strong>Recommended Softphones:</strong> Zoiper, Linphone, MicroSIP, Bria, Groundwire
              </Alert>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigDialog({ open: false, user: null })}>Close</Button>
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

export default SipUsers;
