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
        
        // ВСЕ эндпоинты аутентификации должны быть публичными
        const isPublicEndpoint = url.includes('/api/users-list') || 
                               url.includes('/api/stats/detailed') || 
                               url.includes('/api/connection-test') ||
                               url.includes('/api/auth/');
        
        console.log('🔐 Is public endpoint:', isPublicEndpoint);
        console.log('🔐 Has token:', !!this.authToken);
        
        // ЕСЛИ это НЕ публичный эндпоинт И нет токена - ошибка
        if (!isPublicEndpoint && !this.authToken) {
            throw new Error('Authentication required');
        }

        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        // ВАЖНО: НЕ добавляем Authorization header для эндпоинтов аутентификации
        // даже если токен есть!
        if (this.authToken && !url.includes('/api/auth/')) {
            defaultOptions.headers['Authorization'] = `Bearer ${this.authToken}`;
            console.log('🔐 Adding Authorization header');
        } else {
            console.log('🔐 NOT adding Authorization header (auth endpoint or no token)');
        }

        console.log('🔐 Final headers:', defaultOptions.headers);
        
        const response = await fetch(url, { ...defaultOptions, ...options });
        
        console.log('🔐 Response status:', response.status);
        
        if (response.status === 401) {
            this.clearAuthToken();
            throw new Error('Authentication required - please login again');
        }
        
        if (response.status === 403) {
            throw new Error('Access forbidden - insufficient permissions');
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

    // Защищенные эндпоинты (требуют авторизации)
    static async clearCache() {
        const response = await this.makeRequest('/api/clear-cache', {
            method: 'POST'
        });
        return await response.json();
    }

    static async debugUsers() {
        const response = await this.makeRequest('/api/debug/users');
        return await response.json();
    }

    static async findUsers() {
        const response = await this.makeRequest('/api/find-users');
        return await response.json();
    }

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
            method: 'POST',
            body: JSON.stringify({ email })
        });
        return await response.json();
    }
}