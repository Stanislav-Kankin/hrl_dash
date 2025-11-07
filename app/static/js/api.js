// api.js - простой API без авторизации
class BitrixAPI {
    static async getUsersList() {
        const response = await fetch('/api/users-list');
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

        const response = await fetch(`/api/stats/detailed?${params}`);
        return await response.json();
    }

    static async testConnection() {
        const response = await fetch('/api/connection-test');
        return await response.json();
    }

    static async clearCache() {
        const response = await fetch('/api/clear-cache', { method: 'POST' });
        return await response.json();
    }

    // Заглушки для авторизации (чтобы не ломать код)
    static get authToken() { return null; }
    static setAuthToken() {}
    static clearAuthToken() {}
    static async getCurrentUser() { return null; }
    static async login() { return {}; }
    static async register() { return {}; }
    static async makeAuthenticatedRequest(url, options = {}) {
        const response = await fetch(url, options);
        return response;
    }
}