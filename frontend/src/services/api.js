const API_BASE = '/api/v1';

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(newToken) {
  refreshSubscribers.forEach(cb => cb(newToken));
  refreshSubscribers = [];
}

async function tryRefreshToken() {
  const currentToken = localStorage.getItem('sgc_token');
  if (!currentToken) throw new Error('No token to refresh');

  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Refresh token rejected');
  }

  const data = await response.json();
  if (data.success && data.token) {
    localStorage.setItem('sgc_token', data.token);
    if (data.user) {
      localStorage.setItem('sgc_user', JSON.stringify(data.user));
    }
    return data.token;
  }
  throw new Error('Invalid refresh response');
}

async function request(endpoint, options = {}, isRetry = false) {
  const token = localStorage.getItem('sgc_token');
  const activeBranchId = localStorage.getItem('sgc_branch_id');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(activeBranchId && activeBranchId !== 'undefined' && activeBranchId !== 'null' ? { 'x-branch-id': activeBranchId } : {}),
    ...options.headers
  };

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);

    let data;
    try {
      data = await response.json();
    } catch (_jsonErr) {
      data = { success: false, message: `Error del servidor HTTP ${response.status}: ${response.statusText || 'Respuesta no válida'}` };
    }

    if (!response.ok) {
      if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh') && !isRetry) {
        if (!isRefreshing) {
          isRefreshing = true;
          try {
            const newToken = await tryRefreshToken();
            isRefreshing = false;
            onRefreshed(newToken);
            const updatedOptions = {
              ...options,
              headers: {
                ...options?.headers,
                'Authorization': `Bearer ${newToken}`
              }
            };
            return request(endpoint, updatedOptions, true);
          } catch (refreshErr) {
            isRefreshing = false;
            refreshSubscribers = [];
            localStorage.removeItem('sgc_token');
            localStorage.removeItem('sgc_user');
            window.location.reload();
            throw new Error('Sesión expirada. Por favor inicie sesión nuevamente.');
          }
        } else {
          // Await ongoing refresh, then retry with new token
          return new Promise((resolve, reject) => {
            subscribeTokenRefresh((newToken) => {
              const updatedOptions = {
                ...options,
                headers: {
                  ...options?.headers,
                  'Authorization': `Bearer ${newToken}`
                }
              };
              request(endpoint, updatedOptions, true).then(resolve).catch(reject);
            });
          });
        }
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

  post: (endpoint, body, options = {}) => request(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
    ...options
  }),

  put: (endpoint, body, options = {}) => request(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
    ...options
  }),

  delete: (endpoint, options = {}) => request(endpoint, { method: 'DELETE', ...options })
};

export default api;
