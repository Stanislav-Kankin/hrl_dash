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

    static async makeRequest(url, options = {}) {
        try {
            console.log('🔐 Making request to:', url);

            // Создаем чистый объект headers
            const headers = {
                'Content-Type': 'application/json'
            };

            // Добавляем авторизацию если есть валидный токен
            const token = this.authToken;
            if (token && token.length > 50 && !token.includes('…')) { // Проверяем что токен валидный
                headers['Authorization'] = `Bearer ${token}`;
                console.log('🔐 Added Authorization header');
            }

            const requestOptions = {
                ...options,
                headers: {
                    ...headers,
                    ...options.headers
                }
            };

            console.log('🔐 Request options:', requestOptions);

            const response = await fetch(url, requestOptions);

            console.log('🔐 Response status:', response.status);

            if (response.status === 401) {
                this.clearAuthToken();
                throw new Error('Authentication required - please login again');
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            return response;
        } catch (error) {
            console.error('❌ API request failed:', error);
            throw error;
        }
    }

    // Аутентификация
    static async getCurrentUser() {
        const response = await this.makeRequest('/api/auth/me');
        return await response.json();
    }

    static async login(email, password) {
        const response = await this.makeRequest('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        return await response.json();
    }

    static async register(email, password, full_name = '') {
        const response = await this.makeRequest('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, full_name })
        });
        return await response.json();
    }

    // Публичные эндпоинты (не требуют авторизации)
    static async getUsersList() {
        const response = await fetch('/api/users-list');
        return await response.json();
    }

    static async getDetailedStats(filters = {}) {
        const params = new URLSearchParams();

        if (filters.start_date) params.append('start_date', filters.start_date);
        if (filters.end_date) params.append('end_date', filters.end_date);
        if (filters.user_ids && filters.user_ids.length > 0) {
            params.append('user_ids', filters.user_ids.join(','));
        }
        if (filters.activity_type) {
            params.append('activity_type', filters.activity_type);
        }
        params.append('include_statistics', 'true');
        params.append('include_activities', 'false');

        console.log('🔍 Fetching stats with params:', params.toString());

        const response = await fetch(`/api/stats/detailed?${params}`);
        return await response.json();
    }

    static async testConnection() {
        const response = await fetch('/api/connection-test');
        return await response.json();
    }

    // Защищенные эндпоинты (требуют авторизации)
    static async clearCache() {
        const response = await this.makeRequest('/api/clear-cache', {
            method: 'POST'
        });
        return await response.json();
    }

    // Административные функции
    static async getAllowedEmails() {
        const response = await this.makeRequest('/api/admin/allowed-emails');
        return await response.json();
    }

    static async addAllowedEmail(email) {
        const response = await this.makeRequest('/api/admin/add-allowed-email', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        return await response.json();
    }

    static async removeAllowedEmail(email) {
        const response = await this.makeRequest('/api/admin/remove-allowed-email', {
            method: 'DELETE',
            body: JSON.stringify({ email })
        });
        return await response.json();
    }

    static async getUsersCount() {
        const response = await this.makeRequest('/api/admin/users-count');
        return await response.json();
    }

    // Добавьте эти методы в класс BitrixAPI:

    static async getDealsList(startDate = null, endDate = null, userIds = []) {
        let url = '/api/deals/list';
        const params = [];

        if (startDate) params.push(`start_date=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`end_date=${encodeURIComponent(endDate)}`);
        if (userIds.length > 0) params.push(`user_ids=${userIds.join(',')}`);

        if (params.length > 0) {
            url += `?${params.join('&')}`;
        }

        const response = await this.makeRequest(url);
        return await response.json();
    }

    static async getDealsStats(startDate = null, endDate = null, userIds = []) {
        let url = '/api/deals/stats';
        const params = [];

        if (startDate) params.push(`start_date=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`end_date=${encodeURIComponent(endDate)}`);
        if (userIds.length > 0) params.push(`user_ids=${userIds.join(',')}`);

        if (params.length > 0) {
            url += `?${params.join('&')}`;
        }

        const response = await this.makeRequest(url);
        return await response.json();
    }

    static async getDealsStages() {
        const response = await this.makeRequest('/api/deals/stages');
        return await response.json();
    }

    static async getAllUsers() {
        const response = await this.makeRequest('/api/all-users');
        return await response.json();
    }

    static async getDealsList(startDate = null, endDate = null, userIds = [], limit = null) {
        let url = '/api/deals/list';
        const params = [];

        if (startDate) params.push(`start_date=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`end_date=${encodeURIComponent(endDate)}`);
        if (userIds.length > 0) params.push(`user_ids=${userIds.join(',')}`);
        if (limit) params.push(`limit=${limit}`);

        if (params.length > 0) {
            url += `?${params.join('&')}`;
        }

        const response = await this.makeRequest(url);
        return await response.json();
    }

    static async getUserAllDeals(userIds = []) {
        let url = '/api/deals/user-all';
        if (userIds.length > 0) {
            url += `?user_ids=${userIds.join(',')}`;
        }

        const response = await this.makeRequest(url);
        return await response.json();
    }
}