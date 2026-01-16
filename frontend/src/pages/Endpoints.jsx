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
  Chip,
} from '@mui/material';
import { api } from '../services/api';
import { toast } from 'react-toastify';

export default function Endpoints() {
  const [endpoints, setEndpoints] = useState([]);

  useEffect(() => {
    fetchEndpoints();
  }, []);

  const fetchEndpoints = async () => {
    try {
      const response = await api.getEndpoints();
      setEndpoints(response.data);
    } catch (error) {
      console.error('Error fetching endpoints:', error);
      toast.error('Failed to fetch endpoints');
    }
  };

  const getStateColor = (state) => {
    const colors = {
      online: 'success',
      offline: 'error',
      unknown: 'default',
    };
    return colors[state?.toLowerCase()] || colors.unknown;
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Endpoints
      </Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Technology</TableCell>
              <TableCell>Resource</TableCell>
              <TableCell>State</TableCell>
              <TableCell>Active Channels</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {endpoints.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  No endpoints found
                </TableCell>
              </TableRow>
            ) : (
              endpoints.map((endpoint, index) => (
                <TableRow key={index}>
                  <TableCell>{endpoint.technology}</TableCell>
                  <TableCell>{endpoint.resource}</TableCell>
                  <TableCell>
                    <Chip
                      label={endpoint.state || 'Unknown'}
                      color={getStateColor(endpoint.state)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {endpoint.channel_ids?.length || 0}
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
