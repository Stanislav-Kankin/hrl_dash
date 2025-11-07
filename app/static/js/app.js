// app.js - единый файл для всего приложения

// Глобальные переменные
let allUsers = [];
let currentUserStats = {};
let currentStatistics = {};
let currentUser = null;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', async function () {
    console.log('🚀 Dashboard loading...');
    initializeEventListeners();
    await checkAuthAndInitialize();
});

function initializeEventListeners() {
    // Обработчик изменения периода
    const periodSelect = document.getElementById('periodSelect');
    if (periodSelect) {
        periodSelect.addEventListener('change', function () {
            const customRange = document.getElementById('customDateRange');
            if (this.value === 'custom') {
                customRange.style.display = 'block';
                // Устанавливаем даты по умолчанию
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

    // Обработчики для модального окна авторизации
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

async function checkAuthAndInitialize() {
    // Пропускаем авторизацию - сразу грузим дашборд
    console.log('Skipping auth, loading dashboard directly');
    await initializeDashboard();
    
    // Скрываем модалку авторизации
    hideAuthModal();
}

async function initializeDashboard() {
    try {
        console.log('📊 Initializing dashboard...');
        
        // Инициализируем графики
        ActivityCharts.initCharts();
        
        // Загружаем список сотрудников
        await loadUsersList();

        // Загружаем начальную статистику
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
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const data = await BitrixAPI.login(email, password);
        
        if (data.access_token) {
            BitrixAPI.setAuthToken(data.access_token);
            hideAuthModal();
            await checkAuthAndInitialize();
        } else {
            alert('❌ Ошибка входа: ' + (data.detail || data.error));
        }
    } catch (error) {
        alert('❌ Ошибка сети: ' + error.message);
    }
    
    return false;
}

async function register(event) {
    event.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const full_name = document.getElementById('registerName').value;

    try {
        const data = await BitrixAPI.register(email, password, full_name);
        
        if (data.email) {
            alert('✅ Регистрация успешна! Теперь войдите.');
            showLogin();
        } else {
            alert('❌ Ошибка регистрации: ' + (data.detail || data.error));
        }
    } catch (error) {
        alert('❌ Ошибка сети: ' + error.message);
    }
    
    return false;
}

function updateUIForAuth() {
    const header = document.querySelector('.header');
    if (header && currentUser) {
        // Удаляем старую информацию если есть
        const oldUserInfo = header.querySelector('.user-info');
        if (oldUserInfo) oldUserInfo.remove();
        
        // Добавляем информацию о пользователе
        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';
        userInfo.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            color: white;
            text-align: right;
            background: rgba(255,255,255,0.1);
            padding: 10px 15px;
            border-radius: 8px;
            backdrop-filter: blur(10px);
        `;
        
        userInfo.innerHTML = `
            <div style="font-size: 14px; margin-bottom: 5px;">👤 ${currentUser.full_name || currentUser.email}</div>
            <button onclick="logout()" style="
                background: rgba(255,255,255,0.3);
                border: none;
                color: white;
                padding: 5px 12px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 12px;
            ">Выйти</button>
        `;
        
        header.style.position = 'relative';
        header.appendChild(userInfo);
    }
}

function logout() {
    BitrixAPI.clearAuthToken();
    currentUser = null;
    location.reload();
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

        // Обработка периода
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

    // Обновляем summary cards
    document.getElementById('activeUsers').textContent = statsData.active_users || 0;
    document.getElementById('totalActivities').textContent = statsData.total_activities || 0;

    // Обновляем графики если есть статистика
    if (statsData.statistics) {
        ActivityCharts.updateAllCharts(statsData.statistics);
    }

    // Отображаем таблицу
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

    // Сохраняем для детализации
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

// Глобальные функции для кнопок
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
        const result = await BitrixAPI.clearCache();
        if (result.success) {
            alert('✅ Кэш очищен!');
            await applyFilters();
        }
    } catch (error) {
        alert('❌ Ошибка: ' + error.message);
    }
};

// Функции для кнопок отладки
window.debugUsers = async function() {
    try {
        const response = await fetch('/api/debug/users');
        const data = await response.json();

        console.log('Debug users data:', data);

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
        alert('Ошибка отладки: ' + error.message);
    }
};

window.findUsers = async function() {
    try {
        const response = await fetch('/api/find-users');
        const data = await response.json();

        console.log('Find users data:', data);

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
        alert('Ошибка поиска: ' + error.message);
    }
};

// Функции для админ панели
window.showAdminPanel = async function() {
    try {
        const response = await fetch('/api/admin/allowed-emails');
        const data = await response.json();
        
        let message = '📧 Разрешенные email-адреса:\n\n';
        data.allowed_emails.forEach(email => {
            message += `• ${email}\n`;
        });
        
        message += '\nДля добавления/удаления используйте кнопки ниже:';
        
        const addEmail = prompt(message + '\n\nВведите email для добавления (или отмена):');
        if (addEmail) {
            await addAllowedEmail(addEmail);
        }
    } catch (error) {
        console.error('Admin panel error:', error);
        alert('❌ Ошибка загрузки списка: ' + error.message);
    }
};

window.addAllowedEmail = async function(email = null) {
    const emailToAdd = email || prompt('Введите email для добавления в белый список:');
    if (emailToAdd) {
        try {
            const response = await fetch('/api/admin/add-allowed-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: emailToAdd })
            });
            const data = await response.json();
            alert('✅ ' + data.message);
        } catch (error) {
            console.error('Add email error:', error);
            alert('❌ Ошибка добавления: ' + error.message);
        }
    }
};

window.removeAllowedEmail = async function() {
    const email = prompt('Введите email для удаления из белого списка:');
    if (email) {
        try {
            const response = await fetch('/api/admin/remove-allowed-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: email })
            });
            const data = await response.json();
            alert('✅ ' + data.message);
        } catch (error) {
            console.error('Remove email error:', error);
            alert('❌ Ошибка удаления: ' + error.message);
        }
    }
};

// Функция для быстрых действий
window.toggleQuickAction = function(action) {
    const buttons = document.querySelectorAll('.quick-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    let activityType = 'all';
    switch (action) {
        case 'calls':
            activityType = '2';
            break;
        case 'comments':
            activityType = '6';
            break;
        case 'tasks':
            activityType = '4';
            break;
        case 'meetings':
            activityType = '1';
            break;
    }

    document.getElementById('activityTypeSelect').value = activityType;
    applyFilters();
};

// Функция детализации
window.showUserDetails = function(userId) {
    const userStats = currentUserStats[userId];
    if (!userStats) return;

    const panel = document.getElementById('detailsPanel');
    if (!panel) return;

    panel.innerHTML = `<h3>Детализация активностей: ${userStats.user_name}</h3>`;

    if (!userStats.activities || userStats.activities.length === 0) {
        panel.innerHTML += '<p>Нет данных об активностях</p>';
        panel.classList.add('active');
        return;
    }

    // Группируем активности по дням
    const activitiesByDay = {};
    userStats.activities.forEach(activity => {
        const date = new Date(activity.CREATED).toLocaleDateString('ru-RU');
        if (!activitiesByDay[date]) {
            activitiesByDay[date] = [];
        }
        activitiesByDay[date].push(activity);
    });

    // Сортируем дни по убыванию
    const sortedDays = Object.keys(activitiesByDay).sort((a, b) =>
        new Date(b.split('.').reverse().join('-')) - new Date(a.split('.').reverse().join('-'))
    );

    sortedDays.forEach(date => {
        const dayGroup = document.createElement('div');
        dayGroup.className = 'day-group';

        let dayHTML = `<div class="day-header">📅 ${date}</div>`;

        // Сортируем активности по времени
        activitiesByDay[date].sort((a, b) => new Date(a.CREATED) - new Date(b.CREATED));

        activitiesByDay[date].forEach(activity => {
            const time = new Date(activity.CREATED).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const activityType = ACTIVITY_TYPES[activity.TYPE_ID] || { name: 'Другое', class: '' };
            const description = activity.DESCRIPTION ?
                activity.DESCRIPTION.replace(/\n/g, '<br>').substring(0, 150) +
                (activity.DESCRIPTION.length > 150 ? '...' : '') :
                'Нет описания';

            dayHTML += `
                <div class="activity-item">
                    <span class="activity-time">${time}</span>
                    <span class="activity-type ${activityType.class}">${activityType.name}</span>
                    <span>${description}</span>
                </div>
            `;
        });

        dayGroup.innerHTML = dayHTML;
        panel.appendChild(dayGroup);
    });

    panel.classList.add('active');
};