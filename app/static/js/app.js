// ДЕБАГ-ХУК ДЛЯ ОТСЛЕЖИВАНИЯ ИСЧЕЗНОВЕНИЯ ЭЛЕМЕНТОВ
const debugElements = ['employeesSelect', 'activityTypeSelect', 'startDate', 'endDate'];

// Мониторим изменения DOM
const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
        if (mutation.type === 'childList') {
            debugElements.forEach(id => {
                const element = document.getElementById(id);
                if (!element) {
                    console.error(`🚨🚨🚨 ELEMENT ${id} WAS REMOVED FROM DOM!`, {
                        mutation: mutation,
                        stack: new Error().stack
                    });
                }
            });
        }
    });
});

// Начинаем наблюдение
observer.observe(document.body, {
    childList: true,
    subtree: true
});

console.log('🔍 DOM Observer started');

// app.js - УЛЬТРА-ЗАЩИЩЕННАЯ ВЕРСИЯ
const ACTIVITY_TYPES = {
    "1": { name: "Встреча", class: "badge-meeting" },
    "2": { name: "Звонок", class: "badge-call" },
    "4": { name: "Задача", class: "badge-task" },
    "6": { name: "Комментарий", class: "badge-comment" }
};

let allUsers = [];
let currentUserStats = {};
let currentUser = null;

// СУПЕР-БЕЗОПАСНАЯ ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ ЭЛЕМЕНТОВ
function getElementSafely(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.error(`🚨 CRITICAL: Element ${id} is NULL`);
        throw new Error(`Element ${id} not found in DOM`);
    }
    return element;
}

function getElementValueSafely(id, defaultValue = '') {
    try {
        const element = getElementSafely(id);
        return element.value || defaultValue;
    } catch (error) {
        console.error(`🚨 Failed to get value from ${id}:`, error);
        return defaultValue;
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 DOM loaded, starting ULTRA-SAFE initialization...');
    initializeApp();
});

async function initializeApp() {
    try {
        console.log('🔧 Step 1: Basic setup');
        initializeEventListeners();

        console.log('🔧 Step 2: Setting dates');
        await setDefaultDatesWithRetry();

        console.log('🔧 Step 3: Authentication');
        await initAuth();

        console.log('🔧 Step 4: Dashboard');
        await initializeDashboard();

        console.log('✅ App fully initialized');

    } catch (error) {
        console.error('❌ App initialization failed:', error);
        showError('resultsBody', `Ошибка инициализации: ${error.message}`);
    }
}

function initializeEventListeners() {
    console.log('🔧 Setting up event listeners...');

    // Простые слушатели - не критично если не сработают
    try {
        const closeBtn = document.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', hideAuthModal);
        }

        const modal = document.getElementById('authModal');
        if (modal) {
            window.addEventListener('click', function (event) {
                if (event.target === modal) {
                    hideAuthModal();
                }
            });
        }
    } catch (error) {
        console.warn('⚠️ Event listeners setup warning:', error);
    }
}

async function setDefaultDatesWithRetry(maxAttempts = 15) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
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
        } catch (error) {
            console.warn(`⚠️ Date setting attempt ${attempt} failed:`, error);
        }

        console.log(`⏳ Waiting for date elements... attempt ${attempt}/${maxAttempts}`);
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.warn('⚠️ Could not set default dates, continuing anyway...');
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
        try {
            const authButton = document.getElementById('authButton');
            if (authButton) {
                authButton.textContent = `👤 ${currentUser.full_name} (Выйти)`;
                authButton.onclick = logout;
            }
        } catch (error) {
            console.warn('⚠️ Could not update auth button:', error);
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

        if (!BitrixAPI.authToken || !currentUser) {
            // Инициализируем графики только если не авторизованы
            ActivityCharts.initCharts();
        }

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
        showError('resultsBody', `Ошибка инициализации: ${error.message}`);
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
    try {
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
    } catch (error) {
        console.error('❌ Error showing login prompt:', error);
    }
}

// ОСНОВНЫЕ ФУНКЦИИ ДАННЫХ
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

// ПЕРЕПИСАННАЯ applyFilters С МАКСИМАЛЬНОЙ ЗАЩИТОЙ

async function applyFilters() {
    try {
        console.log('🔄 applyFilters called...');

        if (!BitrixAPI.authToken || !currentUser) {
            showLoginPrompt();
            return;

        }

        showLoading('resultsBody', 'Загрузка данных...');

        // 🔴 ИСПРАВЛЕНИЕ: ОБЪЯВЛЯЕМ ПЕРЕМЕННЫЕ
        const employeesSelect = document.getElementById('employeesSelect');
        const activityTypeSelect = document.getElementById('activityTypeSelect');
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');


        console.log('🔍 Element status in applyFilters:', {
            employeesSelect: !!employeesSelect,
            activityTypeSelect: !!activityTypeSelect,
            startDateInput: !!startDateInput,
            endDateInput: !!endDateInput
        });

        // Проверяем что все элементы существуют
        if (!employeesSelect || !activityTypeSelect || !startDateInput || !endDateInput) {
            throw new Error('Form elements not found');
        }

        // Получаем значения фильтров
        const employeeFilter = employeesSelect.value;
        const activityTypeFilter = activityTypeSelect.value;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

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
        const statsData = await BitrixAPI.getDetailedStats(filters);

        console.log('🔍 Raw stats data:', statsData);
        console.log('🔍 Activities by user:', statsData.user_stats.map(u => ({
            user: u.user_name,
            total: u.total,
            calls: u.calls,
            comments: u.comments
        })));

        if (statsData) {
            displayUserStats(statsData);
        }

    } catch (error) {
        console.error('Error applying filters:', error);
        showError('resultsBody', `Ошибка: ${error.message}`);
    }

}

// Функция для повторной попытки
window.retryApplyFilters = function () {
    console.log('🔄 Retrying applyFilters...');
    applyFilters();
};

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

console.log('🔄 ULTRA-SAFE app.js loaded successfully');

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
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');

        if (!startDateInput || !endDateInput) {
            throw new Error('Date elements not found');
        }

        // 🔴 ИСПРАВЛЕНИЕ: используем BitrixAPI для запроса
        const response = await BitrixAPI.makeRequest(`/api/user-activities/${userId}?${new URLSearchParams({
            start_date: startDateInput.value,
            end_date: endDateInput.value
        })}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

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