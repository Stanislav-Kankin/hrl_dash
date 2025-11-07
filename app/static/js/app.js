// app.js - основной файл приложения
const ACTIVITY_TYPES = {
    "1": { name: "Встреча", class: "badge-meeting" },
    "2": { name: "Звонок", class: "badge-call" },
    "4": { name: "Задача", class: "badge-task" },
    "6": { name: "Комментарий", class: "badge-comment" }
};

let allUsers = [];
let currentUserStats = {};
let currentUser = null;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', async function () {
    console.log('🚀 Dashboard loading...');
    initializeEventListeners();
    await initializeDashboard();
    await checkAuthStatus(); // Добавьте await здесь
});

function initializeEventListeners() {
    const periodSelect = document.getElementById('periodSelect');
    if (periodSelect) {
        periodSelect.addEventListener('change', function () {
            const customRange = document.getElementById('customDateRange');
            if (this.value === 'custom') {
                customRange.style.display = 'block';
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 30);
                
                document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
                document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
            } else {
                customRange.style.display = 'none';
            }
        });
    }

    const modal = document.getElementById('authModal');
    const closeBtn = document.querySelector('.close');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', hideAuthModal);
    }
    
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            hideAuthModal();
        }
    });
}

async function checkAuthStatus() {
    const token = BitrixAPI.authToken;
    console.log('🔐 Checking auth, token exists:', !!token);
    
    const authButton = document.getElementById('authButton');
    
    if (!token) {
        console.log('❌ No token found');
        if (authButton) {
            authButton.textContent = '🔐 Вход для админа';
            authButton.onclick = showAuthModal;
        }
        return;
    }

    try {
        console.log('🔐 Trying to get current user...');
        const userData = await BitrixAPI.getCurrentUser();
        console.log('🔐 User data response:', userData);
        
        currentUser = userData;
        console.log('✅ User authenticated:', currentUser);
        updateUIForAuth();
        
        if (authButton) {
            authButton.textContent = `👤 ${currentUser.full_name || currentUser.email} (Выйти)`;
            authButton.onclick = logout;
        }
    } catch (error) {
        console.error('🔐 Auth check failed:', error);
        BitrixAPI.clearAuthToken();
        if (authButton) {
            authButton.textContent = '🔐 Вход для админа';
            authButton.onclick = showAuthModal;
        }
    }
}

async function initializeDashboard() {
    try {
        console.log('📊 Initializing dashboard...');
        
        ActivityCharts.initCharts();
        await loadUsersList();
        await applyFilters();

    } catch (error) {
        console.error('❌ Dashboard init error:', error);
        showError('resultsBody', `Ошибка: ${error.message}`);
    }
}

// Функции аутентификации
function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'block';
        showLogin();
    }
}

function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

async function login(event) {
    if (event) event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        alert('❌ Пожалуйста, заполните все поля');
        return false;
    }

    try {
        console.log('🔐 Attempting login for:', email);
        const data = await BitrixAPI.login(email, password);
        console.log('🔐 Login response:', data);
        
        if (data.access_token) {
            BitrixAPI.setAuthToken(data.access_token);
            console.log('✅ Token set');
            hideAuthModal();
            await checkAuthStatus();
        }
    } catch (error) {
        console.error('❌ Login error:', error);
        alert('❌ Ошибка входа: ' + error.message);
    }
    
    return false;
}

async function register(event) {
    if (event) event.preventDefault();
    
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const full_name = document.getElementById('registerName').value;

    if (!email || !password) {
        alert('❌ Пожалуйста, заполните email и пароль');
        return false;
    }

    try {
        console.log('🔐 Attempting registration for:', email);
        const data = await BitrixAPI.register(email, password, full_name);
        console.log('🔐 Registration response:', data);
        
        if (data.email) {
            alert('✅ Регистрация успешна! Теперь войдите в систему.');
            showLogin();
        }
    } catch (error) {
        console.error('❌ Registration error:', error);
        alert('❌ Ошибка регистрации: ' + error.message);
    }
    
    return false;
}

function updateUIForAuth() {
    const authButton = document.getElementById('authButton');
    if (authButton && currentUser) {
        authButton.textContent = `👤 ${currentUser.full_name || currentUser.email} (Выйти)`;
        authButton.onclick = logout;
    }
}

function logout() {
    BitrixAPI.clearAuthToken();
    currentUser = null;
    
    const authButton = document.getElementById('authButton');
    if (authButton) {
        authButton.textContent = '🔐 Вход для админа';
        authButton.onclick = showAuthModal;
    }
    
    // Не перезагружаем страницу, просто обновляем UI
    alert('✅ Вы вышли из системы');
}

// Основные функции
async function loadUsersList() {
    try {
        showLoading('resultsBody', 'Загрузка сотрудников...');
        const data = await BitrixAPI.getUsersList();

        if (data.users) {
            allUsers = data.users;
            updateUserSelect();
        } else {
            throw new Error(data.error || 'Не удалось загрузить сотрудников');
        }
    } catch (error) {
        console.error('Ошибка загрузки сотрудников:', error);
        showError('resultsBody', `Ошибка: ${error.message}`);
    }
}

async function applyFilters() {
    try {
        showLoading('resultsBody', 'Загрузка данных...');
        
        const period = document.getElementById('periodSelect').value;
        const employeeFilter = document.getElementById('employeesSelect').value;
        const activityTypeFilter = document.getElementById('activityTypeSelect').value;

        const filters = {
            user_ids: employeeFilter === 'all' ? [] : [employeeFilter],
            activity_type: activityTypeFilter === 'all' ? null : activityTypeFilter
        };

        if (period === 'custom') {
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            if (startDate && endDate) {
                filters.start_date = startDate;
                filters.end_date = endDate;
            }
        } else {
            filters.days = parseInt(period);
        }

        const statsData = await BitrixAPI.getDetailedStats(filters);
        if (statsData) {
            displayUserStats(statsData);
        }

    } catch (error) {
        console.error('Error applying filters:', error);
        showError('resultsBody', `Ошибка: ${error.message}`);
    }
}

function displayUserStats(statsData) {
    if (!statsData || !statsData.user_stats) {
        showError('resultsBody', 'Нет данных для отображения');
        return;
    }

    document.getElementById('activeUsers').textContent = statsData.active_users || 0;
    document.getElementById('totalActivities').textContent = statsData.total_activities || 0;

    if (statsData.statistics) {
        ActivityCharts.updateAllCharts(statsData.statistics);
    }

    const tbody = document.getElementById('resultsBody');
    
    if (statsData.user_stats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Нет данных</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    statsData.user_stats.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="employee-name">${user.user_name}</td>
            <td>${user.days_count || 0}</td>
            <td><span class="activity-badge badge-call">${user.calls || 0}</span></td>
            <td><span class="activity-badge badge-comment">${user.comments || 0}</span></td>
            <td><span class="activity-badge badge-task">${user.tasks || 0}</span></td>
            <td><strong>${user.total || 0}</strong></td>
            <td>${user.last_activity_date || 'Нет данных'}</td>
            <td><button class="quick-btn" onclick="showUserDetails('${user.user_id}')">Детали</button></td>
        `;
        tbody.appendChild(row);
    });

    currentUserStats = {};
    statsData.user_stats.forEach(user => {
        currentUserStats[user.user_id] = user;
    });
}

function updateUserSelect() {
    const select = document.getElementById('employeesSelect');
    select.innerHTML = '<option value="all">Все сотрудники</option>';

    allUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.ID;
        option.textContent = `${user.NAME} ${user.LAST_NAME}${user.WORK_POSITION ? ` (${user.WORK_POSITION})` : ''}`;
        select.appendChild(option);
    });
}

// Вспомогательные функции
function showLoading(elementId, message = 'Загрузка...') {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `<tr><td colspan="8" class="loading">${message}</td></tr>`;
    }
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `<tr><td colspan="8" style="color: red; text-align: center; padding: 20px;">${message}</td></tr>`;
    }
}

// Глобальные функции
window.applyFilters = applyFilters;
window.login = login;
window.register = register;
window.showLogin = showLogin;
window.showRegister = showRegister;
window.logout = logout;

window.testConnection = async function() {
    try {
        const data = await BitrixAPI.testConnection();
        alert(data.connected ? '✅ Подключение успешно!' : '❌ Ошибка подключения');
    } catch (error) {
        alert('❌ Ошибка: ' + error.message);
    }
};

window.clearCache = async function() {
    try {
        if (!BitrixAPI.authToken) {
            alert('❌ Для этой функции требуется авторизация');
            showAuthModal();
            return;
        }
        const result = await BitrixAPI.clearCache();
        if (result.success) {
            alert('✅ Кэш очищен!');
            await applyFilters();
        }
    } catch (error) {
        console.error('Cache clear error:', error);
        if (error.message.includes('401') || error.message.includes('Authentication')) {
            alert('❌ Ошибка авторизации. Пожалуйста, войдите снова.');
            showAuthModal();
        } else {
            alert('❌ Ошибка: ' + error.message);
        }
    }
};

window.debugUsers = async function() {
    try {
        if (!BitrixAPI.authToken) {
            alert('❌ Для этой функции требуется авторизация');
            showAuthModal();
            return;
        }
        const data = await BitrixAPI.debugUsers();
        let message = `Всего пользователей: ${data.total_users}\n`;
        message += `Пресейл пользователей: ${data.total_presales_users}\n\n`;

        if (data.presales_users) {
            message += "Пресейл сотрудники:\n";
            data.presales_users.forEach(user => {
                message += `- ${user.NAME} ${user.LAST_NAME} (${user.WORK_POSITION || 'нет должности'}) - ID: ${user.ID}\n`;
            });
        }

        alert(message);
    } catch (error) {
        console.error('Debug users error:', error);
        if (error.message.includes('401') || error.message.includes('Authentication')) {
            alert('❌ Ошибка авторизации. Пожалуйста, войдите снова.');
            showAuthModal();
        } else {
            alert('Ошибка отладки: ' + error.message);
        }
    }
};

window.findUsers = async function() {
    try {
        if (!BitrixAPI.authToken) {
            alert('❌ Для этой функции требуется авторизация');
            showAuthModal();
            return;
        }
        const data = await BitrixAPI.findUsers();
        let message = `Найдено ${data.found_users.length} из ${data.target_names.length} сотрудников\n\n`;

        if (data.found_users.length > 0) {
            message += "Найденные сотрудники:\n";
            data.found_users.forEach(user => {
                message += `- ${user.FULL_NAME} (${user.WORK_POSITION || 'нет должности'}) - ID: ${user.ID}\n`;
            });
        } else {
            message += "Сотрудники не найдены!\n";
        }

        alert(message);
    } catch (error) {
        console.error('Find users error:', error);
        if (error.message.includes('401') || error.message.includes('Authentication')) {
            alert('❌ Ошибка авторизации. Пожалуйста, войдите снова.');
            showAuthModal();
        } else {
            alert('Ошибка поиска: ' + error.message);
        }
    }
};

window.showAdminPanel = async function() {
    try {
        if (!BitrixAPI.authToken) {
            alert('❌ Для этой функции требуется авторизация');
            showAuthModal();
            return;
        }
        const data = await BitrixAPI.getAllowedEmails();
        let message = '📧 Разрешенные email-адреса:\n\n';
        
        if (data.allowed_emails && data.allowed_emails.length > 0) {
            data.allowed_emails.forEach(email => {
                message += `• ${email}\n`;
            });
        } else {
            message += 'Нет разрешенных email-адресов\n';
        }
        
        const action = prompt(message + '\n\nВведите:\n1 - для добавления email\n2 - для удаления email\n(или Отмена для выхода)');
        
        if (action === '1') {
            const addEmail = prompt('Введите email для добавления в белый список:');
            if (addEmail) {
                await BitrixAPI.addAllowedEmail(addEmail);
                alert('✅ Email добавлен в белый список');
            }
        } else if (action === '2') {
            const removeEmail = prompt('Введите email для удаления из белого списка:');
            if (removeEmail) {
                await BitrixAPI.removeAllowedEmail(removeEmail);
                alert('✅ Email удален из белого списка');
            }
        }
    } catch (error) {
        console.error('Admin panel error:', error);
        if (error.message.includes('401') || error.message.includes('Authentication')) {
            alert('❌ Ошибка авторизации. Пожалуйста, войдите снова.');
            showAuthModal();
        } else {
            alert('❌ Ошибка: ' + error.message);
        }
    }
};

window.addAllowedEmail = async function() {
    if (!BitrixAPI.authToken) {
        alert('❌ Для этой функции требуется авторизация');
        showAuthModal();
        return;
    }
    const email = prompt('Введите email для добавления в белый список:');
    if (email) {
        try {
            await BitrixAPI.addAllowedEmail(email);
            alert('✅ Email добавлен в белый список');
        } catch (error) {
            console.error('Add email error:', error);
            if (error.message.includes('401') || error.message.includes('Authentication')) {
                alert('❌ Ошибка авторизации. Пожалуйста, войдите снова.');
                showAuthModal();
            } else {
                alert('❌ Ошибка: ' + error.message);
            }
        }
    }
};

// Добавить принудительный показ формы авторизации
function initAuth() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        console.log('🔐 No auth token - showing login form');
        setTimeout(() => showAuthModal(), 1000);
    }
}

// Вызывать при загрузке
document.addEventListener('DOMContentLoaded', function() {
    initAuth();
    // остальная инициализация...
});