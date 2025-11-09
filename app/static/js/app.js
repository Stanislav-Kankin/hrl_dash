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
                const today = new Date();
                const dayOfWeek = today.getDay(); // 0 = воскресенье, 1 = понедельник, ..., 6 = суббота
                // Считаем понедельник текущей недели
                const monday = new Date(today);
                // В JavaScript: воскресенье = 0 → понедельник = 1, ..., суббота = 6
                // Нам нужно: если сегодня воскресенье (0), то вычесть 6 дней → пн = today - 6
                // Если понедельник (1) → вычесть 0
                // Формула: вычесть (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
                const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                monday.setDate(today.getDate() - daysToSubtract);

                // Формат: YYYY-MM-DD
                const format = d => d.toISOString().split('T')[0];

                startDateEl.value = format(monday);
                endDateEl.value = format(today);

                console.log('✅ Default dates set to current week:', {
                    start: startDateEl.value,
                    end: endDateEl.value
                });
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
        if (data.users && data.users.length > 0) {
            allUsers = data.users;
        } else {
            // РЕЗЕРВ: жёстко заданные пользователи на случай, если API не ответил
            console.warn('⚠️ Users list empty, using fallback presales list');
            allUsers = [
                { ID: '8860', NAME: 'Безина', LAST_NAME: 'Ольга', WORK_POSITION: 'Пресейл' },
                { ID: '8988', NAME: 'Фатюхина', LAST_NAME: 'Полина', WORK_POSITION: 'Пресейл' },
                { ID: '17087', NAME: 'Агапова', LAST_NAME: 'Анастасия', WORK_POSITION: 'Пресейл' },
                { ID: '17919', NAME: 'Некрасова', LAST_NAME: 'Елена', WORK_POSITION: 'Пресейл' },
                { ID: '17395', NAME: 'Вахрушева', LAST_NAME: 'Наталия', WORK_POSITION: 'Пресейл' },
                { ID: '18065', NAME: 'Прокофьева', LAST_NAME: 'Дарья', WORK_POSITION: 'Пресейл' }
            ];
        }
        updateUserSelect();
    } catch (error) {
        console.error('Ошибка загрузки сотрудников:', error);
        // Даже при ошибке — показываем fallback
        allUsers = [
            { ID: '8860', NAME: 'Безина', LAST_NAME: 'Ольга' },
            { ID: '8988', NAME: 'Фатюхина', LAST_NAME: 'Полина' },
            { ID: '17087', NAME: 'Агапова', LAST_NAME: 'Анастасия' },
            { ID: '17919', NAME: 'Некрасова', LAST_NAME: 'Елена' },
            { ID: '17395', NAME: 'Вахрушева', LAST_NAME: 'Наталия' },
            { ID: '18065', NAME: 'Прокофьева', LAST_NAME: 'Дарья' }
        ];
        updateUserSelect();
        showError('resultsBody', `Ошибка загрузки сотрудников: ${error.message}`);
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

        if (!employeesSelect || !activityTypeSelect || !startDateInput || !endDateInput) {
            throw new Error('Form elements not found');
        }

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

        console.log('🔍 Sending filters:', filters);

        const statsData = await BitrixAPI.getDetailedStats(filters);
        console.log('🔍 Raw stats data:', statsData);

        if (statsData && statsData.success) {
            displayUserStats(statsData);
        } else {
            showError('resultsBody', statsData?.error || 'Неизвестная ошибка сервера');
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

    // Сортируем по общему количеству активностей (по убыванию)
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
        // Исправлено: переставлены столбцы в соответствии с таблицей
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

    // === ОБНОВЛЕНИЕ ГРАФИКОВ ===
    if (statsData.statistics) {
        ActivityCharts.updateAllCharts(statsData.statistics);
    } else {
        console.warn('⚠️ No statistics in response — graphs will not update');
    }

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

    // Показываем панель и ставим загрузку
    panel.classList.add('active');
    panel.innerHTML = `
        <div class="details-header">
            <h3>📋 Детализация активностей: <span id="detailUserName"></span></h3>
            <button onclick="closeDetailsPanel()">✕ Закрыть</button>
        </div>
        <div class="details-content">
            <div class="loading">Загрузка деталей...</div>
        </div>
    `;
    document.getElementById('detailUserName').textContent = userStats.user_name;

    // Закрытие по Esc
    const closeOnEsc = (e) => {
        if (e.key === 'Escape') closeDetailsPanel();
    };
    document.addEventListener('keydown', closeOnEsc);
    panel._escHandler = closeOnEsc;

    try {
        const startDate = getElementValueSafely('startDate');
        const endDate = getElementValueSafely('endDate');

        const response = await BitrixAPI.makeRequest(
            `/api/user-activities/${encodeURIComponent(userId)}?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`
        );

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Неизвестная ошибка API');
        }

        const activities = data.activities || [];
        const activitiesByDay = {};

        if (activities.length > 0) {
            activities.forEach(activity => {
                try {
                    const activityDate = new Date(activity.CREATED.replace('Z', '+00:00'));
                    const dateKey = activityDate.toISOString().split('T')[0];
                    if (!activitiesByDay[dateKey]) {
                        activitiesByDay[dateKey] = [];
                    }
                    // ОБРАБАТЫВАЕМ ОПИСАНИЕ: УДАЛЯЕМ ТЕГИ И ЗАМЕНЯЕМ <br> НА \n
                    let description = activity.DESCRIPTION || activity.SUBJECT || 'Без описания';
                    // Заменяем <br> и <br/> на перенос строки
                    description = description.replace(/<br\s*\/?>/gi, '\n');
                    // Удаляем все остальные теги
                    description = description.replace(/<[^>]*>/g, '');
                    // Убираем лишние пробелы и переносы
                    description = description.trim().replace(/\s+/g, ' ');

                    activitiesByDay[dateKey].push({
                        time: activityDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                        type: ACTIVITY_TYPES[activity.TYPE_ID]?.name || 'Другое',
                        type_class: ACTIVITY_TYPES[activity.TYPE_ID]?.class || 'badge-task',
                        description: description
                    });
                } catch (e) {
                    console.error('Error processing activity:', activity, e);
                }
            });
        }

        const sortedDays = Object.keys(activitiesByDay).sort().reverse();
        let contentHtml = '';

        if (sortedDays.length === 0) {
            contentHtml = '<div class="loading">Нет активностей за выбранный период</div>';
        } else {
            contentHtml = `
                <div style="margin-bottom: 15px; padding: 12px; background: #e7f3ff; border-radius: 6px; font-size: 0.95em;">
                    <strong>Всего активностей:</strong> ${data.activities_count} |
                    <strong>Отображено:</strong> ${data.activities_returned}
                </div>
            `;

            sortedDays.forEach(day => {
                const acts = activitiesByDay[day];
                const date = new Date(day);
                const dayName = date.toLocaleDateString('ru-RU', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                contentHtml += `
                    <div class="day-group">
                        <div class="day-header">📅 ${dayName} (${acts.length})</div>
                `;

                acts.forEach(act => {
                    // Экранируем описание (на случай, если там есть & < >)
                    const safeDesc = escapeHtml(act.description);
                    contentHtml += `
                        <div class="activity-item">
                            <div class="activity-line">
                                <span class="activity-time">${act.time}</span>
                                <span class="activity-type ${act.type_class}">${act.type}</span>
                            </div>
                            <div class="activity-description">${safeDesc}</div>
                        </div>
                    `;
                });

                contentHtml += `</div>`;
            });
        }

        const contentDiv = panel.querySelector('.details-content');
        if (contentDiv) {
            contentDiv.innerHTML = contentHtml;
        }

    } catch (error) {
        console.error('❌ Error in showUserDetails:', error);
        const contentDiv = panel.querySelector('.details-content');
        if (contentDiv) {
            contentDiv.innerHTML = `<div class="error">Ошибка загрузки: ${escapeHtml(error.message)}</div>`;
        }
    }
};

// Вспомогательная функция закрытия
window.closeDetailsPanel = function () {
    const panel = document.getElementById('detailsPanel');
    if (panel) {
        panel.classList.remove('active');
        // Удаляем обработчик Esc
        if (panel._escHandler) {
            document.removeEventListener('keydown', panel._escHandler);
            panel._escHandler = null;
        }
    }
};

// Вспомогательная функция закрытия
window.closeDetailsPanel = function () {
    const panel = document.getElementById('detailsPanel');
    if (panel) {
        panel.classList.remove('active');
        // Удаляем обработчик Esc
        if (panel._escHandler) {
            document.removeEventListener('keydown', panel._escHandler);
            panel._escHandler = null;
        }
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

// Обновляем графики, если есть статистика
if (statsData.statistics) {
    ActivityCharts.updateAllCharts(statsData.statistics);
} else {
    console.warn('⚠️ No statistics in response — cannot update charts');
}