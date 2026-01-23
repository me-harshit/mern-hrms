import axios from 'axios';

const baseURL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : 'http://localhost:5000/api';

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

export default api;