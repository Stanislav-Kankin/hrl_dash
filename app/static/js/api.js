// API функции для работы с бэкендом
class BitrixAPI {
    static async getUsersList() {
        try {
            const response = await fetch('/api/users-list');
            return await response.json();
        } catch (error) {
            console.error('Error fetching users:', error);
            return { users: [], error: error.message };
        }
    }

    static async getActivitiesFiltered(filters = {}) {
        try {
            const params = new URLSearchParams();
            
            // Поддержка как дней, так и диапазона дат
            if (filters.days) params.append('days', filters.days);
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);
            
            if (filters.user_ids && filters.user_ids.length > 0) {
                params.append('user_ids', filters.user_ids.join(','));
            }
            if (filters.activity_type && filters.activity_type !== 'all') {
                params.append('activity_type', filters.activity_type);
            }

            const response = await fetch(`/api/stats/detailed?${params}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching filtered activities:', error);
            return { error: error.message };
        }
    }

    static async getDetailedStats(filters = {}) {
        try {
            const params = new URLSearchParams();
            
            // Поддержка как дней, так и диапазона дат
            if (filters.days) params.append('days', filters.days);
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);
            
            if (filters.user_ids && filters.user_ids.length > 0 && !filters.user_ids.includes('all')) {
                params.append('user_ids', filters.user_ids.join(','));
            }
            if (filters.activity_type && filters.activity_type !== 'all') {
                params.append('activity_type', filters.activity_type);
            }

            // Добавляем параметр для получения статистики
            params.append('include_statistics', 'true');

            const response = await fetch(`/api/stats/detailed?${params}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching detailed stats:', error);
            return { error: error.message };
        }
    }

    static async testConnection() {
        try {
            const response = await fetch('/api/connection-test');
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
            const response = await fetch('/api/clear-cache', { method: 'POST' });
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

            const response = await fetch(`/api/statistics?${params}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching statistics:', error);
            return { error: error.message };
        }
    }
}