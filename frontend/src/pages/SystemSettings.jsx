import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  CircularProgress,
  Alert,
  Grid,
  Card,
  CardContent,
  IconButton,
  InputAdornment,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { api } from '../services/api';
import { toast } from 'react-toastify';

export default function SystemSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState({
    googleTtsApiKey: false,
    databaseUrl: false,
  });
  const [settings, setSettings] = useState({
    googleTtsApiKey: '',
    databaseUrl: '',
    ttsEngine: 'google',
    callerId: '',
    transportPort: 5566,
  });
  const [originalSettings, setOriginalSettings] = useState({
    googleTtsApiKey: '',
    databaseUrl: '',
    ttsEngine: 'google',
    callerId: '',
    transportPort: 5566,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get('/settings');
      
      if (response.data.success) {
        const loadedSettings = {
          googleTtsApiKey: response.data.settings.googleTtsApiKey || '',
          databaseUrl: response.data.settings.databaseUrl || '',
          ttsEngine: response.data.settings.ttsEngine || 'google',
          callerId: response.data.settings.callerId || '',
          transportPort: response.data.settings.transportPort || 5566,
        };
        
        setSettings(loadedSettings);
        setOriginalSettings(loadedSettings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      toast.error('Failed to load system settings');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field) => (event) => {
    const value = field === 'transportPort' ? parseInt(event.target.value) : event.target.value;
    setSettings({
      ...settings,
      [field]: value,
    });
  };

  const handleTogglePasswordVisibility = (field) => {
    setShowPassword({
      ...showPassword,
      [field]: !showPassword[field],
    });
  };

  const handleSave = async () => {
    if (JSON.stringify(settings) === JSON.stringify(originalSettings)) {
      toast.info('No changes to save');
      return;
    }

    // Validation
    if (settings.transportPort < 1024 || settings.transportPort > 65535) {
      toast.error('Transport Port must be between 1024 and 65535');
      return;
    }

    setSaving(true);
    try {
      const response = await api.post('/settings', settings);

      if (response.data.success) {
        setOriginalSettings(settings);
        toast.success('System settings saved successfully');
      } else {
        toast.error(response.data.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error(error.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(originalSettings);
    toast.info('Settings reset to last saved values');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">System Settings</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleReset}
            disabled={!hasChanges || saving}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Text-to-Speech Section */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Text-to-Speech (TTS) Configuration
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 500 }}>
                  TTS Engine Preference
                </Typography>
                <RadioGroup
                  value={settings.ttsEngine}
                  onChange={handleInputChange('ttsEngine')}
                >
                  <FormControlLabel
                    value="google"
                    control={<Radio />}
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          Google Cloud TTS
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#666' }}>
                          High quality, requires API key, charges apply
                        </Typography>
                      </Box>
                    }
                  />
                  <FormControlLabel
                    value="gtts"
                    control={<Radio />}
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          gTTS (Google Translate TTS)
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#666' }}>
                          Free, basic quality, no API key needed
                        </Typography>
                      </Box>
                    }
                  />
                </RadioGroup>
              </Box>

              <TextField
                fullWidth
                label="Google Cloud TTS API Key"
                type={showPassword.googleTtsApiKey ? 'text' : 'password'}
                value={settings.googleTtsApiKey}
                onChange={handleInputChange('googleTtsApiKey')}
                placeholder="Enter your Google Cloud TTS API key"
                helperText="Required only if using Google Cloud TTS engine. Visit console.cloud.google.com to create API key."
                sx={{ mb: 2 }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => handleTogglePasswordVisibility('googleTtsApiKey')}
                        edge="end"
                        size="small"
                      >
                        {showPassword.googleTtsApiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="caption">
                  💡 <strong>Tip:</strong> Google Cloud TTS provides natural-sounding speech with multiple voices and languages.
                  gTTS is a good fallback for cost-sensitive deployments.
                </Typography>
              </Alert>
            </CardContent>
          </Card>
        </Grid>

        {/* Database Section */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Database Configuration
              </Typography>

              <TextField
                fullWidth
                label="Database URL"
                type={showPassword.databaseUrl ? 'text' : 'password'}
                value={settings.databaseUrl}
                onChange={handleInputChange('databaseUrl')}
                placeholder="postgresql://user:password@localhost:5432/database"
                helperText="PostgreSQL connection string. Format: postgresql://user:password@host:port/dbname"
                sx={{ mb: 2 }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => handleTogglePasswordVisibility('databaseUrl')}
                        edge="end"
                        size="small"
                      >
                        {showPassword.databaseUrl ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Alert severity="warning" sx={{ mt: 2 }}>
                <Typography variant="caption">
                  ⚠️ <strong>Security Notice:</strong> Store credentials securely. Never commit database URLs to version control.
                  Use environment variables in production.
                </Typography>
              </Alert>
            </CardContent>
          </Card>
        </Grid>

        {/* Calling Configuration Section */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Calling Configuration
              </Typography>

              <TextField
                fullWidth
                label="Default Caller ID"
                value={settings.callerId}
                onChange={handleInputChange('callerId')}
                placeholder="e.g., +1234567890"
                helperText="Default outbound caller ID / From number for calls. Use E.164 format (e.g., +1234567890)"
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                label="Transport Port"
                type="number"
                value={settings.transportPort}
                onChange={handleInputChange('transportPort')}
                placeholder="5566"
                helperText="SIP transport port. Default: 5566. Range: 1024-65535"
                inputProps={{
                  min: 1024,
                  max: 65535,
                }}
                sx={{ mb: 2 }}
              />

              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="caption">
                  💡 <strong>Note:</strong> Changing the transport port requires Asterisk restart.
                  Common ports: 5060 (standard SIP), 5566 (alternative), 6060 (TLS).
                </Typography>
              </Alert>
            </CardContent>
          </Card>
        </Grid>

        {/* Information Section */}
        <Grid item xs={12}>
          <Card sx={{ backgroundColor: '#f5f5f5' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                ℹ️ System Information
              </Typography>

              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Settings Storage:</strong> All settings are stored in memory on the server.
                Settings will reset to defaults on server restart unless persisted to configuration files.
              </Typography>

              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Environment Variables:</strong> For production deployments, consider using environment
                variables instead of storing credentials in the UI.
              </Typography>

              <Typography variant="body2">
                <strong>Asterisk Reload:</strong> Some settings require Asterisk to be reloaded to take effect.
                You can reload Asterisk from the SIP Trunks page using the "Reload PJSIP" button.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Sticky Save Button (Mobile) */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 1, mt: 3, position: 'fixed', bottom: 20, right: 20 }}>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleReset}
          disabled={!hasChanges || saving}
          sx={{ minWidth: 120 }}
        >
          Reset
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={!hasChanges || saving}
          sx={{ minWidth: 120 }}
        >
          Save
        </Button>
      </Box>
    </Box>
  );
}
