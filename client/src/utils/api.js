import axios from 'axios';

// --- 1. EXPORT THE SERVER URL ---
// This handles your images and files perfectly in both Local and Live environments
export const SERVER_URL = process.env.NODE_ENV === 'production'
  ? ''
  : 'http://localhost:5000';

// --- 2. SET UP API BASE URL ---
const baseURL = `${SERVER_URL}/api`;

const api = axios.create({
  baseURL: baseURL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['x-auth-token'] = token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response, 
  (error) => {
    // If the server rejects the token (Expired or Invalid)
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Force redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;