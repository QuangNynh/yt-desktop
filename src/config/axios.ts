import axios from 'axios';

const BASE_URL = import.meta.env.DEV
  ? 'http://localhost:8695/api/v1/'
  : import.meta.env.VITE_SERVER_LOCAL || 'http://localhost:8696/api/v1/';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 600000, // 10 minutes for large downloads
});

export default api;
