// API функции для работы с бэкендом
class BitrixAPI {
    static authToken = localStorage.getItem('authToken');

    static async makeAuthenticatedRequest(url, options = {}) {
        if (this.authToken) {
            options.headers = {
                ...options.headers,
                'Authorization': `Bearer ${this.authToken}`
            };
        }
        
        const response = await fetch(url, options);
        
        if (response.status === 401) {
            // Не авторизован - показываем модалку
            if (typeof showAuthModal === 'function') {
                showAuthModal();
            }
            throw new Error('Authentication required');
        }
        
        return response;
    }

    static setAuthToken(token) {
        this.authToken = token;
        localStorage.setItem('authToken', token);
    }

    static clearAuthToken() {
        this.authToken = null;
        localStorage.removeItem('authToken');
    }

    static async getUsersList() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/users-list');
            return await response.json();
        } catch (error) {
            console.error('Error fetching users:', error);
            return { users: [], error: error.message };
        }
    }

    static async getActivitiesFiltered(filters = {}) {
        try {
            const params = new URLSearchParams();
            
            if (filters.days) params.append('days', filters.days);
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);
            
            if (filters.user_ids && filters.user_ids.length > 0) {
                params.append('user_ids', filters.user_ids.join(','));
            }
            if (filters.activity_type && filters.activity_type !== 'all') {
                params.append('activity_type', filters.activity_type);
            }

            const response = await this.makeAuthenticatedRequest(`/api/stats/detailed?${params}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching filtered activities:', error);
            return { error: error.message };
        }
    }

    static async getDetailedStats(filters = {}) {
        try {
            const params = new URLSearchParams();
            
            if (filters.days) params.append('days', filters.days);
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);
            
            if (filters.user_ids && filters.user_ids.length > 0 && !filters.user_ids.includes('all')) {
                params.append('user_ids', filters.user_ids.join(','));
            }
            if (filters.activity_type && filters.activity_type !== 'all') {
                params.append('activity_type', filters.activity_type);
            }

            params.append('include_statistics', 'true');

            const response = await this.makeAuthenticatedRequest(`/api/stats/detailed?${params}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching detailed stats:', error);
            return { error: error.message };
        }
    }

    static async testConnection() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/connection-test');
            return await response.json();
        } catch (error) {
            console.error('Error testing connection:', error);
            return { connected: false, error: error.message };
        }
    }

    static async getHealth() {
        try {
            const response = await fetch('/api/health');
            return await response.json();
        } catch (error) {
            console.error('Error health check:', error);
            return { status: 'error', error: error.message };
        }
    }

    static async clearCache() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/clear-cache', { method: 'POST' });
            return await response.json();
        } catch (error) {
            console.error('Error clearing cache:', error);
            return { success: false, error: error.message };
        }
    }

    static async getStatistics(filters = {}) {
        try {
            const params = new URLSearchParams();
            
            if (filters.days) params.append('days', filters.days);
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);
            
            if (filters.user_ids && filters.user_ids.length > 0) {
                params.append('user_ids', filters.user_ids.join(','));
            }

            const response = await this.makeAuthenticatedRequest(`/api/statistics?${params}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching statistics:', error);
            return { error: error.message };
        }
    }

    // Auth API methods
    static async login(email, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });
            return await response.json();
        } catch (error) {
            console.error('Error logging in:', error);
            return { error: error.message };
        }
    }

    static async register(email, password, full_name) {
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password, full_name })
            });
            return await response.json();
        } catch (error) {
            console.error('Error registering:', error);
            return { error: error.message };
        }
    }

    static async getCurrentUser() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/auth/me');
            return await response.json();
        } catch (error) {
            console.error('Error getting current user:', error);
            return { error: error.message };
        }
    }
}