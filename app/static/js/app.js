// app.js - ПОЛНОСТЬЮ ПЕРЕРАБОТАННАЯ ВЕРСИЯ
const ACTIVITY_TYPES = {
    "1": { name: "Встреча", class: "badge-meeting" },
    "2": { name: "Звонок", class: "badge-call" },
    "4": { name: "Задача", class: "badge-task" },
    "6": { name: "Комментарий", class: "badge-comment" }
};

let allUsers = [];
let currentUserStats = {};
let currentUser = null;
let isInitialized = false;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 DOM loaded, starting initialization...');
    initializeApp();
});

async function initializeApp() {
    try {
        // Шаг 1: Инициализация базовых слушателей
        initializeEventListeners();

        // Шаг 2: Настройка дат по умолчанию
        await setDefaultDatesWithRetry();

        // Шаг 3: Проверка авторизации
        await initAuth();

        // Шаг 4: Основная инициализация дашборда
        await initializeDashboard();

        isInitialized = true;
        console.log('✅ App fully initialized');

    } catch (error) {
        console.error('❌ App initialization failed:', error);
        showError('resultsBody', `Ошибка инициализации: ${error.message}`);
    }
}

function initializeEventListeners() {
    console.log('🔧 Setting up event listeners...');

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

async function setDefaultDatesWithRetry(maxAttempts = 10) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const startDateEl = document.getElementById('startDate');
        const endDateEl = document.getElementById('endDate');

        if (startDateEl && endDateEl) {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
            const endDate = new Date();

            startDateEl.value = startDate.toISOString().split('T')[0];
            endDateEl.value = endDate.toISOString().split('T')[0];
            console.log('✅ Default dates set');
            return;
        }

        console.log(`⏳ Waiting for date elements... attempt ${attempt}/${maxAttempts}`);
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    throw new Error('Failed to set default dates: date elements not found');
}

async function initAuth() {
    const token = BitrixAPI.authToken;
    console.log('🔐 Auth init, token exists:', !!token);

    if (!token) {
        showAuthModal();
        return false;
    }

    return await checkAuthStatus();
}

async function checkAuthStatus() {
    try {
        console.log('🔐 Checking authentication...');
        const userData = await BitrixAPI.getCurrentUser();
        currentUser = userData;
        console.log('✅ User authenticated:', currentUser.email);

        // Обновляем кнопку авторизации
        const authButton = document.getElementById('authButton');
        if (authButton) {
            authButton.textContent = `👤 ${currentUser.full_name} (Выйти)`;
            authButton.onclick = logout;
        }

        return true;
    } catch (error) {
        console.error('🔐 Auth check failed:', error);
        BitrixAPI.clearAuthToken();
        showAuthModal();
        return false;
    }
}

async function initializeDashboard() {
    try {
        console.log('📊 Initializing dashboard...');

        // Ждем загрузки всех необходимых элементов
        await waitForCriticalElements();

        // Инициализируем графики
        ActivityCharts.initCharts();

        // Загружаем список пользователей
        await loadUsersList();

        // Если пользователь авторизован - загружаем данные
        if (BitrixAPI.authToken && currentUser) {
            await applyFilters();
        } else {
            showLoginPrompt();
        }

    } catch (error) {
        console.error('❌ Dashboard initialization error:', error);
        throw error;
    }
}

async function waitForCriticalElements() {
    const criticalElements = ['employeesSelect', 'activityTypeSelect', 'startDate', 'endDate', 'resultsBody'];
    const startTime = Date.now();
    const maxWaitTime = 10000; // 10 секунд максимум

    while (Date.now() - startTime < maxWaitTime) {
        const allLoaded = criticalElements.every(id => {
            const element = document.getElementById(id);
            return element !== null;
        });

        if (allLoaded) {
            console.log('✅ All critical elements loaded');
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Critical elements not loaded after ${maxWaitTime}ms`);
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

// ОСНОВНЫЕ ФУНКЦИИ ДАННЫХ
async function loadUsersList() {
    try {
        showLoading('resultsBody', 'Загрузка списка сотрудников...');
        const data = await BitrixAPI.getUsersList();

        if (data && data.users) {
            allUsers = data.users;
            updateUserSelect();
            console.log(`✅ Loaded ${allUsers.length} users`);
        } else {
            console.warn('⚠️ No users data received');
            allUsers = [];
        }
    } catch (error) {
        console.error('❌ Error loading users list:', error);
        showError('resultsBody', `Ошибка загрузки сотрудников: ${error.message}`);
    }
}

async function applyFilters() {
    try {
        console.log('🔄 Applying filters...');

        if (!BitrixAPI.authToken || !currentUser) {
            showLoginPrompt();
            return;
        }

        showLoading('resultsBody', 'Загрузка данных...');

        // БЕЗОПАСНОЕ ПОЛУЧЕНИЕ ЭЛЕМЕНТОВ С ПРОВЕРКОЙ
        const getElement = (id) => {
            const element = document.getElementById(id);
            if (!element) {
                throw new Error(`Element ${id} not found`);
            }
            return element;
        };

        const getElementValue = (id) => {
            const element = getElement(id);
            return element.value;
        };

        // Получаем значения фильтров
        const employeeFilter = getElementValue('employeesSelect');
        const activityTypeFilter = getElementValue('activityTypeSelect');
        const startDate = getElementValue('startDate');
        const endDate = getElementValue('endDate');

        // Валидация дат
        if (!startDate || !endDate) {
            alert('❌ Пожалуйста, выберите диапазон дат');
            return;
        }

        // Подготавливаем фильтры для API
        const filters = {
            user_ids: employeeFilter === 'all' ? [] : [employeeFilter],
            activity_type: activityTypeFilter === 'all' ? null : activityTypeFilter,
            start_date: startDate,
            end_date: endDate
        };

        console.log('🔍 Sending filters:', filters);

        // Загружаем данные
        const statsData = await BitrixAPI.getDetailedStats(filters);

        if (statsData) {
            displayUserStats(statsData);
        } else {
            throw new Error('No data received from server');
        }

    } catch (error) {
        console.error('❌ Error applying filters:', error);

        if (error.message.includes('not found')) {
            // Если элементы DOM не найдены, переинициализируем
            console.log('🔄 DOM elements missing, reinitializing...');
            setTimeout(initializeDashboard, 1000);
        } else {
            showError('resultsBody', `Ошибка: ${error.message}`);
        }
    }
}

function displayUserStats(statsData) {
    console.log('📊 Displaying user stats:', statsData);

    if (!statsData || !statsData.user_stats) {
        showError('resultsBody', 'Нет данных для отображения');
        return;
    }

    // Показываем секции
    const summaryCards = document.querySelector('.summary-cards');
    const chartsSection = document.querySelector('.charts-section');
    if (summaryCards) summaryCards.style.display = 'grid';
    if (chartsSection) chartsSection.style.display = 'block';

    // Сортируем пользователей по активности
    const sortedUserStats = [...statsData.user_stats].sort((a, b) => (b.total || 0) - (a.total || 0));
    const tbody = document.getElementById('resultsBody');

    if (sortedUserStats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Нет данных за выбранный период</td></tr>';
        return;
    }

    // Очищаем и заполняем таблицу
    tbody.innerHTML = '';
    currentUserStats = {};

    sortedUserStats.forEach(user => {
        currentUserStats[user.user_id] = user;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="employee-name">${escapeHtml(user.user_name)}</td>
            <td>${user.days_count || 0}</td>
            <td><span class="activity-badge badge-call">${user.calls || 0}</span></td>
            <td><span class="activity-badge badge-comment">${user.comments || 0}</span></td>
            <td><span class="activity-badge badge-task">${user.tasks || 0}</span></td>
            <td><span class="activity-badge badge-meeting">${user.meetings || 0}</span></td>
            <td><strong>${user.total || 0}</strong></td>
            <td>${user.last_activity_date || 'Нет данных'}</td>
            <td>
                <button class="quick-btn" onclick="showUserDetails('${user.user_id}')">
                    Детали
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Обновляем графики если есть статистика
    if (statsData.statistics) {
        ActivityCharts.updateAllCharts(statsData.statistics);
    }

    console.log(`✅ Displayed ${sortedUserStats.length} users`);
}

function updateUserSelect() {
    const select = document.getElementById('employeesSelect');
    if (!select) {
        console.error('❌ employeesSelect not found');
        return;
    }

    // Сохраняем текущее выбранное значение
    const currentValue = select.value;

    // Очищаем и заполняем select
    select.innerHTML = '<option value="all">Все сотрудники</option>';

    allUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.ID;
        option.textContent = `${user.NAME} ${user.LAST_NAME}${user.WORK_POSITION ? ` (${user.WORK_POSITION})` : ''}`;
        select.appendChild(option);
    });

    // Восстанавливаем выбранное значение если возможно
    if (currentValue && allUsers.some(user => user.ID === currentValue)) {
        select.value = currentValue;
    }

    console.log(`✅ Updated user select with ${allUsers.length} options`);
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
        element.innerHTML = `
            <tr>
                <td colspan="8" style="color: red; text-align: center; padding: 20px;">
                    <strong>Ошибка:</strong> ${escapeHtml(message)}
                    <br><br>
                    <button class="quick-btn" onclick="location.reload()">
                        Обновить страницу
                    </button>
                </td>
            </tr>
        `;
    }
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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
            await initializeDashboard(); // Переинициализируем дашборд после входа
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
        authButton.textContent = '🔐 Войти в дашборд';
        authButton.onclick = showAuthModal;
    }

    showLoginPrompt();
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

        // Группируем активности по дням
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

        // Сортируем дни по убыванию
        const sortedDays = Object.keys(activitiesByDay).sort().reverse();

        let html = `
            <div class="details-header">
                <h3>📋 Детализация активностей: ${escapeHtml(userStats.user_name)}</h3>
                <button class="quick-btn" onclick="document.getElementById('detailsPanel').classList.remove('active')">
                    ✕ Закрыть
                </button>
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
                            <span class="activity-description">${escapeHtml(activity.description)}</span>
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

// ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ HTML
window.applyFilters = applyFilters;
window.login = login;
window.register = register;
window.showLogin = showLogin;
window.showRegister = showRegister;
window.logout = logout;
window.showAuthModal = showAuthModal;

// УТИЛИТЫ
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
            await applyFilters(); // Перезагружаем данные
        }
    } catch (error) {
        console.error('Cache clear error:', error);
        alert('❌ Ошибка: ' + error.message);
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
        alert('Ошибка отладки: ' + error.message);
    }
};

// Остальные функции (findUsers, showAdminPanel, addAllowedEmail) остаются без изменений
// ... [остальной код функций остается таким же] ...

console.log('🔄 app.js loaded successfully');

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