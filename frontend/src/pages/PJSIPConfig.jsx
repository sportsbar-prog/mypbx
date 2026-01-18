import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import { api } from '../services/api';
import { toast } from 'react-toastify';

export default function PJSIPConfig() {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get('/pjsip/config');

      if (response.data.success) {
        setContent(response.data.content);
        setOriginalContent(response.data.content);
      }
    } catch (error) {
      console.error('Failed to load configuration:', error);
      toast.error('Failed to load PJSIP configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (content === originalContent) {
      toast.info('No changes to save');
      return;
    }
    setDialogOpen(true);
  };

  const confirmSave = async () => {
    setDialogOpen(false);
    setLoading(true);
    try {
      const response = await api.put('/pjsip/config', { content });

      if (response.data.success) {
        setOriginalContent(content);
        const backupMsg = response.data.backup ? ` Backup: ${response.data.backup}` : '';
        toast.success(`Configuration saved successfully!${backupMsg}`);
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      toast.error(error.response?.data?.error || 'Failed to save PJSIP configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setContent(originalContent);
    toast.info('Changes discarded');
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">PJSIP Configuration</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadConfig}
            disabled={loading}
          >
            Reload
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={loading || content === originalContent}
          >
            Save Changes
          </Button>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Note: Changes to PJSIP configuration will automatically backup the previous version and reload Asterisk.
      </Alert>

      {loading && content === originalContent ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper sx={{ p: 2, backgroundColor: '#1e1e1e' }}>
          <TextField
            fullWidth
            multiline
            rows={30}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            sx={{
              '& .MuiInputBase-input': {
                fontFamily: 'monospace',
                fontSize: '13px',
                color: '#d4d4d4',
                backgroundColor: '#1e1e1e',
              },
              '& .MuiOutlinedInput-root': {
                '& fieldset': {
                  borderColor: '#404040',
                },
                '&:hover fieldset': {
                  borderColor: '#505050',
                },
              },
            }}
            placeholder="PJSIP configuration content will appear here..."
          />

          {content !== originalContent && (
            <Box sx={{ display: 'flex', gap: 2, mt: 2, justifyContent: 'flex-end' }}>
              <Button variant="outlined" onClick={handleReset}>
                Discard Changes
              </Button>
              <Button variant="contained" onClick={handleSave} disabled={loading}>
                Save Configuration
              </Button>
            </Box>
          )}
        </Paper>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>Confirm Configuration Save</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography>
            Are you sure you want to save changes to the PJSIP configuration? This will create a backup and reload Asterisk.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmSave} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : 'Confirm Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
