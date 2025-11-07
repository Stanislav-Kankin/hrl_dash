// api.js - API класс с авторизацией
class BitrixAPI {
    static get authToken() {
        return localStorage.getItem('auth_token');
    }

    static setAuthToken(token) {
        localStorage.setItem('auth_token', token);
    }

    static clearAuthToken() {
        localStorage.removeItem('auth_token');
    }

    static async makeAuthenticatedRequest(url, options = {}) {
        const token = this.authToken;
        if (!token) {
            throw new Error('Authentication required');
        }

        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const response = await fetch(url, { ...defaultOptions, ...options });
        
        if (response.status === 401) {
            this.clearAuthToken();
            throw new Error('Authentication required');
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response;
    }

    static async getCurrentUser() {
        const response = await this.makeAuthenticatedRequest('/api/auth/me');
        return await response.json();
    }

    static async login(email, password) {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Login failed');
        }
        
        return await response.json();
    }

    static async register(email, password, full_name = '') {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password, full_name })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Registration failed');
        }
        
        return await response.json();
    }

    static async getUsersList() {
        const response = await this.makeAuthenticatedRequest('/api/users-list');
        return await response.json();
    }

    static async getDetailedStats(filters = {}) {
        const params = new URLSearchParams();
        
        if (filters.days) params.append('days', filters.days);
        if (filters.start_date) params.append('start_date', filters.start_date);
        if (filters.end_date) params.append('end_date', filters.end_date);
        if (filters.user_ids && filters.user_ids.length > 0) {
            params.append('user_ids', filters.user_ids.join(','));
        }
        if (filters.activity_type) {
            params.append('activity_type', filters.activity_type);
        }
        params.append('include_statistics', 'true');

        const response = await this.makeAuthenticatedRequest(`/api/stats/detailed?${params}`);
        return await response.json();
    }

    static async testConnection() {
        const response = await this.makeAuthenticatedRequest('/api/connection-test');
        return await response.json();
    }

    static async clearCache() {
        const response = await this.makeAuthenticatedRequest('/api/clear-cache', {
            method: 'POST'
        });
        return await response.json();
    }

    static async debugUsers() {
        const response = await this.makeAuthenticatedRequest('/api/debug/users');
        return await response.json();
    }

    static async findUsers() {
        const response = await this.makeAuthenticatedRequest('/api/find-users');
        return await response.json();
    }

    static async getAllowedEmails() {
        const response = await this.makeAuthenticatedRequest('/api/admin/allowed-emails');
        return await response.json();
    }

    static async addAllowedEmail(email) {
        const response = await this.makeAuthenticatedRequest('/api/admin/add-allowed-email', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        return await response.json();
    }

    static async removeAllowedEmail(email) {
        const response = await this.makeAuthenticatedRequest('/api/admin/remove-allowed-email', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        return await response.json();
    }
}

const API_BASE = 'https://dev-cloud-ksa.ru/api';
const getAuthHeaders = () => {
    const token = localStorage.getItem('auth_token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
};

// Используйте в запросах:
fetch(`${API_BASE}/users-list`, {
    headers: getAuthHeaders()
})