import { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Button, TextField, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Alert, Snackbar, Accordion,
  AccordionSummary, AccordionDetails, Tooltip, Grid, Select, MenuItem,
  FormControl, InputLabel, Divider, Card, CardContent
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon,
  ExpandMore as ExpandMoreIcon, Save as SaveIcon, Refresh as RefreshIcon,
  PlayArrow as ApplyIcon, Code as CodeIcon, ContentCopy as CopyIcon
} from '@mui/icons-material';
import { api } from '../services/api';

// Common Asterisk applications
const COMMON_APPS = [
  { name: 'Answer', syntax: 'Answer([delay])', desc: 'Answer the channel' },
  { name: 'Dial', syntax: 'Dial(destination[,timeout[,options]])', desc: 'Dial a destination' },
  { name: 'Playback', syntax: 'Playback(filename[&filename2...])', desc: 'Play a sound file' },
  { name: 'Hangup', syntax: 'Hangup([cause])', desc: 'Hang up the channel' },
  { name: 'Goto', syntax: 'Goto(context,extension,priority)', desc: 'Jump to a location' },
  { name: 'GotoIf', syntax: 'GotoIf(condition?true:false)', desc: 'Conditional jump' },
  { name: 'Background', syntax: 'Background(filename)', desc: 'Play file, accept input' },
  { name: 'Queue', syntax: 'Queue(queuename[,options])', desc: 'Place call in queue' },
  { name: 'VoiceMail', syntax: 'VoiceMail(mailbox[@context])', desc: 'Leave voicemail' },
  { name: 'VoiceMailMain', syntax: 'VoiceMailMain([mailbox][@context])', desc: 'Check voicemail' },
  { name: 'Record', syntax: 'Record(filename,format[,silence])', desc: 'Record audio' },
  { name: 'Set', syntax: 'Set(variable=value)', desc: 'Set a variable' },
  { name: 'Wait', syntax: 'Wait(seconds)', desc: 'Wait for seconds' },
  { name: 'NoOp', syntax: 'NoOp([text])', desc: 'No operation (for logging)' },
  { name: 'AGI', syntax: 'AGI(command[,args])', desc: 'Run AGI script' },
  { name: 'SayDigits', syntax: 'SayDigits(digits)', desc: 'Say digits' },
  { name: 'SayNumber', syntax: 'SayNumber(number)', desc: 'Say a number' },
];

function Dialplan() {
  const [contexts, setContexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [expandedContext, setExpandedContext] = useState(null);
  
  // Dialogs
  const [contextDialog, setContextDialog] = useState({ open: false, mode: 'add', data: {} });
  const [extensionDialog, setExtensionDialog] = useState({ open: false, contextName: '', data: {} });
  const [rawDialog, setRawDialog] = useState({ open: false, content: '' });
  
  const fetchContexts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/asterisk/dialplan');
      if (res.data.success) {
        setContexts(res.data.contexts || []);
      } else {
        setError(res.data.error || 'Failed to load dialplan');
      }
    } catch (err) {
      setError(`Failed to connect to server: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchContexts(); }, []);

  const handleAddContext = async () => {
    try {
      const res = await api.post('/asterisk/dialplan', contextDialog.data);
      if (res.data.success) {
        setSuccess('Context created successfully');
        setContextDialog({ open: false, mode: 'add', data: {} });
        fetchContexts();
      } else {
        setError(res.data.error);
      }
    } catch (err) {
      setError(`Failed to create context: ${err.message}`);
    }
  };

  const handleUpdateContext = async () => {
    try {
      const res = await api.put(`/asterisk/dialplan/${contextDialog.originalName}`, contextDialog.data);
      if (res.data.success) {
        setSuccess('Context updated successfully');
        setContextDialog({ open: false, mode: 'add', data: {} });
        fetchContexts();
      } else {
        setError(res.data.error);
      }
    } catch (err) {
      setError(`Failed to update context: ${err.message}`);
    }
  };

  const handleDeleteContext = async (name) => {
    if (!window.confirm(`Delete context [${name}]?`)) return;
    try {
      const res = await api.delete(`/asterisk/dialplan/${name}`);
      if (res.data.success) {
        setSuccess('Context deleted');
        fetchContexts();
      } else {
        setError(res.data.error);
      }
    } catch (err) {
      setError(`Failed to delete context: ${err.message}`);
    }
  };

  const handleAddExtension = async () => {
    try {
      const res = await api.post(`/asterisk/dialplan/${extensionDialog.contextName}/extension`, extensionDialog.data);
      if (res.data.success) {
        setSuccess('Extension added');
        setExtensionDialog({ open: false, contextName: '', data: {} });
        fetchContexts();
      } else {
        setError(res.data.error);
      }
    } catch (err) {
      setError(`Failed to add extension: ${err.message}`);
    }
  };

  const handleDeleteExtension = async (contextName, index) => {
    try {
      const res = await api.delete(`/asterisk/dialplan/${contextName}/extension/${index}`);
      if (res.data.success) {
        setSuccess('Extension removed');
        fetchContexts();
      } else {
        setError(res.data.error);
      }
    } catch (err) {
      setError(`Failed to remove extension: ${err.message}`);
    }
  };

  const handleApplyDialplan = async () => {
    if (!window.confirm('Apply dialplan to Asterisk? This will overwrite extensions.conf')) return;
    try {
      const res = await api.post('/asterisk/dialplan/apply', {});
      if (res.data.success) {
        setSuccess('Dialplan applied to Asterisk');
      } else {
        setError(res.data.error);
      }
    } catch (err) {
      setError(`Failed to apply dialplan: ${err.message}`);
    }
  };

  const generateRawConfig = () => {
    let output = '; Asterisk Dialplan (extensions.conf)\n\n';
    for (const ctx of contexts) {
      output += `[${ctx.name}]\n`;
      for (const inc of ctx.includes || []) {
        output += `include => ${inc}\n`;
      }
      let lastPattern = null;
      for (const ext of ctx.extensions || []) {
        if (ext.pattern === lastPattern) {
          output += `same => ${ext.priority},${ext.application}\n`;
        } else {
          output += `exten => ${ext.pattern},${ext.priority},${ext.application}\n`;
          lastPattern = ext.pattern;
        }
      }
      output += '\n';
    }
    return output;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">📞 Dialplan Editor</Typography>
        <Box>
          <Button startIcon={<RefreshIcon />} onClick={fetchContexts} sx={{ mr: 1 }}>
            Refresh
          </Button>
          <Button startIcon={<CodeIcon />} onClick={() => setRawDialog({ open: true, content: generateRawConfig() })} sx={{ mr: 1 }}>
            View Raw
          </Button>
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setContextDialog({ open: true, mode: 'add', data: { name: '', includes: [] } })} sx={{ mr: 1 }}>
            Add Context
          </Button>
          <Button startIcon={<ApplyIcon />} variant="contained" color="success" onClick={handleApplyDialplan}>
            Apply to Asterisk
          </Button>
        </Box>
      </Box>

      {loading && <Typography>Loading...</Typography>}

      {contexts.length === 0 && !loading && (
        <Alert severity="info">No dialplan contexts found. Create one to get started.</Alert>
      )}

      {contexts.map((ctx) => (
        <Accordion 
          key={ctx.name} 
          expanded={expandedContext === ctx.name}
          onChange={() => setExpandedContext(expandedContext === ctx.name ? null : ctx.name)}
          sx={{ mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="h6">[{ctx.name}]</Typography>
                <Chip label={`${ctx.extensions?.length || 0} extensions`} size="small" />
                {ctx.includes?.length > 0 && (
                  <Chip label={`includes: ${ctx.includes.join(', ')}`} size="small" variant="outlined" />
                )}
              </Box>
              <Box onClick={(e) => e.stopPropagation()}>
                <IconButton size="small" onClick={() => setContextDialog({ open: true, mode: 'edit', originalName: ctx.name, data: { ...ctx, newName: ctx.name } })}>
                  <EditIcon />
                </IconButton>
                <IconButton size="small" color="error" onClick={() => handleDeleteContext(ctx.name)}>
                  <DeleteIcon />
                </IconButton>
              </Box>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ mb: 2 }}>
              <Button 
                startIcon={<AddIcon />} 
                size="small" 
                variant="outlined"
                onClick={() => setExtensionDialog({ open: true, contextName: ctx.name, data: { pattern: '', priority: '1', application: '' } })}
              >
                Add Extension
              </Button>
            </Box>
            
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={150}>Pattern</TableCell>
                    <TableCell width={80}>Priority</TableCell>
                    <TableCell>Application</TableCell>
                    <TableCell width={80}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ctx.extensions?.map((ext, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <code style={{ color: '#1976d2' }}>{ext.pattern}</code>
                      </TableCell>
                      <TableCell>{ext.priority}</TableCell>
                      <TableCell>
                        <code>{ext.application}</code>
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="error" onClick={() => handleDeleteExtension(ctx.name, idx)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!ctx.extensions || ctx.extensions.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        <Typography color="textSecondary">No extensions</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      ))}

      {/* Add/Edit Context Dialog */}
      <Dialog open={contextDialog.open} onClose={() => setContextDialog({ open: false, mode: 'add', data: {} })} maxWidth="sm" fullWidth>
        <DialogTitle>{contextDialog.mode === 'add' ? 'Add Context' : 'Edit Context'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Context Name"
            value={contextDialog.data.name || contextDialog.data.newName || ''}
            onChange={(e) => setContextDialog({ 
              ...contextDialog, 
              data: { ...contextDialog.data, [contextDialog.mode === 'edit' ? 'newName' : 'name']: e.target.value } 
            })}
            margin="normal"
            placeholder="e.g., internal, external, default"
          />
          <TextField
            fullWidth
            label="Includes (comma separated)"
            value={(contextDialog.data.includes || []).join(', ')}
            onChange={(e) => setContextDialog({ 
              ...contextDialog, 
              data: { ...contextDialog.data, includes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } 
            })}
            margin="normal"
            placeholder="e.g., internal, default"
            helperText="Other contexts to include"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContextDialog({ open: false, mode: 'add', data: {} })}>Cancel</Button>
          <Button variant="contained" onClick={contextDialog.mode === 'add' ? handleAddContext : handleUpdateContext}>
            {contextDialog.mode === 'add' ? 'Create' : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Extension Dialog */}
      <Dialog open={extensionDialog.open} onClose={() => setExtensionDialog({ open: false, contextName: '', data: {} })} maxWidth="md" fullWidth>
        <DialogTitle>Add Extension to [{extensionDialog.contextName}]</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={4}>
              <TextField
                fullWidth
                label="Pattern"
                value={extensionDialog.data.pattern || ''}
                onChange={(e) => setExtensionDialog({ ...extensionDialog, data: { ...extensionDialog.data, pattern: e.target.value } })}
                placeholder="e.g., _1XXX, 100, s"
                helperText="_X=0-9, _Z=1-9, _N=2-9"
              />
            </Grid>
            <Grid item xs={2}>
              <TextField
                fullWidth
                label="Priority"
                value={extensionDialog.data.priority || '1'}
                onChange={(e) => setExtensionDialog({ ...extensionDialog, data: { ...extensionDialog.data, priority: e.target.value } })}
                placeholder="1, n, same"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Application"
                value={extensionDialog.data.application || ''}
                onChange={(e) => setExtensionDialog({ ...extensionDialog, data: { ...extensionDialog.data, application: e.target.value } })}
                placeholder="e.g., Dial(PJSIP/100,30)"
              />
            </Grid>
          </Grid>
          
          <Divider sx={{ my: 2 }} />
          
          <Typography variant="subtitle2" gutterBottom>Common Applications (click to use)</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {COMMON_APPS.map((app) => (
              <Tooltip key={app.name} title={`${app.syntax}\n${app.desc}`}>
                <Chip 
                  label={app.name} 
                  size="small" 
                  onClick={() => setExtensionDialog({ 
                    ...extensionDialog, 
                    data: { ...extensionDialog.data, application: app.syntax } 
                  })}
                  clickable
                />
              </Tooltip>
            ))}
          </Box>

          <Card variant="outlined" sx={{ mt: 2, bgcolor: '#f5f5f5' }}>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>Pattern Examples:</Typography>
              <Typography variant="body2" component="div">
                <code>100</code> - Match exactly 100<br/>
                <code>_1XX</code> - Match 100-199<br/>
                <code>_NXXNXXXXXX</code> - US phone number<br/>
                <code>s</code> - Start extension<br/>
                <code>i</code> - Invalid entry<br/>
                <code>t</code> - Timeout<br/>
                <code>h</code> - Hangup
              </Typography>
            </CardContent>
          </Card>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExtensionDialog({ open: false, contextName: '', data: {} })}>Cancel</Button>
          <Button variant="contained" onClick={handleAddExtension}>Add Extension</Button>
        </DialogActions>
      </Dialog>

      {/* Raw Config Dialog */}
      <Dialog open={rawDialog.open} onClose={() => setRawDialog({ open: false, content: '' })} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Raw extensions.conf Preview
          <Button 
            startIcon={<CopyIcon />} 
            onClick={() => { navigator.clipboard.writeText(rawDialog.content); setSuccess('Copied to clipboard'); }}
          >
            Copy
          </Button>
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={20}
            value={rawDialog.content}
            InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRawDialog({ open: false, content: '' })}>Close</Button>
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

export default Dialplan;
