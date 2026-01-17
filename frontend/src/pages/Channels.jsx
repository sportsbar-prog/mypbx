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
  IconButton,
  Chip,
} from '@mui/material';
import CallEndIcon from '@mui/icons-material/CallEnd';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { api } from '../services/api';
import socketService from '../services/socket';
import { toast } from 'react-toastify';

export default function Channels() {
  const [channels, setChannels] = useState([]);

  useEffect(() => {
    fetchChannels();
    socketService.connect();

    const unsubscribeStart = socketService.on('call_started', handleCallStarted);
    const unsubscribeEnd = socketService.on('call_ended', handleCallEnded);
    const unsubscribeState = socketService.on('channel_state_change', handleStateChange);

    return () => {
      unsubscribeStart();
      unsubscribeEnd();
      unsubscribeState();
    };
  }, []);

  const fetchChannels = async () => {
    try {
      const response = await api.getChannels();
      setChannels(response.data.channels || []);
    } catch (error) {
      console.error('Error fetching channels:', error);
      toast.error('Failed to fetch channels');
    }
  };

  const handleCallStarted = (channel) => {
    setChannels((prev) => [...prev, channel]);
    toast.info(`New call started: ${channel.name}`);
  };

  const handleCallEnded = (data) => {
    setChannels((prev) => prev.filter((ch) => ch.id !== data.channel_id));
    toast.info('Call ended');
  };

  const handleStateChange = (channel) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.id === channel.id ? channel : ch))
    );
  };

  const handleHangup = async (channelId) => {
    try {
      await api.hangupChannel(channelId);
      toast.success('Call hung up');
    } catch (error) {
      toast.error('Failed to hangup call');
    }
  };

  const handleMute = async (channelId) => {
    try {
      await api.muteChannel(channelId);
      toast.success('Channel muted');
    } catch (error) {
      toast.error('Failed to mute channel');
    }
  };

  const handleUnmute = async (channelId) => {
    try {
      await api.unmuteChannel(channelId);
      toast.success('Channel unmuted');
    } catch (error) {
      toast.error('Failed to unmute channel');
    }
  };

  const handleHold = async (channelId) => {
    try {
      await api.holdChannel(channelId);
      toast.success('Channel on hold');
    } catch (error) {
      toast.error('Failed to hold channel');
    }
  };

  const handleUnhold = async (channelId) => {
    try {
      await api.unholdChannel(channelId);
      toast.success('Channel resumed');
    } catch (error) {
      toast.error('Failed to resume channel');
    }
  };

  const getStateColor = (state) => {
    const colors = {
      Up: 'success',
      Down: 'error',
      Ring: 'warning',
      Ringing: 'warning',
      default: 'default',
    };
    return colors[state] || colors.default;
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Active Channels
      </Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Channel ID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>State</TableCell>
              <TableCell>Caller ID</TableCell>
              <TableCell>Context</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {channels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  No active channels
                </TableCell>
              </TableRow>
            ) : (
              channels.map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell>{channel.id}</TableCell>
                  <TableCell>{channel.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={channel.state}
                      color={getStateColor(channel.state)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {channel.caller?.name || channel.caller?.number || 'Unknown'}
                  </TableCell>
                  <TableCell>
                    {channel.dialplan?.context || 'N/A'}
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleMute(channel.id)}
                      title="Mute"
                    >
                      <VolumeOffIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleUnmute(channel.id)}
                      title="Unmute"
                    >
                      <VolumeUpIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleHold(channel.id)}
                      title="Hold"
                    >
                      <PauseIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleUnhold(channel.id)}
                      title="Resume"
                    >
                      <PlayArrowIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleHangup(channel.id)}
                      title="Hangup"
                    >
                      <CallEndIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
