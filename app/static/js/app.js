// Конфигурация
const ACTIVITY_TYPES = {
    "1": { name: "Встреча", class: "badge-meeting" },
    "2": { name: "Звонок", class: "badge-call" },
    "4": { name: "Задача", class: "badge-task" },
    "6": { name: "Комментарий", class: "badge-comment" }
};

// Глобальные переменные
let allUsers = [];
let currentUserStats = {};

// API функции
async function loadUsersList() {
    try {
        showLoading('resultsBody', 'Загрузка сотрудников...');
        const data = await BitrixAPI.getUsersList();

        if (data.users) {
            allUsers = data.users;
            updateUserSelect();
            return data.users;
        } else {
            throw new Error(data.error || 'Не удалось загрузить сотрудников');
        }
    } catch (error) {
        console.error('Ошибка загрузки сотрудников:', error);
        showError('resultsBody', `Ошибка загрузки сотрудников: ${error.message}`);
        return [];
    }
}

async function loadDetailedStats(filters = {}) {
    try {
        showLoading('resultsBody', 'Загрузка статистики...');
        const data = await BitrixAPI.getDetailedStats(filters);

        if (data.error) {
            throw new Error(data.error);
        }

        return data;
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
        showError('resultsBody', `Ошибка загрузки статистики: ${error.message}`);
        return null;
    }
}

async function testConnection() {
    try {
        const data = await BitrixAPI.testConnection();

        if (data.connected) {
            alert('✅ Подключение к Bitrix24 успешно!');
        } else {
            alert('❌ Ошибка подключения к Bitrix24. Проверьте настройки.');
        }

        return data;
    } catch (error) {
        alert('❌ Ошибка подключения: ' + error.message);
        return { connected: false };
    }
}

// Функции отображения
function updateUserSelect() {
    const select = document.getElementById('employeesSelect');
    const currentValue = select.value;

    select.innerHTML = '<option value="all">Все сотрудники</option>';

    allUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.ID;
        option.textContent = `${user.NAME} ${user.LAST_NAME}${user.WORK_POSITION ? ` (${user.WORK_POSITION})` : ''}`;
        select.appendChild(option);
    });

    // Восстанавливаем выбранное значение если нужно
    if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
        select.value = currentValue;
    }
}

function displayUserStats(statsData) {
    if (!statsData || !statsData.user_stats) {
        showError('resultsBody', 'Нет данных для отображения');
        return;
    }

    const tbody = document.getElementById('resultsBody');
    const activeUsersElem = document.getElementById('activeUsers');
    const totalActivitiesElem = document.getElementById('totalActivities');
    const periodMessageElem = document.getElementById('periodMessage');
    const usersMessageElem = document.getElementById('usersMessage');

    // Обновляем summary cards
    activeUsersElem.textContent = statsData.active_users || 0;
    totalActivitiesElem.textContent = statsData.total_activities || 0;

    // Используем кастомное сообщение о периоде если есть
    const periodMessage = statsData.period_message || `за ${statsData.period_days || 30} дней`;
    periodMessageElem.textContent = periodMessage;
    usersMessageElem.textContent = `Найдено ${statsData.active_users || 0} сотрудников`;

    // Считаем общее количество звонков и комментариев
    let totalCalls = 0;
    let totalComments = 0;

    statsData.user_stats.forEach(user => {
        totalCalls += user.calls || 0;
        totalComments += user.comments || 0;
    });

    totalCallsElem.textContent = totalCalls;
    totalCommentsElem.textContent = totalComments;

    const period = document.getElementById('periodSelect').value;
    periodMessageElem.textContent = `за ${period} дней`;
    usersMessageElem.textContent = `Найдено ${statsData.active_users || 0} сотрудников`;

    // Отображаем таблицу
    if (statsData.user_stats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Нет данных для отображения</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    statsData.user_stats.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="employee-name">${user.user_name}</td>
            <td>${user.days_count || 0} дней</td>
            <td><span class="activity-badge badge-call">${user.calls || 0}</span></td>
            <td><span class="activity-badge badge-comment">${user.comments || 0}</span></td>
            <td><span class="activity-badge badge-task">${user.tasks || 0}</span></td>
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

    // Сохраняем статистику для детализации
    currentUserStats = {};
    statsData.user_stats.forEach(user => {
        currentUserStats[user.user_id] = user;
    });
}

function showUserDetails(userId) {
    const userStats = currentUserStats[userId];
    if (!userStats) return;

    const panel = document.getElementById('detailsPanel');
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
}

// Функции фильтров
async function applyFilters() {
    const period = parseInt(document.getElementById('periodSelect').value);
    const employeeFilter = document.getElementById('employeesSelect').value;
    const activityTypeFilter = document.getElementById('activityTypeSelect').value;

    const filters = {
        days: period,
        user_ids: employeeFilter === 'all' ? [] : [employeeFilter],
        activity_type: activityTypeFilter === 'all' ? null : activityTypeFilter
    };

    const statsData = await loadDetailedStats(filters);
    if (statsData) {
        displayUserStats(statsData);
    }

    // Скрываем панель детализации при применении новых фильтров
    document.getElementById('detailsPanel').classList.remove('active');
}

function toggleQuickAction(action) {
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
}

// Вспомогательные функции
function showLoading(elementId, message = 'Загрузка...') {
    const element = document.getElementById(elementId);
    element.innerHTML = `<tr><td colspan="8" class="loading">${message}</td></tr>`;
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    element.innerHTML = `<tr><td colspan="8" style="color: red; text-align: center; padding: 20px;">${message}</td></tr>`;
}

// Функция отладки пользователей
async function debugUsers() {
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
}
document.getElementById('periodSelect').addEventListener('change', function () {
    const customRange = document.getElementById('customDateRange');
    if (this.value === 'custom') {
        customRange.style.display = 'block';
    } else {
        customRange.style.display = 'none';
    }
});

// Обновленная функция applyFilters
async function applyFilters() {
    const periodSelect = document.getElementById('periodSelect');
    const period = periodSelect.value;
    const employeeFilter = document.getElementById('employeesSelect').value;
    const activityTypeFilter = document.getElementById('activityTypeSelect').value;

    const filters = {
        days: period === 'custom' ? 30 : parseInt(period), // временно
        user_ids: employeeFilter === 'all' ? [] : [employeeFilter],
        activity_type: activityTypeFilter === 'all' ? null : activityTypeFilter
    };

    // Если выбран кастомный период
    if (period === 'custom') {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        if (startDate && endDate) {
            filters.start_date = startDate;
            filters.end_date = endDate;
        }
    }

    const statsData = await loadDetailedStats(filters);
    if (statsData) {
        displayUserStats(statsData);
    }

    document.getElementById('detailsPanel').classList.remove('active');
}

// Функция поиска пользователей
async function findUsers() {
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
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', async function () {
    // Загружаем список сотрудников
    await loadUsersList();

    // Загружаем начальную статистику
    await applyFilters();

    // Тестируем подключение
    const connection = await testConnection();
    if (!connection.connected) {
        console.warn('Внимание: подключение к Bitrix24 не настроено');
    }
});


