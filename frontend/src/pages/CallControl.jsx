import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
} from '@mui/material';
import CallIcon from '@mui/icons-material/Call';
import { api } from '../services/api';
import { toast } from 'react-toastify';

export default function CallControl() {
  const [callData, setCallData] = useState({
    endpoint: 'PJSIP/1000',
    extension: '1001',
    context: 'default',
    callerId: '',
  });

  const handleChange = (e) => {
    setCallData({
      ...callData,
      [e.target.name]: e.target.value,
    });
  };

  const handleOriginateCall = async () => {
    try {
      await api.originateCall(callData);
      toast.success('Call originated successfully');
      setCallData({
        endpoint: 'PJSIP/1000',
        extension: '1001',
        context: 'default',
        callerId: '',
      });
    } catch (error) {
      console.error('Error originating call:', error);
      toast.error('Failed to originate call');
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Call Control
      </Typography>

      <Paper sx={{ p: 3, maxWidth: 600 }}>
        <Typography variant="h6" gutterBottom>
          Originate Call
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Endpoint"
              name="endpoint"
              value={callData.endpoint}
              onChange={handleChange}
              placeholder="PJSIP/1000"
              helperText="Format: Technology/Resource (e.g., PJSIP/1000)"
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Extension"
              name="extension"
              value={callData.extension}
              onChange={handleChange}
              placeholder="1001"
              helperText="The extension to dial"
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Context"
              name="context"
              value={callData.context}
              onChange={handleChange}
              placeholder="default"
              helperText="Dialplan context"
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Caller ID (Optional)"
              name="callerId"
              value={callData.callerId}
              onChange={handleChange}
              placeholder='"John Doe" <1000>'
              helperText='Format: "Name" <number>'
            />
          </Grid>

          <Grid item xs={12}>
            <Button
              variant="contained"
              color="primary"
              fullWidth
              size="large"
              startIcon={<CallIcon />}
              onClick={handleOriginateCall}
            >
              Originate Call
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mt: 3, maxWidth: 600 }}>
        <Typography variant="h6" gutterBottom>
          Quick Dial Examples
        </Typography>
        <Typography variant="body2" paragraph>
          • Extension to Extension: PJSIP/1000 → 1001
        </Typography>
        <Typography variant="body2" paragraph>
          • Conference Room: PJSIP/1000 → 8000
        </Typography>
        <Typography variant="body2" paragraph>
          • Echo Test: PJSIP/1000 → 9999
        </Typography>
      </Paper>
    </Box>
  );
}
