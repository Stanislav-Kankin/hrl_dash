// app.js - ИСПРАВЛЕННАЯ ВЕРСИЯ С ОДНИМ ДНЕМ ПО УМОЛЧАНИЮ

const ACTIVITY_TYPES = {
    "1": { name: "Встреча", class: "badge-meeting" },
    "2": { name: "Звонок", class: "badge-call" },
    "4": { name: "Задача", class: "badge-task" },
    "6": { name: "Комментарий", class: "badge-comment" }
};

let allUsers = [];
let currentUserStats = {};
let currentUser = null;

function getElementValueSafely(id, defaultValue = '') {
    const el = document.getElementById(id);
    return el ? (el.value || defaultValue) : defaultValue;
}

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
        showError('resultsBody', `Ошибка инициализации: ${error.message}`);
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
            // Устанавливаем сегодняшний день как начальную и конечную дату
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

        // Инициализируем графики
        ActivityCharts.initCharts();

        // Загружаем список пользователей
        await loadUsersList();

        // Если авторизован — загружаем данные
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

async function applyFilters() {
    if (!BitrixAPI.authToken || !currentUser) {
        showLoginPrompt();
        return;
    }

    showLoading('resultsBody', 'Загрузка данных...');

    const checkboxes = document.querySelectorAll('#employeesCheckboxes .user-checkbox:checked');
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const activityType = document.getElementById('activityTypeSelect').value;

    if (!startDate || !endDate) {
        alert('❌ Пожалуйста, выберите диапазон дат');
        return;
    }

    if (checkboxes.length === 0) {
        alert('❌ Выберите хотя бы одного сотрудника');
        return;
    }

    const selectedUserIds = Array.from(checkboxes).map(cb => cb.value);

    const filters = {
        user_ids: selectedUserIds,
        activity_type: activityType === 'all' ? null : activityType,
        start_date: startDate,
        end_date: endDate
    };

    try {
        const statsData = await BitrixAPI.getDetailedStats(filters);
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

function displayUserStats(statsData) {
    if (!statsData?.user_stats) {
        showError('resultsBody', 'Нет данных для отображения');
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

    // Обновляем все графики
    if (statsData.statistics) {
        ActivityCharts.updateAllCharts(statsData.statistics);
    }
    
    // ОБНОВЛЯЕМ ГРАФИК СРАВНЕНИЯ
    console.log('📊 Displaying stats for', statsData.user_stats.length, 'users');
    ActivityCharts.updateComparisonChart(statsData.user_stats);
}

async function loadUsersList() {
    try {
        showLoading('resultsBody', 'Загрузка сотрудников...');
        const data = await BitrixAPI.getUsersList();
        if (data.users && data.users.length > 0) {
            allUsers = data.users;
        } else {
            allUsers = [
                { ID: '8860', NAME: 'Безина', LAST_NAME: 'Ольга' },
                { ID: '8988', NAME: 'Фатюхина', LAST_NAME: 'Полина' },
                { ID: '17087', NAME: 'Агапова', LAST_NAME: 'Анастасия' },
                { ID: '17919', NAME: 'Некрасова', LAST_NAME: 'Елена' },
                { ID: '17395', NAME: 'Вахрушева', LAST_NAME: 'Наталия' },
                { ID: '18065', NAME: 'Прокофьева', LAST_NAME: 'Дарья' }
            ];
        }
        renderUserCheckboxes();
    } catch (error) {
        console.error('Ошибка загрузки сотрудников:', error);
        allUsers = [
            { ID: '8860', NAME: 'Безина', LAST_NAME: 'Ольга' },
            { ID: '8988', NAME: 'Фатюхина', LAST_NAME: 'Полина' },
            { ID: '17087', NAME: 'Агапова', LAST_NAME: 'Анастасия' },
            { ID: '17919', NAME: 'Некрасова', LAST_NAME: 'Елена' },
            { ID: '17395', NAME: 'Вахрушева', LAST_NAME: 'Наталия' },
            { ID: '18065', NAME: 'Прокофьева', LAST_NAME: 'Дарья' }
        ];
        renderUserCheckboxes();
    }
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

window.showUserDetails = async function (userId) {
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
        const activitiesByDay = {};
        if (activities.length > 0) {
            activities.forEach(activity => {
                try {
                    const activityDate = new Date(activity.CREATED.replace('Z', '+00:00'));
                    const dateKey = activityDate.toISOString().split('T')[0];
                    if (!activitiesByDay[dateKey]) activitiesByDay[dateKey] = [];
                    let description = activity.DESCRIPTION || activity.SUBJECT || 'Без описания';
                    description = description.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ');
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
        }
        const sortedDays = Object.keys(activitiesByDay).sort().reverse();
        let contentHtml = '';
        if (sortedDays.length === 0) {
            contentHtml = '<div class="loading">Нет активностей за выбранный период</div>';
        } else {
            contentHtml = `<div style="margin-bottom:15px;padding:12px;background:#e7f3ff;border-radius:6px">Всего: ${data.activities_count} | Показано: ${data.activities_returned}</div>`;
            sortedDays.forEach(day => {
                const acts = activitiesByDay[day];
                const date = new Date(day);
                const dayName = date.toLocaleDateString('ru-RU', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                contentHtml += `<div class="day-group"><div class="day-header">📅 ${dayName} (${acts.length})</div>`;
                acts.forEach(act => {
                    const safeDesc = escapeHtml(act.description);
                    contentHtml += `<div class="activity-item"><div class="activity-line"><span class="activity-time">${act.time}</span><span class="activity-type ${act.type_class}">${act.type}</span></div><div class="activity-description">${safeDesc}</div></div>`;
                });
                contentHtml += `</div>`;
            });
        }
        const contentDiv = panel.querySelector('.details-content');
        if (contentDiv) contentDiv.innerHTML = contentHtml;
    } catch (error) {
        console.error('❌ Error in details:', error);
        const contentDiv = panel.querySelector('.details-content');
        if (contentDiv) {
            contentDiv.innerHTML = `<div class="error">Ошибка загрузки: ${escapeHtml(error.message)}</div>`;
        }
    }
};

window.closeDetailsPanel = function () {
    const p = document.getElementById('detailsPanel');
    if (p) {
        p.classList.remove('active');
        if (p._escHandler) {
            document.removeEventListener('keydown', p._escHandler);
            p._escHandler = null;
        }
    }
};

// === ГЛОБАЛЬНЫЕ ФУНКЦИИ ===
window.applyFilters = applyFilters;
window.login = login;
window.register = register;
window.logout = logout;
window.showAuthModal = showAuthModal;
window.clearCache = async () => {
    if (BitrixAPI.authToken) {
        await BitrixAPI.clearCache();
        alert('Кэш очищен');
        applyFilters();
    }
};
window.testConnection = async () => {
    const d = await BitrixAPI.testConnection();
    alert(d.connected ? '✅ OK' : '❌ Ошибка');
};

// === ВСПОМОГАТЕЛЬНЫЕ ===
function showLoading(elId, msg = 'Загрузка...') {
    const el = document.getElementById(elId);
    if (el) el.innerHTML = `<tr><td colspan="8" class="loading">${msg}</td></tr>`;
}
function showError(elId, msg) {
    const el = document.getElementById(elId);
    if (el) el.innerHTML = `<tr><td colspan="8" style="color:red;text-align:center">${msg}</td></tr>`;
}
function escapeHtml(unsafe) {
    return typeof unsafe === 'string' ? unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;") : unsafe;
}

// === АВТОРИЗАЦИЯ ===
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

// Функции для переключения форм авторизации
function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

console.log('✅ app.js loaded');