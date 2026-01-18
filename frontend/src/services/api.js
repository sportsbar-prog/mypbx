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
    // Get token fviterom localStorage and add to headers
    const token = localStorage.getItem('adminToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
    
    // Handle unauthorized errors
    if (error.response && error.response.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUsername');
      
      // Only redirect if not already on login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    
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
  
  // Provider Templates
  getProviders: () => apiClient.get('/providers'),
  getProviderDetails: (provider) => apiClient.get(`/providers/${provider}/details`),
  
  // User Templates
  getUserTemplates: () => apiClient.get('/user-templates'),
  getUserTemplateDetails: (template) => apiClient.get(`/user-templates/${template}`),
  
  // Trunks (with template support)
  getTrunks: () => apiClient.get('/trunks'),
  createTrunk: (data) => apiClient.post('/trunks', data),
  updateTrunk: (trunkName, data) => apiClient.put(`/trunks/${trunkName}`, data),
  deleteTrunk: (trunkName) => apiClient.delete(`/trunks/${trunkName}`),
  
  // SIP Users (with template support)
  getSipUsers: () => apiClient.get('/asterisk/sip-users'),
  getSipUser: (username) => apiClient.get(`/asterisk/sip-users/${username}`),
  createSipUser: (data) => apiClient.post('/asterisk/sip-users', data),
  updateSipUser: (username, data) => apiClient.put(`/asterisk/sip-users/${username}`, data),
  deleteSipUser: (username) => apiClient.delete(`/asterisk/sip-users/${username}`),
  applySipUsers: () => apiClient.post('/asterisk/sip-users/apply'),
  
  // Admin - API Keys Management
  get: (url, config) => apiClient.get(url, config),
  post: (url, data, config) => apiClient.post(url, data, config),
  put: (url, data, config) => apiClient.put(url, data, config),
  delete: (url, config) => apiClient.delete(url, config),
};

export default apiClient;
