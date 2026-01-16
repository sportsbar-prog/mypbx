import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor
apiClient.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// API methods
export const api = {
  // Health check
  health: () => apiClient.get('/health'),
  
  // Asterisk info
  getAsteriskInfo: () => apiClient.get('/asterisk/info'),
  
  // Channels
  getChannels: () => apiClient.get('/channels'),
  getChannel: (channelId) => apiClient.get(`/channels/${channelId}`),
  originateCall: (data) => apiClient.post('/call/originate', data),
  hangupChannel: (channelId) => apiClient.post(`/channels/${channelId}/hangup`),
  answerChannel: (channelId) => apiClient.post(`/channels/${channelId}/answer`),
  muteChannel: (channelId, direction = 'both') => 
    apiClient.post(`/channels/${channelId}/mute`, null, { params: { direction } }),
  unmuteChannel: (channelId, direction = 'both') => 
    apiClient.post(`/channels/${channelId}/unmute`, null, { params: { direction } }),
  holdChannel: (channelId) => apiClient.post(`/channels/${channelId}/hold`),
  unholdChannel: (channelId) => apiClient.post(`/channels/${channelId}/unhold`),
  
  // Bridges
  getBridges: () => apiClient.get('/bridges'),
  createBridge: (type = 'mixing') => apiClient.post('/bridges', { type }),
  addChannelToBridge: (bridgeId, channelId) => 
    apiClient.post(`/bridges/${bridgeId}/channels`, { channel: channelId }),
  removeChannelFromBridge: (bridgeId, channelId) => 
    apiClient.delete(`/bridges/${bridgeId}/channels/${channelId}`),
  
  // Endpoints
  getEndpoints: () => apiClient.get('/endpoints'),
  getEndpoint: (tech, resource) => apiClient.get(`/endpoints/${tech}/${resource}`),
  
  // Admin - API Keys Management
  get: (url, config) => apiClient.get(url, config),
  post: (url, data, config) => apiClient.post(url, data, config),
  put: (url, data, config) => apiClient.put(url, data, config),
  delete: (url, config) => apiClient.delete(url, config),
};

export default apiClient;
