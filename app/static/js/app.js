// app.js - УЛЬТРА-МИНИМАЛИСТИЧНАЯ РАБОЧАЯ ВЕРСИЯ
console.log('🚀 app.js LOADED');

let allUsers = [];
let currentUserStats = {};
let currentUser = null;

// ТОЛЬКО САМОЕ НЕОБХОДИМОЕ
document.addEventListener('DOMContentLoaded', function () {
    console.log('🔍 DOM Ready - Checking elements:');
    console.log('employeesSelect:', document.getElementById('employeesSelect'));
    console.log('startDate:', document.getElementById('startDate'));
    
    // Ждем 100мс и запускаем
    setTimeout(initApp, 100);
});

async function initApp() {
    try {
        console.log('🔄 initApp started');
        
        // 1. Проверяем авторизацию
        const token = localStorage.getItem('auth_token');
        if (!token) {
            showLoginPrompt();
            return;
        }
        
        // 2. Устанавливаем даты
        setDefaultDates();
        
        // 3. Загружаем пользователей
        await loadUsersList();
        
        // 4. Загружаем данные
        await applyFilters();
        
    } catch (error) {
        console.error('❌ initApp error:', error);
    }
}

function setDefaultDates() {
    const start = document.getElementById('startDate');
    const end = document.getElementById('endDate');
    
    if (start && end) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        start.value = startDate.toISOString().split('T')[0];
        end.value = new Date().toISOString().split('T')[0];
        console.log('✅ Dates set');
    }
}

async function loadUsersList() {
    try {
        const data = await fetch('/api/users-list').then(r => r.json());
        if (data.users) {
            allUsers = data.users;
            updateUserSelect();
        }
    } catch (error) {
        console.error('❌ loadUsersList error:', error);
    }
}

function updateUserSelect() {
    const select = document.getElementById('employeesSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="all">Все сотрудники</option>';
    allUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.ID;
        option.textContent = `${user.NAME} ${user.LAST_NAME}`;
        select.appendChild(option);
    });
}

// 🔴 ГЛАВНЫЙ ФИКС - СУПЕР-ПРОСТАЯ applyFilters
async function applyFilters() {
    console.log('🔄 applyFilters CALLED');
    
    // ПРЯМОЕ ПОЛУЧЕНИЕ ЭЛЕМЕНТОВ ПЕРЕД ИСПОЛЬЗОВАНИЕМ
    const employeesSelect = document.getElementById('employeesSelect');
    const activityTypeSelect = document.getElementById('activityTypeSelect'); 
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    
    console.log('🔍 Elements in applyFilters:', {
        employeesSelect: employeesSelect,
        activityTypeSelect: activityTypeSelect,
        startDate: startDate,
        endDate: endDate
    });
    
    // ЕСЛИ ХОТЬ ОДИН ЭЛЕМЕНТ NULL - ВЫХОДИМ
    if (!employeesSelect || !activityTypeSelect || !startDate || !endDate) {
        console.error('🚨 ELEMENTS ARE NULL - ABORTING');
        return;
    }
    
    try {
        // ТЕПЕРЬ безопасно получаем значения
        const employeeFilter = employeesSelect.value;
        const activityTypeFilter = activityTypeSelect.value;
        const startDateVal = startDate.value;
        const endDateVal = endDate.value;
        
        console.log('📋 Filter values:', {employeeFilter, activityTypeFilter, startDateVal, endDateVal});
        
        // Загружаем данные
        const params = new URLSearchParams({
            start_date: startDateVal,
            end_date: endDateVal,
            include_statistics: 'true'
        });
        
        if (employeeFilter !== 'all') params.append('user_ids', employeeFilter);
        if (activityTypeFilter !== 'all') params.append('activity_type', activityTypeFilter);
        
        const statsData = await fetch(`/api/stats/detailed?${params}`).then(r => r.json());
        
        if (statsData && statsData.user_stats) {
            displayUserStats(statsData);
        }
        
    } catch (error) {
        console.error('❌ applyFilters error:', error);
    }
}

function displayUserStats(statsData) {
    const tbody = document.getElementById('resultsBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    statsData.user_stats.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.user_name}</td>
            <td>${user.days_count || 0}</td>
            <td>${user.calls || 0}</td>
            <td>${user.comments || 0}</td>
            <td>${user.tasks || 0}</td>
            <td>${user.meetings || 0}</td>
            <td><strong>${user.total || 0}</strong></td>
            <td>${user.last_activity_date || 'Нет данных'}</td>
            <td><button class="quick-btn">Детали</button></td>
        `;
        tbody.appendChild(row);
    });
    
    console.log('✅ Data displayed');
}

function showLoginPrompt() {
    const tbody = document.getElementById('resultsBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8">Требуется авторизация</td></tr>';
    }
}

// Глобальные функции
window.applyFilters = applyFilters;
window.testConnection = () => alert('test');
window.clearCache = () => alert('cache cleared');

console.log('✅ app.js INITIALIZED');