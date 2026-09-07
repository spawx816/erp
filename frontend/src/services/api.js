const API_BASE = '/api/v1';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('sgc_token');
  const activeBranchId = localStorage.getItem('sgc_branch_id');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(activeBranchId ? { 'x-branch-id': activeBranchId } : {}),
    ...options.headers
  };

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        localStorage.removeItem('sgc_token');
        localStorage.removeItem('sgc_user');
        window.location.reload();
      }
      throw new Error(data.message || 'Error en la petición al servidor.');
    }

    return data;
  } catch (err) {
    throw err;
  }
}

export const api = {
  get: (endpoint, params = {}) => {
    const queryString = new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    return request(url, { method: 'GET' });
  },

  post: (endpoint, body) => request(endpoint, {
    method: 'POST',
    body: JSON.stringify(body)
  }),

  put: (endpoint, body) => request(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body)
  }),

  delete: (endpoint) => request(endpoint, { method: 'DELETE' })
};

export default api;
