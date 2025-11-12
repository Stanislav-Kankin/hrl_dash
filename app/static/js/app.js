// app.js - ОДНА КНОПКА "ЗАГРУЗИТЬ"

const ACTIVITY_TYPES = {
    "1": { name: "Встреча", class: "badge-meeting" },
    "2": { name: "Звонок", class: "badge-call" },
    "4": { name: "Задача", class: "badge-task" },
    "6": { name: "Комментарий", class: "badge-comment" }
};

const DAY_NAMES = {
    'Monday': 'Пн',
    'Tuesday': 'Вт',
    'Wednesday': 'Ср',
    'Thursday': 'Чт',
    'Friday': 'Пт',
    'Saturday': 'Сб',
    'Sunday': 'Вс'
};

let allUsers = [];
let currentUserStats = {};
let currentUser = null;

// ========== УТИЛИТЫ ==========
function getElementValueSafely(id, defaultValue = '') {
    const el = document.getElementById(id);
    return el ? (el.value || defaultValue) : defaultValue;
}

function escapeHtml(unsafe) {
    return typeof unsafe === 'string' ? unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;") : unsafe;
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function showNotification(message, type = 'info') {
    let container = document.getElementById('notifications');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notifications';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
        `;
        document.body.appendChild(container);
    }

    const notification = document.createElement('div');
    notification.style.cssText = `
        background: ${type === 'error' ? '#f56565' : type === 'success' ? '#48bb78' : '#4299e1'};
        color: white;
        padding: 12px 16px;
        margin-bottom: 10px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        animation: slideIn 0.3s ease-out;
    `;

    notification.textContent = message;
    container.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Добавляем стили для уведомлений
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

function showLoading(text = 'Загрузка данных...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    if (overlay && loadingText) {
        loadingText.textContent = text;
        overlay.style.display = 'flex';
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    const headers = {
        'Content-Type': 'application/json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

function getSelectedUsers() {
    const checkboxes = document.querySelectorAll('#employeesCheckboxes input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// ========== ОСНОВНЫЕ ФУНКЦИИ ==========
document.addEventListener('DOMContentLoaded', () => initializeApp());

async function initializeApp() {
    try {
        console.log('🚀 DOM loaded, starting initialization...');
        initializeEventListeners();
        await setDefaultDatesWithRetry();
        await initAuth();
        await initializeDashboard();
    } catch (error) {
        console.error('❌ App init failed:', error);
        showNotification('Ошибка инициализации: ' + error.message, 'error');
    }
}

function initializeEventListeners() {
    const closeBtn = document.querySelector('.close');
    const modal = document.getElementById('authModal');
    if (closeBtn) closeBtn.addEventListener('click', hideAuthModal);
    if (modal) {
        window.addEventListener('click', (e) => {
            if (e.target === modal) hideAuthModal();
        });
    }
}

async function setDefaultDatesWithRetry(maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
        const start = document.getElementById('startDate');
        const end = document.getElementById('endDate');
        if (start && end) {
            const today = new Date();
            const fmt = d => d.toISOString().split('T')[0];
            start.value = fmt(today);
            end.value = fmt(today);
            console.log('✅ Default dates set to today only');
            return;
        }
        await new Promise(r => setTimeout(r, 300));
    }
    console.warn('⚠️ Could not set default dates');
}

async function initAuth() {
    const token = BitrixAPI.authToken;
    if (!token) {
        showAuthModal();
        return false;
    }
    return await checkAuthStatus();
}

async function checkAuthStatus() {
    try {
        currentUser = await BitrixAPI.getCurrentUser();
        const btn = document.getElementById('authButton');
        if (btn) {
            btn.textContent = `👤 ${currentUser.full_name} (Выйти)`;
            btn.onclick = logout;
        }
        return true;
    } catch (e) {
        BitrixAPI.clearAuthToken();
        showAuthModal();
        return false;
    }
}

async function initializeDashboard() {
    try {
        console.log('📊 Initializing dashboard...');
        await waitForCriticalElements();

        ActivityCharts.initCharts();
        await loadUsersList();

        // Инициализируем чекбоксы для вкладки сделок
        renderDealsUserCheckboxes(allUsers);

        if (BitrixAPI.authToken && currentUser) {
            await loadData();
        } else {
            showLoginPrompt();
        }
    } catch (error) {
        console.error('❌ Dashboard initialization error:', error);
        showNotification('Ошибка инициализации: ' + error.message, 'error');
    }
}

async function waitForCriticalElements() {
    const criticalElements = ['employeesCheckboxes', 'activityTypeSelect', 'startDate', 'endDate', 'resultsBody'];
    const startTime = Date.now();
    const maxWaitTime = 10000;

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
    const el = document.getElementById('resultsBody');
    if (el) {
        el.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;padding:40px">
                    🔐 Требуется авторизация<br>
                    <button onclick="showAuthModal()" style="margin-top:15px">Войти в систему</button>
                </td>
            </tr>
        `;
    }
}

// ========== ОСНОВНАЯ ФУНКЦИЯ ЗАГРУЗКИ ==========
async function loadData() {
    showLoading('Загрузка данных...');

    const selectedUsers = getSelectedUsers();
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const activityType = document.getElementById('activityTypeSelect').value;

    if (!startDate || !endDate) {
        alert('Пожалуйста, выберите диапазон дат');
        hideLoading();
        return;
    }

    try {
        // 🔥 РАСЧИТЫВАЕМ ДЛИТЕЛЬНОСТЬ ПЕРИОДА ДЛЯ ТАЙМАУТА
        const start = new Date(startDate);
        const end = new Date(endDate);
        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        // 🔥 АДАПТИВНЫЕ ТАЙМАУТЫ ДЛЯ БОЛЬШИХ ПЕРИОДОВ
        const getTimeout = () => {
            if (daysDiff <= 1) return 30000; // 30 сек для 1 дня
            if (daysDiff <= 7) return 45000; // 45 сек для недели
            if (daysDiff <= 30) return 60000; // 60 сек для месяца
            if (daysDiff <= 90) return 120000; // 2 минуты для квартала
            return 180000; // 3 минуты для больших периодов
        };

        const timeoutMs = getTimeout();
        console.log(`⏰ Period: ${daysDiff} days, timeout: ${timeoutMs}ms`);

        // 🔥 ПРЕДУПРЕЖДЕНИЕ ДЛЯ БОЛЬШИХ ПЕРИОДОВ
        if (daysDiff > 30) {
            if (!confirm(`Вы запрашиваете данные за ${daysDiff} дней. Это может занять несколько минут. Продолжить?`)) {
                hideLoading();
                return;
            }
            showLoading(`Загрузка данных за ${daysDiff} дней... Это может занять несколько минут`);
        }

        let url = `/api/stats/main?start_date=${startDate}&end_date=${endDate}&include_statistics=true`;
        if (selectedUsers.length > 0) {
            url += `&user_ids=${selectedUsers.join(',')}`;
        }
        if (activityType !== 'all') {
            url += `&activity_type=${activityType}`;
        }

        console.log('🚀 Loading data from main endpoint:', url);

        const response = await fetchWithTimeout(url, {
            headers: getAuthHeaders(),
            timeout: timeoutMs
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
            displayResults(data);

            if (data.cache_used) {
                showNotification('✅ Данные загружены из кэша', 'success');
            } else {
                showNotification('📊 Данные загружены из Bitrix', 'info');
            }
        } else {
            throw new Error(data.error || 'Unknown error from server');
        }

    } catch (error) {
        console.error('❌ Error loading data:', error);

        if (error.name === 'TimeoutError') {
            showNotification(`⏰ Превышено время ожидания (${error.message}). Попробуйте меньший период или используйте кэш`, 'error');
        } else if (error.message.includes('504')) {
            showNotification('🌐 Сервер не отвечает (Gateway Timeout). Попробуйте меньший период', 'error');
        } else if (error.message.includes('JSON')) {
            showNotification('📄 Ошибка формата данных от сервера', 'error');
        } else {
            showNotification('❌ Ошибка загрузки: ' + error.message, 'error');
        }

        // Показываем пустую таблицу с ошибкой
        const tbody = document.getElementById('resultsBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:40px;color:#f56565">
                        ❌ Ошибка загрузки данных<br>
                        <small>${error.message}</small><br>
                        <button onclick="loadData()" style="margin-top:15px">🔄 Попробовать снова</button>
                        ${daysDiff > 30 ? '<br><small>Рекомендуется выбрать меньший период</small>' : ''}
                    </td>
                </tr>
            `;
        }
    } finally {
        hideLoading();
    }
}

// 🔧 Функция fetch с таймаутом
function fetchWithTimeout(url, options = {}) {
    const { timeout = 90000000, ...fetchOptions } = options;

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`TimeoutError: Request took longer than ${timeout}ms`));
        }, timeout);

        fetch(url, fetchOptions)
            .then(response => {
                clearTimeout(timer);
                resolve(response);
            })
            .catch(err => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

function displayResults(data) {
    if (!data?.user_stats) {
        showNotification('Нет данных для отображения', 'error');
        return;
    }

    displayUserStats(data);
    updateSummaryCards(data, data.start_date, data.end_date);
}

function displayUserStats(statsData) {
    if (!statsData?.user_stats) {
        showNotification('Нет данных для отображения', 'error');
        return;
    }

    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';
    currentUserStats = {};

    statsData.user_stats.forEach(user => {
        currentUserStats[user.user_id] = user;
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

    if (statsData.statistics) {
        ActivityCharts.updateAllCharts(statsData.statistics);
    }

    console.log('📊 Displaying stats for', statsData.user_stats.length, 'users');
    ActivityCharts.updateComparisonChart(statsData.user_stats);
}

function updateSummaryCards(statsData, startDate, endDate) {
    if (!statsData || !statsData.user_stats) {
        console.error('No data for summary cards');
        return;
    }

    const userStats = statsData.user_stats;
    const totalActivities = statsData.total_activities || 0;

    const activeUsers = userStats.filter(user => user.total > 0).length;
    document.getElementById('activeUsers').textContent = activeUsers;
    document.getElementById('usersMessage').textContent = `Найдено ${userStats.length} сотрудников`;

    document.getElementById('totalActivities').textContent = totalActivities.toLocaleString();

    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    let periodText = '';
    if (daysDiff === 1) {
        periodText = 'за сегодня';
    } else if (daysDiff === 7) {
        periodText = 'за 7 дней';
    } else if (daysDiff === 30) {
        periodText = 'за 30 дней';
    } else {
        periodText = `за ${daysDiff} дней`;
    }
    document.getElementById('periodMessage').textContent = periodText;

    const totalCalls = userStats.reduce((sum, user) => sum + (user.calls || 0), 0);
    document.getElementById('totalCalls').textContent = totalCalls.toLocaleString();

    const totalComments = userStats.reduce((sum, user) => sum + (user.comments || 0), 0);
    document.getElementById('totalComments').textContent = totalComments.toLocaleString();

    const avgPerDay = daysDiff > 0 ? (totalActivities / daysDiff).toFixed(1) : 0;
    document.getElementById('avgPerDay').textContent = avgPerDay;

    let mostActiveDay = '-';
    if (statsData.statistics?.daily_stats?.length > 0) {
        const dailyStats = statsData.statistics.daily_stats;
        const mostActive = dailyStats.reduce((max, day) => day.total > max.total ? day : max, dailyStats[0]);
        mostActiveDay = DAY_NAMES[mostActive.day_of_week] || mostActive.day_of_week;
    }
    document.getElementById('mostActiveDay').textContent = mostActiveDay;

    console.log('📊 Summary cards updated:', {
        activeUsers,
        totalActivities,
        totalCalls,
        totalComments,
        avgPerDay,
        mostActiveDay,
        periodText
    });
}

// ========== РАБОТА С ПОЛЬЗОВАТЕЛЯМИ ==========
async function loadUsersList() {
    try {
        const data = await BitrixAPI.getUsersList();
        if (data.users && data.users.length > 0) {
            allUsers = data.users;
        } else {
            allUsers = getDefaultUsers();
        }
        renderUserCheckboxes();
    } catch (error) {
        console.error('Ошибка загрузки сотрудников:', error);
        allUsers = getDefaultUsers();
        renderUserCheckboxes();
    }
}

function getDefaultUsers() {
    return [
        { ID: '8860', NAME: 'Безина', LAST_NAME: 'Ольга' },
        { ID: '8988', NAME: 'Фатюхина', LAST_NAME: 'Полина' },
        { ID: '17087', NAME: 'Агапова', LAST_NAME: 'Анастасия' },
        { ID: '17919', NAME: 'Некрасова', LAST_NAME: 'Елена' },
        { ID: '17395', NAME: 'Вахрушева', LAST_NAME: 'Наталия' },
        { ID: '18065', NAME: 'Прокофьева', LAST_NAME: 'Дарья' }
    ];
}

function renderUserCheckboxes() {
    const container = document.getElementById('employeesCheckboxes');
    if (!container) return;

    container.innerHTML = '';
    allUsers.forEach(user => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <input type="checkbox" id="user_${user.ID}" value="${user.ID}" class="user-checkbox" checked>
            <label for="user_${user.ID}">${user.NAME} ${user.LAST_NAME}</label>
        `;
        container.appendChild(div);
    });
}

// ========== ДЕТАЛИЗАЦИЯ ПОЛЬЗОВАТЕЛЯ ==========
async function showUserDetails(userId) {
    const userStats = currentUserStats[userId];
    if (!userStats) {
        alert('Данные не найдены');
        return;
    }

    const panel = document.getElementById('detailsPanel');
    if (!panel) return;

    panel.classList.add('active');
    panel.innerHTML = `
        <div class="details-header">
            <h3>📋 Детализация: ${userStats.user_name}</h3>
            <button onclick="closeDetailsPanel()">✕ Закрыть</button>
        </div>
        <div class="details-content"><div class="loading">Загрузка...</div></div>
    `;

    const closeOnEsc = (e) => { if (e.key === 'Escape') closeDetailsPanel(); };
    document.addEventListener('keydown', closeOnEsc);
    panel._escHandler = closeOnEsc;

    try {
        const startDate = getElementValueSafely('startDate');
        const endDate = getElementValueSafely('endDate');
        const response = await BitrixAPI.makeRequest(
            `/api/user-activities/${encodeURIComponent(userId)}?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`
        );
        const data = await response.json();

        if (!data.success) throw new Error(data.error || 'Ошибка API');

        const activities = data.activities || [];
        const activitiesByDay = groupActivitiesByDay(activities);
        const contentHtml = buildActivitiesHtml(activitiesByDay, data);

        const contentDiv = panel.querySelector('.details-content');
        if (contentDiv) contentDiv.innerHTML = contentHtml;
    } catch (error) {
        console.error('❌ Error in details:', error);
        const contentDiv = panel.querySelector('.details-content');
        if (contentDiv) {
            contentDiv.innerHTML = `<div class="error">Ошибка загрузки: ${escapeHtml(error.message)}</div>`;
        }
    }
}

function groupActivitiesByDay(activities) {
    const activitiesByDay = {};

    activities.forEach(activity => {
        try {
            const activityDate = new Date(activity.CREATED.replace('Z', '+00:00'));
            const dateKey = activityDate.toISOString().split('T')[0];

            if (!activitiesByDay[dateKey]) activitiesByDay[dateKey] = [];

            let description = activity.DESCRIPTION || activity.SUBJECT || 'Без описания';
            description = description.replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]*>/g, '')
                .trim()
                .replace(/\s+/g, ' ');

            activitiesByDay[dateKey].push({
                time: activityDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                type: ACTIVITY_TYPES[activity.TYPE_ID]?.name || 'Другое',
                type_class: ACTIVITY_TYPES[activity.TYPE_ID]?.class || 'badge-task',
                description: description
            });
        } catch (e) {
            console.error('Error processing activity:', e);
        }
    });

    return activitiesByDay;
}

function buildActivitiesHtml(activitiesByDay, data) {
    const sortedDays = Object.keys(activitiesByDay).sort().reverse(); // Уже правильно - от новых к старым

    if (sortedDays.length === 0) {
        return '<div class="loading">Нет активностей за выбранный период</div>';
    }

    let contentHtml = `<div style="margin-bottom:15px;padding:12px;background:#e7f3ff;border-radius:6px">
        Всего: ${data.activities_count} | Показано: ${data.activities_returned || data.activities?.length || 0}
    </div>`;

    sortedDays.forEach(day => {
        const acts = activitiesByDay[day];
        const date = new Date(day);
        const dayName = date.toLocaleDateString('ru-RU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        contentHtml += `<div class="day-group">
            <div class="day-header">📅 ${dayName} (${acts.length})</div>`;

        // 🔥 ИЗМЕНЕНИЕ: сортируем активности внутри дня от новых к старым
        const sortedActivities = acts.sort((a, b) => {
            // Создаем даты для сравнения
            const timeA = a.time; // формат "HH:MM"
            const timeB = b.time; // формат "HH:MM"

            // Сравниваем время (от новых к старым)
            return timeB.localeCompare(timeA);
        });

        sortedActivities.forEach(act => {
            const safeDesc = escapeHtml(act.description);
            contentHtml += `
                <div class="activity-item">
                    <div class="activity-line">
                        <span class="activity-time">${act.time}</span>
                        <span class="activity-type ${act.type_class}">${act.type}</span>
                    </div>
                    <div class="activity-description">${safeDesc}</div>
                </div>`;
        });

        contentHtml += `</div>`;
    });

    return contentHtml;
}

function closeDetailsPanel() {
    const p = document.getElementById('detailsPanel');
    if (p) {
        p.classList.remove('active');
        if (p._escHandler) {
            document.removeEventListener('keydown', p._escHandler);
            p._escHandler = null;
        }
    }
}

// ========== АДМИНИСТРИРОВАНИЕ ==========
async function showAdminPanel() {
    if (!currentUser?.is_admin) {
        alert('❌ Требуются права администратора');
        return;
    }

    try {
        const usersCountResponse = await BitrixAPI.getUsersCount();
        const usersCount = usersCountResponse.success ? usersCountResponse.count : allUsers.length;
        showAdminModal(usersCount);
    } catch (error) {
        console.error('Error showing admin panel:', error);
        showAdminModal(allUsers.length);
    }
}

function showAdminModal(usersCount) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'adminModal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>👑 Панель администратора</h2>
                <span class="close" onclick="closeAdminModal()">&times;</span>
            </div>
            <div class="modal-body">
                <div class="admin-section">
                    <h3>Управление пользователями</h3>
                    <div class="admin-actions">
                        <button class="auth-btn" onclick="addAllowedEmail()">➕ Добавить email</button>
                        <button class="auth-btn" onclick="showAllowedEmails()">📧 Показать разрешенные email</button>
                        <button class="auth-btn" onclick="clearAllData()">🗑️ Очистить все данные</button>
                    </div>
                </div>
                <div class="admin-section">
                    <h3>Системная информация</h3>
                    <div class="system-info">
                        <p><strong>Текущий пользователь:</strong> ${currentUser?.email || 'Неизвестно'}</p>
                        <p><strong>Права:</strong> ${currentUser?.is_admin ? 'Администратор' : 'Пользователь'}</p>
                        <p><strong>Всего сотрудников:</strong> ${usersCount}</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    modal.addEventListener('click', function (e) {
        if (e.target === modal) {
            closeAdminModal();
        }
    });

    document.body.appendChild(modal);
    modal.style.display = 'block';
}

function closeAdminModal() {
    const modal = document.getElementById('adminModal');
    if (modal) {
        modal.remove();
    }
}

async function addAllowedEmail() {
    if (!currentUser?.is_admin) {
        alert('❌ Требуются права администратора');
        return;
    }

    const email = prompt('Введите email для добавления в разрешенный список:');
    if (!email) return;

    if (!validateEmail(email)) {
        alert('❌ Введите корректный email');
        return;
    }

    try {
        const result = await BitrixAPI.addAllowedEmail(email);
        if (result.success) {
            alert(`✅ Email ${email} добавлен в разрешенный список`);
        } else {
            alert('❌ Ошибка при добавлении email: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        alert('❌ Ошибка при добавлении email: ' + error.message);
    }
}

async function showAllowedEmails() {
    if (!currentUser?.is_admin) {
        alert('❌ Требуются права администратора');
        return;
    }

    try {
        const result = await BitrixAPI.getAllowedEmails();
        if (result.success && result.emails) {
            const emails = result.emails.join('\n');
            alert(`📧 Разрешенные email:\n\n${emails}`);
        } else {
            alert('❌ Ошибка при получении списка email: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        alert('❌ Ошибка: ' + error.message);
    }
}

function clearAllData() {
    if (confirm('⚠️ Вы уверены, что хотите очистить ВСЕ данные? Это действие нельзя отменить.')) {
        localStorage.clear();
        BitrixAPI.clearAuthToken();
        alert('✅ Все данные очищены. Страница будет перезагружена.');
        location.reload();
    }
}

// ========== АВТОРИЗАЦИЯ ==========
function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'block';
}

function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
}

async function login(e) {
    if (e) e.preventDefault();

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
            await initializeDashboard();
        }
    } catch (error) {
        alert('❌ Ошибка входа: ' + error.message);
    }
    return false;
}

async function register(e) {
    if (e) e.preventDefault();

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

function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

/// ========== СУПЕР-БЫСТРАЯ ЗАГРУЗКА ==========
async function loadDataFast() {
    showLoading('Мгновенная загрузка из кэша...');

    const selectedUsers = getSelectedUsers();
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const activityType = document.getElementById('activityTypeSelect').value;

    if (!startDate || !endDate) {
        alert('Пожалуйста, выберите диапазон дат');
        hideLoading();
        return;
    }

    try {
        // 🔥 ИСПОЛЬЗУЕМ НОВЫЙ СУПЕР-БЫСТРЫЙ ЭНДПОИНТ
        let url = `/api/stats/super-fast?start_date=${startDate}&end_date=${endDate}&include_statistics=true`;
        if (selectedUsers.length > 0) {
            url += `&user_ids=${selectedUsers.join(',')}`;
        }
        if (activityType !== 'all') {
            url += `&activity_type=${activityType}`;
        }

        console.log('🚀 SUPER-FAST loading from cache:', url);

        // 🔥 ОЧЕНЬ КОРОТКИЙ ТАЙМАУТ - кэш должен отвечать мгновенно
        const response = await fetchWithTimeout(url, {
            headers: getAuthHeaders(),
            timeout: 3000 // 3 секунды максимум
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
            displayResults(data);

            if (data.cache_completeness < 100) {
                showNotification(`✅ Данные загружены из кэша (${data.cache_completeness?.toFixed(1) || 0}% рабочих дней)`, 'info');
            } else {
                showNotification('✅ Данные мгновенно загружены из кэша (все рабочие дни)', 'success');
            }

            console.log('🚀 SUPER-FAST LOAD SUCCESS: Loaded from cache without ANY Bitrix logic');

        } else {
            // 🔥 Если в кэше нет данных - предлагаем загрузить из Bitrix
            if (data.from_cache === true && data.cache_completeness === 0) {
                const shouldLoad = confirm('❌ В кэше нет данных за выбранный период. Загрузить из Bitrix?');
                if (shouldLoad) {
                    await loadDataFromBitrix();
                }
            } else {
                throw new Error(data.error || 'Unknown error from server');
            }
        }

    } catch (error) {
        console.error('❌ Error in super-fast load:', error);

        if (error.name === 'TimeoutError') {
            // 🔥 Если таймаут - значит кэш не отвечает, пробуем обычную быструю загрузку
            console.log('⚡ Super-fast timeout, trying regular fast load...');
            await loadDataFastFallback(startDate, endDate, selectedUsers, activityType);
        } else {
            showNotification('❌ Ошибка быстрой загрузки: ' + error.message, 'error');
            showEmptyTableWithError(error.message);
        }
    } finally {
        hideLoading();
    }
}

// 🔥 РЕЗЕРВНЫЙ МЕТОД если супер-быстрая загрузка не сработала
async function loadDataFastFallback(startDate, endDate, selectedUsers, activityType) {
    try {
        showLoading('Быстрая загрузка (резервный метод)...');

        let url = `/api/stats/fast?start_date=${startDate}&end_date=${endDate}&include_statistics=true`;
        if (selectedUsers.length > 0) {
            url += `&user_ids=${selectedUsers.join(',')}`;
        }
        if (activityType !== 'all') {
            url += `&activity_type=${activityType}`;
        }

        console.log('⚡ Fallback fast loading:', url);

        const response = await fetchWithTimeout(url, {
            headers: getAuthHeaders(),
            timeout: 5000
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
            displayResults(data);
            showNotification('✅ Данные загружены из кэша', 'success');
        } else {
            const shouldLoad = confirm(`❌ Данные в кэше неполные (${data.cache_completeness?.toFixed(1) || 0}%). Загрузить из Bitrix?`);
            if (shouldLoad) {
                await loadDataFromBitrix();
            }
        }

    } catch (error) {
        console.error('❌ Error in fallback fast load:', error);
        showNotification('❌ Не удалось загрузить данные из кэша', 'error');
        showEmptyTableWithError('Не удалось загрузить данные из кэша');
    }
}

async function initializeDashboard() {
    try {
        console.log('📊 Initializing dashboard...');
        await waitForCriticalElements();

        ActivityCharts.initCharts();
        await loadUsersList();

        // 🔥 ДОБАВЛЯЕМ: Загружаем всех пользователей в глобальный кэш
        if (!window.allUsers) {
            await loadAllUsersToGlobalCache();
        }

        // Инициализируем чекбоксы для вкладки сделок
        renderDealsUserCheckboxes(allUsers);

        if (BitrixAPI.authToken && currentUser) {
            await loadData();
        } else {
            showLoginPrompt();
        }
    } catch (error) {
        console.error('❌ Dashboard initialization error:', error);
        showNotification('Ошибка инициализации: ' + error.message, 'error');
    }
}

// 🔥 НОВАЯ ФУНКЦИЯ: Загрузка всех пользователей в глобальный кэш
async function loadAllUsersToGlobalCache() {
    try {
        const response = await BitrixAPI.getAllUsers();
        if (response.users) {
            window.allUsers = response.users;
            console.log('✅ Loaded all users to global cache:', window.allUsers.length);
        }
    } catch (error) {
        console.error('Error loading all users to cache:', error);
        // Если ошибка, используем пресейл пользователей как запасной вариант
        window.allUsers = allUsers || [];
    }
}

// ========== ЗАГРУЗКА ИЗ BITRIX ==========
async function loadDataFromBitrix() {
    showLoading('Загрузка данных из Bitrix...');

    const selectedUsers = getSelectedUsers();
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const activityType = document.getElementById('activityTypeSelect').value;

    if (!startDate || !endDate) {
        alert('Пожалуйста, выберите диапазон дат');
        hideLoading();
        return;
    }

    try {
        // 🔥 ПРОВЕРКА РАЗМЕРА ПЕРИОДА
        const start = new Date(startDate);
        const end = new Date(endDate);
        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        if (daysDiff > 30) {
            const useProgressive = confirm(`📅 Выбран большой период (${daysDiff} дней). Рекомендуется использовать прогрессивную загрузку для стабильности. Использовать прогрессивную загрузку?`);
            
            if (useProgressive) {
                await loadProgressiveData(startDate, endDate, selectedUsers);
                return;
            }
        }

        let url = `/api/stats/main?start_date=${startDate}&end_date=${endDate}&include_statistics=true&force_refresh=true`;
        if (selectedUsers.length > 0) {
            url += `&user_ids=${selectedUsers.join(',')}`;
        }
        if (activityType !== 'all') {
            url += `&activity_type=${activityType}`;
        }

        console.log('🔄 Loading data from Bitrix:', url);

        const response = await fetchWithTimeout(url, {
            headers: getAuthHeaders(),
            timeout: 45000 // 45 секунд
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
            displayResults(data);
            showNotification('📊 Данные загружены из Bitrix и сохранены в кэш', 'info');
        } else {
            throw new Error(data.error || 'Unknown error from server');
        }

    } catch (error) {
        console.error('❌ Error loading from Bitrix:', error);

        if (error.name === 'TimeoutError') {
            showNotification(`⏰ Превышено время ожидания. Попробуйте меньший период`, 'error');
        } else if (error.message.includes('504')) {
            showNotification('🌐 Сервер не отвечает. Попробуйте прогрессивную загрузку или меньший период', 'error');
        } else {
            showNotification('❌ Ошибка загрузки из Bitrix: ' + error.message, 'error');
        }

        showEmptyTableWithError(error.message);
    } finally {
        hideLoading();
    }
}

// 🔥 НОВАЯ ФУНКЦИЯ: Прогрессивная загрузка
async function loadProgressiveData(startDate, endDate, selectedUsers) {
    try {
        showLoading('Прогрессивная загрузка больших данных...');

        let url = `/api/load-progressive?start_date=${startDate}&end_date=${endDate}`;
        if (selectedUsers.length > 0) {
            url += `&user_ids=${selectedUsers.join(',')}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
            showNotification(`✅ ${data.message}`, 'success');
            // После загрузки показываем данные из кэша
            await loadDataFast();
        } else {
            throw new Error(data.error || 'Unknown error');
        }

    } catch (error) {
        console.error('❌ Error in progressive load:', error);
        showNotification('❌ Ошибка прогрессивной загрузки: ' + error.message, 'error');
    }
}

// ========== УТИЛИТА ДЛЯ ПУСТОЙ ТАБЛИЦЫ С ОШИБКОЙ ==========
function showEmptyTableWithError(errorMessage, isLargePeriod = false) {
    const tbody = document.getElementById('resultsBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;padding:40px;color:#f56565">
                    ❌ Ошибка загрузки данных<br>
                    <small>${errorMessage}</small><br>
                    <button onclick="loadDataFromBitrix()" style="margin-top:15px;margin-right:10px">🔄 Попробовать снова</button>
                    <button onclick="loadDataFast()" style="margin-top:15px">⚡ Быстрая загрузка</button>
                    ${isLargePeriod ? '<br><small>Рекомендуется выбрать меньший период</small>' : ''}
                </td>
            </tr>
        `;
    }
}

// ========== ГЛОБАЛЬНЫЕ ФУНКЦИИ ==========
window.loadData = loadData;
window.showUserDetails = showUserDetails;
window.closeDetailsPanel = closeDetailsPanel;
window.showAdminPanel = showAdminPanel;
window.addAllowedEmail = addAllowedEmail;
window.showAllowedEmails = showAllowedEmails;
window.clearAllData = clearAllData;
window.login = login;
window.register = register;
window.logout = logout;
window.showAuthModal = showAuthModal;
window.showLogin = showLogin;
window.showRegister = showRegister;
// Добавьте в конец файла
window.loadDataFast = loadDataFast;
window.loadDataFromBitrix = loadDataFromBitrix;
window.switchTab = switchTab;

window.clearCache = async () => {
    if (BitrixAPI.authToken) {
        await BitrixAPI.clearCache();
        alert('Кэш очищен');
        loadData();
    }
};

window.testConnection = async () => {
    const d = await BitrixAPI.testConnection();
    alert(d.connected ? '✅ OK' : '❌ Ошибка');
};

window.showVersion = function () {
    alert(`Версия системы: ${buildDate}`);
};

console.log('✅ app.js loaded');
