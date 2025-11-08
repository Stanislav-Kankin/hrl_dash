// app.js - ЧИСТАЯ ВЕРСИЯ БЕЗ ДУБЛИРОВАНИЯ
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
document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 DOM loaded, initializing...');
    initializeEventListeners();
    initAuth();
    initializeDashboard();
});

function initializeEventListeners() {
    console.log('🔧 Initializing event listeners...');

    // Устанавливаем даты по умолчанию
    setTimeout(setDefaultDates, 100);

    const modal = document.getElementById('authModal');
    const closeBtn = document.querySelector('.close');

    if (closeBtn) {
        closeBtn.addEventListener('click', hideAuthModal);
    }

    window.addEventListener('click', function (event) {
        if (event.target === modal) {
            hideAuthModal();
        }
    });
}

function setDefaultDates() {
    const startDateEl = document.getElementById('startDate');
    const endDateEl = document.getElementById('endDate');

    if (!startDateEl || !endDateEl) {
        console.log('❌ Date elements still not found, retrying...');
        setTimeout(setDefaultDates, 200);
        return;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();

    startDateEl.value = startDate.toISOString().split('T')[0];
    endDateEl.value = endDate.toISOString().split('T')[0];
    console.log('✅ Default dates set');
}

function initAuth() {
    const token = BitrixAPI.authToken;
    console.log('🔐 Auth init, token exists:', !!token);

    if (!token) {
        showAuthModal();
    } else {
        checkAuthStatus();
    }
}

async function checkAuthStatus() {
    try {
        const userData = await BitrixAPI.getCurrentUser();
        currentUser = userData;
        console.log('✅ User authenticated:', currentUser.email);

        const authButton = document.getElementById('authButton');
        if (authButton) {
            authButton.textContent = `👤 ${currentUser.full_name} (Выйти)`;
            authButton.onclick = logout;
        }
    } catch (error) {
        console.error('🔐 Auth check failed:', error);
        BitrixAPI.clearAuthToken();
    }
}

async function initializeDashboard() {
    try {
        console.log('📊 Initializing dashboard...');

        // Ждем пока все элементы загрузятся с таймаутом
        await waitForElementsWithTimeout(5000); // 5 секунд максимум

        ActivityCharts.initCharts();
        await loadUsersList();

        if (!BitrixAPI.authToken) {
            showLoginPrompt();
            return;
        }

        await applyFilters();

    } catch (error) {
        console.error('❌ Dashboard init error:', error);
        showError('resultsBody', `Ошибка инициализации: ${error.message}`);
    }
}

async function waitForElementsWithTimeout(maxWaitTime = 5000) {
    const requiredElements = ['employeesSelect', 'activityTypeSelect', 'startDate', 'endDate'];
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
        const allLoaded = requiredElements.every(id => document.getElementById(id) !== null);

        if (allLoaded) {
            console.log('✅ All elements loaded successfully');
            return;
        }

        console.log(`⏳ Waiting for elements... ${Date.now() - startTime}ms`);
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    throw new Error(`Failed to load required elements after ${maxWaitTime}ms`);
}

// Ждем загрузки элементов
async function waitForElements() {
    const requiredElements = ['employeesSelect', 'activityTypeSelect', 'startDate', 'endDate'];

    for (let attempt = 1; attempt <= 10; attempt++) {
        const allLoaded = requiredElements.every(id => document.getElementById(id) !== null);

        if (allLoaded) {
            console.log('✅ All elements loaded successfully');
            return;
        }

        console.log(`⏳ Waiting for elements... attempt ${attempt}/10`);
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    throw new Error('Failed to load required elements after 10 attempts');
}

function showLoginPrompt() {
    const tbody = document.getElementById('resultsBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #666;">
                    <h3>🔐 Требуется авторизация</h3>
                    <p>Для просмотра данных необходимо войти в систему</p>
                    <button class="apply-btn" onclick="showAuthModal()" style="margin-top: 15px;">
                        Войти в систему
                    </button>
                </td>
            </tr>
        `;
    }
}

// ОСНОВНЫЕ ФУНКЦИИ
async function loadUsersList() {
    try {
        showLoading('resultsBody', 'Загрузка сотрудников...');
        const data = await BitrixAPI.getUsersList();

        if (data.users) {
            allUsers = data.users;
            updateUserSelect();
        }
    } catch (error) {
        console.error('Ошибка загрузки сотрудников:', error);
        showError('resultsBody', `Ошибка: ${error.message}`);
    }
}

async function applyFilters() {
    try {
        if (!BitrixAPI.authToken) {
            showLoginPrompt();
            return;
        }

        showLoading('resultsBody', 'Загрузка данных...');

        // ПРОСТАЯ ПРОВЕРКА БЕЗ ЗАЩИТЫ
        const employeesSelect = document.getElementById('employeesSelect');
        const activityTypeSelect = document.getElementById('activityTypeSelect');
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');

        const employeeFilter = employeesSelect.value;
        const activityTypeFilter = activityTypeSelect.value;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (!startDate || !endDate) {
            alert('❌ Пожалуйста, выберите диапазон дат');
            return;
        }

        const filters = {
            user_ids: employeeFilter === 'all' ? [] : [employeeFilter],
            activity_type: activityTypeFilter === 'all' ? null : activityTypeFilter,
            start_date: startDate,
            end_date: endDate
        };

        console.log('🔍 Applying filters:', filters);
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
    console.log('📊 Displaying user stats:', statsData);

    if (!statsData || !statsData.user_stats) {
        showError('resultsBody', 'Нет данных для отображения');
        return;
    }

    const summaryCards = document.querySelector('.summary-cards');
    const chartsSection = document.querySelector('.charts-section');

    if (summaryCards) summaryCards.style.display = 'grid';
    if (chartsSection) chartsSection.style.display = 'block';

    const sortedUserStats = [...statsData.user_stats].sort((a, b) => (b.total || 0) - (a.total || 0));
    const tbody = document.getElementById('resultsBody');

    if (sortedUserStats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Нет данных за выбранный период</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    currentUserStats = {};

    sortedUserStats.forEach(user => {
        currentUserStats[user.user_id] = user;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="employee-name">${user.user_name}</td>
            <td>${user.days_count || 0}</td>
            <td><span class="activity-badge badge-call">${user.calls || 0}</span></td>
            <td><span class="activity-badge badge-comment">${user.comments || 0}</span></td>
            <td><span class="activity-badge badge-task">${user.tasks || 0}</span></td>
            <td><span class="activity-badge badge-meeting">${user.meetings || 0}</span></td>
            <td><strong>${user.total || 0}</strong></td>
            <td>${user.last_activity_date || 'Нет данных'}</td>
            <td><button class="quick-btn" onclick="showUserDetails('${user.user_id}')">Детали</button></td>
        `;
        tbody.appendChild(row);
    });

    console.log('✅ User stats displayed successfully');
}

function updateUserSelect() {
    const select = document.getElementById('employeesSelect');
    if (!select) {
        console.error('❌ employeesSelect not found in updateUserSelect');
        return;
    }

    select.innerHTML = '<option value="all">Все сотрудники</option>';
    allUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.ID;
        option.textContent = `${user.NAME} ${user.LAST_NAME}${user.WORK_POSITION ? ` (${user.WORK_POSITION})` : ''}`;
        select.appendChild(option);
    });
}

// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
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

// ФУНКЦИИ АУТЕНТИФИКАЦИИ
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
        const data = await BitrixAPI.login(email, password);
        if (data.access_token) {
            BitrixAPI.setAuthToken(data.access_token);
            hideAuthModal();
            await checkAuthStatus();
        }
    } catch (error) {
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
        const data = await BitrixAPI.register(email, password, full_name);
        if (data.email) {
            alert('✅ Регистрация успешна! Теперь войдите в систему.');
            showLogin();
        }
    } catch (error) {
        alert('❌ Ошибка регистрации: ' + error.message);
    }
    return false;
}

function logout() {
    BitrixAPI.clearAuthToken();
    currentUser = null;
    const authButton = document.getElementById('authButton');
    if (authButton) {
        authButton.textContent = '🔐 Вход для админа';
        authButton.onclick = showAuthModal;
    }
    alert('✅ Вы вышли из системы');
}

// ФУНКЦИЯ ДЕТАЛИЗАЦИИ
window.showUserDetails = async function (userId) {
    console.log('🔍 Showing details for user:', userId);

    const userStats = currentUserStats[userId];
    if (!userStats) {
        alert('❌ Данные пользователя не найдены');
        return;
    }

    const panel = document.getElementById('detailsPanel');
    if (!panel) {
        console.error('❌ Details panel not found');
        return;
    }

    panel.innerHTML = '<div class="loading">Загрузка деталей...</div>';
    panel.classList.add('active');

    try {
        const response = await fetch(`/api/user-activities/${userId}?${new URLSearchParams({
            start_date: document.getElementById('startDate').value,
            end_date: document.getElementById('endDate').value
        })}`);

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Ошибка загрузки данных');
        }

        const activities = data.activities || [];
        const activitiesByDay = {};

        if (activities && activities.length > 0) {
            activities.forEach(activity => {
                try {
                    const activityDate = new Date(activity.CREATED.replace('Z', '+00:00'));
                    const dateKey = activityDate.toISOString().split('T')[0];

                    if (!activitiesByDay[dateKey]) {
                        activitiesByDay[dateKey] = [];
                    }

                    activitiesByDay[dateKey].push({
                        time: activityDate.toLocaleTimeString('ru-RU'),
                        type: ACTIVITY_TYPES[activity.TYPE_ID]?.name || 'Другое',
                        type_class: ACTIVITY_TYPES[activity.TYPE_ID]?.class || 'badge-task',
                        description: activity.DESCRIPTION || activity.SUBJECT || 'Без описания',
                        type_id: activity.TYPE_ID
                    });
                } catch (e) {
                    console.error('Error processing activity:', activity, e);
                }
            });
        }

        const sortedDays = Object.keys(activitiesByDay).sort().reverse();

        let html = `
            <div class="details-header">
                <h3>📋 Детализация активностей: ${userStats.user_name}</h3>
                <button class="quick-btn" onclick="document.getElementById('detailsPanel').classList.remove('active')">✕ Закрыть</button>
            </div>
            <div class="details-content">
        `;

        if (sortedDays.length === 0) {
            html += `<div class="loading">Нет данных об активностях</div>`;
        } else {
            sortedDays.forEach(day => {
                const activities = activitiesByDay[day];
                const date = new Date(day);
                const dayName = date.toLocaleDateString('ru-RU', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                html += `
                    <div class="day-group">
                        <div class="day-header">📅 ${dayName} (${activities.length} активностей)</div>
                `;

                activities.forEach(activity => {
                    html += `
                        <div class="activity-item">
                            <span class="activity-time">${activity.time}</span>
                            <span class="activity-type ${activity.type_class}">${activity.type}</span>
                            <span class="activity-description">${activity.description}</span>
                        </div>
                    `;
                });

                html += `</div>`;
            });
        }

        html += `</div>`;
        panel.innerHTML = html;

        console.log('✅ Details panel updated for user:', userId);

    } catch (error) {
        console.error('❌ Error loading user details:', error);
        panel.innerHTML = `<div class="error">Ошибка загрузки деталей: ${error.message}</div>`;
    }
};

// ГЛОБАЛЬНЫЕ ФУНКЦИИ
window.applyFilters = applyFilters;
window.login = login;
window.register = register;
window.showLogin = showLogin;
window.showRegister = showRegister;
window.logout = logout;
window.showAuthModal = showAuthModal;

window.testConnection = async function () {
    try {
        const data = await BitrixAPI.testConnection();
        alert(data.connected ? '✅ Подключение успешно!' : '❌ Ошибка подключения');
    } catch (error) {
        alert('❌ Ошибка: ' + error.message);
    }
};

window.clearCache = async function () {
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

window.debugUsers = async function () {
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

window.findUsers = async function () {
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

window.showAdminPanel = async function () {
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

window.addAllowedEmail = async function () {
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