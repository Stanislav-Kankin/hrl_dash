// Конфигурация
const ACTIVITY_TYPES = {
    "1": { name: "Встреча", class: "badge-meeting" },
    "2": { name: "Звонок", class: "badge-call" },
    "4": { name: "Задача", class: "badge-task" },
    "6": { name: "Комментарий", class: "badge-comment" }
};

const WEEKDAY_NAMES = {
    'Monday': 'Понедельник',
    'Tuesday': 'Вторник',
    'Wednesday': 'Среда',
    'Thursday': 'Четверг',
    'Friday': 'Пятница',
    'Saturday': 'Суббота',
    'Sunday': 'Воскресенье'
};

// Глобальные переменные
let allUsers = [];
let currentUserStats = {};
let currentStatistics = {};
let currentUser = null;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', async function () {
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

    // Обработчики для полей дат
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    if (startDateInput) {
        startDateInput.addEventListener('change', function() {
            if (document.getElementById('periodSelect').value === 'custom') {
                applyFilters();
            }
        });
    }
    
    if (endDateInput) {
        endDateInput.addEventListener('change', function() {
            if (document.getElementById('periodSelect').value === 'custom') {
                applyFilters();
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
    const token = BitrixAPI.authToken;
    if (!token) {
        showAuthModal();
        return;
    }

    try {
        const userData = await BitrixAPI.getCurrentUser();
        if (userData.error) {
            throw new Error(userData.error);
        }
        currentUser = userData;
        updateUIForAuth();
        await initializeDashboard();
    } catch (error) {
        console.error('Auth check failed:', error);
        showAuthModal();
    }
}

async function initializeDashboard() {
    try {
        console.log('Initializing dashboard...');
        
        // Инициализируем графики
        ActivityCharts.initCharts();
        console.log('Charts initialized');
        
        // Загружаем список сотрудников
        await loadUsersList();

        // Загружаем начальную статистику
        await applyFilters();

        // Тестируем подключение
        const connection = await testConnection();
        if (!connection.connected) {
            console.warn('Внимание: подключение к Bitrix24 не настроено');
        }
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        if (error.message !== 'Authentication required') {
            showError('resultsBody', `Ошибка инициализации: ${error.message}`);
        }
    }
}

// Функции аутентификации
function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'block';
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
            await checkAuthAndInitialize();
            hideAuthModal();
            
            // Очищаем поля после успешного входа
            document.getElementById('loginEmail').value = '';
            document.getElementById('loginPassword').value = '';
        } else {
            // Обработка ошибок входа
            const errorMsg = data.detail || 'Неизвестная ошибка';
            if (errorMsg.includes('Incorrect email or password')) {
                alert('❌ Неверный email или пароль');
            } else if (errorMsg.includes('Account pending approval')) {
                alert('❌ Аккаунт ожидает подтверждения\n\nПожалуйста, дождитесь подтверждения администратора.');
            } else {
                alert('❌ Ошибка входа: ' + errorMsg);
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('❌ Ошибка сети: ' + error.message);
    }
    
    return false; // Предотвращаем отправку формы
}

async function register(event) {
    event.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const full_name = document.getElementById('registerName').value;

    try {
        const data = await BitrixAPI.register(email, password, full_name);
        
        if (data.email) {
            alert('✅ Регистрация успешна! Теперь войдите в систему.');
            showLogin();
            document.getElementById('loginEmail').value = email;
            document.getElementById('registerEmail').value = '';
            document.getElementById('registerPassword').value = '';
            document.getElementById('registerName').value = '';
        } else {
            // Обработка ошибок регистрации
            const errorMsg = data.detail || 'Ошибка сервера';
            if (errorMsg.includes('Регистрация не разрешена')) {
                alert('❌ Регистрация не разрешена\n\nЭтот email не находится в списке разрешенных. Пожалуйста, обратитесь к администратору для получения доступа.');
            } else if (errorMsg.includes('Email уже зарегистрирован')) {
                alert('❌ Email уже зарегистрирован\n\nЭтот email уже есть в системе. Попробуйте войти или восстановить пароль.');
            } else {
                alert('❌ Ошибка регистрации: ' + errorMsg);
            }
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('❌ Ошибка сети: ' + error.message);
    }
    
    return false; // Предотвращаем отправку формы
}

function updateUIForAuth() {
    const header = document.querySelector('.header');
    if (header && currentUser) {
        // Удаляем старую информацию если есть
        const oldUserInfo = header.querySelector('.user-info');
        if (oldUserInfo) {
            oldUserInfo.remove();
        }
        
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
                transition: all 0.3s;
            " onmouseover="this.style.background='rgba(255,255,255,0.5)'" 
            onmouseout="this.style.background='rgba(255,255,255,0.3)'">
                Выйти
            </button>
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
    console.log('Received stats data:', statsData);
    
    if (!statsData || !statsData.user_stats) {
        showError('resultsBody', 'Нет данных для отображения');
        return;
    }

    const tbody = document.getElementById('resultsBody');
    const activeUsersElem = document.getElementById('activeUsers');
    const totalActivitiesElem = document.getElementById('totalActivities');
    const periodMessageElem = document.getElementById('periodMessage');
    const usersMessageElem = document.getElementById('usersMessage');
    const avgPerDayElem = document.getElementById('avgPerDay');
    const mostActiveDayElem = document.getElementById('mostActiveDay');

    // Обновляем summary cards
    activeUsersElem.textContent = statsData.active_users || 0;
    totalActivitiesElem.textContent = statsData.total_activities || 0;

    // Обновляем расширенную статистику
    if (statsData.statistics) {
        console.log('Statistics data:', statsData.statistics);
        currentStatistics = statsData.statistics;
        
        // Среднее в день
        const daysCount = statsData.statistics.daily_stats?.length || 1;
        const avgPerDay = daysCount > 0 ? Math.round(statsData.total_activities / daysCount) : 0;
        avgPerDayElem.textContent = avgPerDay;
        
        // Самый активный день недели
        if (statsData.statistics.weekday_stats) {
            const mostActiveDay = Object.entries(statsData.statistics.weekday_stats)
                .reduce((a, b) => a[1] > b[1] ? a : b, ['', 0]);
            mostActiveDayElem.textContent = WEEKDAY_NAMES[mostActiveDay[0]] || mostActiveDay[0];
        }
        
        // Обновляем графики
        ActivityCharts.updateAllCharts(statsData.statistics);
    } else {
        console.log('No statistics data received');
        // Заполняем нулями если нет статистики
        avgPerDayElem.textContent = '0';
        mostActiveDayElem.textContent = '-';
        
        // Обновляем графики пустыми данными
        ActivityCharts.updateAllCharts({
            weekday_stats: {},
            hourly_stats: {},
            type_stats: {},
            daily_stats: []
        });
    }

    // Обновляем сообщения о периоде
    let periodMessage = `за ${statsData.period_days || 30} дней`;
    if (statsData.date_range) {
        periodMessage = `с ${statsData.date_range.start} по ${statsData.date_range.end}`;
    }
    periodMessageElem.textContent = periodMessage;
    usersMessageElem.textContent = `Найдено ${statsData.active_users || 0} сотрудников`;

    // Считаем общее количество звонков и комментариев
    let totalCalls = 0;
    let totalComments = 0;

    statsData.user_stats.forEach(user => {
        totalCalls += user.calls || 0;
        totalComments += user.comments || 0;
    });

    document.getElementById('totalCalls').textContent = totalCalls;
    document.getElementById('totalComments').textContent = totalComments;

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

// Функции фильтров
async function applyFilters() {
    try {
        // Показываем индикатор загрузки
        showLoading('resultsBody', 'Загрузка данных...');
        
        const periodSelect = document.getElementById('periodSelect');
        const period = periodSelect.value;
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
                
                if (new Date(startDate) > new Date(endDate)) {
                    alert('Начальная дата не может быть больше конечной даты');
                    return;
                }
            } else {
                alert('Пожалуйста, выберите начальную и конечную даты');
                return;
            }
        } else {
            filters.days = parseInt(period);
        }

        console.log('Applying filters:', filters);

        const statsData = await loadDetailedStats(filters);
        if (statsData) {
            displayUserStats(statsData);
        }

        // Скрываем панель детализации при применении новых фильтров
        const detailsPanel = document.getElementById('detailsPanel');
        if (detailsPanel) {
            detailsPanel.classList.remove('active');
        }
    } catch (error) {
        console.error('Error applying filters:', error);
        showError('resultsBody', `Ошибка применения фильтров: ${error.message}`);
    }
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

// Функция отладки пользователей
async function debugUsers() {
    try {
        const response = await BitrixAPI.makeAuthenticatedRequest('/api/debug/users');
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

// Функция поиска пользователей
async function findUsers() {
    try {
        const response = await BitrixAPI.makeAuthenticatedRequest('/api/find-users');
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

// Функция очистки кэша
async function clearCache() {
    try {
        const result = await BitrixAPI.clearCache();
        if (result.success) {
            alert('✅ Кэш успешно очищен!');
            // Перезагружаем данные
            await applyFilters();
        } else {
            alert('❌ Ошибка очистки кэша: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        alert('❌ Ошибка очистки кэша: ' + error.message);
    }
}

// Функция детализации
function showUserDetails(userId) {
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
}

// Функции для управления белым списком (для администратора)
async function showAdminPanel() {
    try {
        const response = await BitrixAPI.makeAuthenticatedRequest('/api/admin/allowed-emails');
        const data = await response.json();
        
        let message = '📧 Разрешенные email-адреса:\n\n';
        data.allowed_emails.forEach(email => {
            message += `• ${email}\n`;
        });
        
        message += '\nДля добавления/удаления используйте API:';
        message += '\n- POST /api/admin/add-allowed-email';
        message += '\n- POST /api/admin/remove-allowed-email';
        
        alert(message);
    } catch (error) {
        console.error('Admin panel error:', error);
        alert('❌ Ошибка загрузки списка: ' + error.message);
    }
}

async function addAllowedEmail() {
    const email = prompt('Введите email для добавления в белый список:');
    if (email) {
        try {
            const response = await BitrixAPI.makeAuthenticatedRequest('/api/admin/add-allowed-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: email })
            });
            const data = await response.json();
            alert('✅ ' + data.message);
        } catch (error) {
            console.error('Add email error:', error);
            alert('❌ Ошибка добавления: ' + error.message);
        }
    }
}

async function removeAllowedEmail() {
    const email = prompt('Введите email для удаления из белого списка:');
    if (email) {
        try {
            const response = await BitrixAPI.makeAuthenticatedRequest('/api/admin/remove-allowed-email', {
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
}