const TOKEN_KEY = 'auth_token';
const ROLE_KEY = 'user_role';

// --- Token --- //

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (token) => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

// --- Role --- //

export const getUserRole = () => localStorage.getItem(ROLE_KEY);

export const setUserRole = (role) => {
    localStorage.setItem(ROLE_KEY, role);
};

export const removeUserRole = () => {
    localStorage.removeItem(ROLE_KEY);
};
