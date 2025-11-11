// deals.js - Функции для работы со сделками

class DealsManager {
    static charts = {};
    static currentDealsData = null;

    static initCharts() {
        // График распределения сделок по стадиям
        const stagesCtx = document.getElementById('dealsStagesChart')?.getContext('2d');
        if (stagesCtx) {
            this.charts.stages = new Chart(stagesCtx, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        },
                        title: {
                            display: true,
                            text: 'Распределение сделок по стадиям'
                        }
                    }
                }
            });
        }

        // График суммы сделок по стадиям
        const valueCtx = document.getElementById('dealsValueChart')?.getContext('2d');
        if (valueCtx) {
            this.charts.value = new Chart(valueCtx, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Сумма сделок',
                        data: [],
                        backgroundColor: 'rgba(54, 162, 235, 0.8)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: 'Сумма сделок по стадиям'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Сумма (руб)'
                            }
                        }
                    }
                }
            });
        }
    }

    static updateCharts(stats) {
        if (!stats || !stats.deals_by_stage) return;

        const stagesData = stats.deals_by_stage;

        // Обновляем круговую диаграмму
        if (this.charts.stages) {
            this.charts.stages.data.labels = stagesData.map(stage => stage.stage_name);
            this.charts.stages.data.datasets[0].data = stagesData.map(stage => stage.count);
            this.charts.stages.data.datasets[0].backgroundColor = stagesData.map(stage => stage.stage_color || '#cccccc');
            this.charts.stages.update();
        }

        // Обновляем столбчатую диаграмму
        if (this.charts.value) {
            this.charts.value.data.labels = stagesData.map(stage => stage.stage_name);
            this.charts.value.data.datasets[0].data = stagesData.map(stage => stage.value);
            this.charts.value.data.datasets[0].backgroundColor = stagesData.map(stage => stage.stage_color || '#cccccc');
            this.charts.value.update();
        }
    }

    static updateSummaryCards(stats) {
        if (!stats) return;

        document.getElementById('totalDeals').textContent = stats.total_deals?.toLocaleString() || '0';
        document.getElementById('totalDealsValue').textContent = stats.total_value?.toLocaleString() || '0';

        // Рассчитываем сделки в работе (все кроме завершенных)
        const inProgress = stats.deals_by_stage?.filter(stage =>
            !stage.stage_name.toLowerCase().includes('выигр') &&
            !stage.stage_name.toLowerCase().includes('проигр')
        ).reduce((sum, stage) => sum + stage.count, 0) || 0;

        document.getElementById('dealsInProgress').textContent = inProgress.toLocaleString();

        // Успешные сделки (выигранные)
        const successful = stats.deals_by_stage?.filter(stage =>
            stage.stage_name.toLowerCase().includes('выигр')
        ).reduce((sum, stage) => sum + stage.count, 0) || 0;

        document.getElementById('successfulDeals').textContent = successful.toLocaleString();
    }

    static displayDealsTable(deals, userInfoMap) {
        const tbody = document.getElementById('dealsBody');
        if (!tbody) {
            console.error('❌ dealsBody element not found!');
            return;
        }

        console.log('Displaying deals table with:', deals ? deals.length : 0, 'deals');
        console.log('User info map keys:', Object.keys(userInfoMap));

        if (!deals || deals.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">Нет данных о сделках за выбранный период</td></tr>';
            return;
        }

        tbody.innerHTML = '';

        deals.forEach((deal, index) => {
            const row = document.createElement('tr');

            // Получаем информацию о пользователе
            const userInfo = userInfoMap[deal.ASSIGNED_BY_ID];
            const userName = userInfo ?
                `${userInfo.NAME || ''} ${userInfo.LAST_NAME || ''}`.trim() :
                `ID: ${deal.ASSIGNED_BY_ID}`;

            console.log(`Deal ${index}:`, {
                title: deal.TITLE,
                assignedTo: deal.ASSIGNED_BY_ID,
                userName: userName,
                stage: deal.STAGE_NAME
            });

            // Форматируем даты
            let createdDate = 'Нет данных';
            let modifiedDate = 'Нет данных';

            try {
                if (deal.DATE_CREATE) {
                    const created = new Date(deal.DATE_CREATE.replace('Z', '+00:00'));
                    createdDate = created.toLocaleDateString('ru-RU');
                }
                if (deal.DATE_MODIFY) {
                    const modified = new Date(deal.DATE_MODIFY.replace('Z', '+00:00'));
                    modifiedDate = modified.toLocaleDateString('ru-RU');
                }
            } catch (e) {
                console.error('Error parsing dates:', e);
            }

            // Создаем бейдж для стадии с цветом
            const stageBadge = `<span class="stage-badge" style="background-color: ${deal.STAGE_COLOR || '#cccccc'}">${deal.STAGE_NAME || 'Неизвестно'}</span>`;

            // Форматируем сумму
            const amount = parseFloat(deal.OPPORTUNITY || 0).toLocaleString('ru-RU') + ' ₽';

            row.innerHTML = `
            <td><strong>${escapeHtml(deal.TITLE || 'Без названия')}</strong></td>
            <td>${escapeHtml(userName)}</td>
            <td>${stageBadge}</td>
            <td>${amount}</td>
            <td>${createdDate}</td>
            <td>${modifiedDate}</td>
        `;
            tbody.appendChild(row);
        });

        console.log('✅ Deals table updated with', deals.length, 'rows');
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

// Функции для работы с UI
async function loadDealsData() {
    showLoading('Загрузка данных о сделках...');

    const selectedUsers = getSelectedDealsUsers();
    const startDate = document.getElementById('dealsStartDate').value;
    const endDate = document.getElementById('dealsEndDate').value;

    try {
        // Загружаем список ВСЕХ пользователей для отображения имен
        const allUsersResponse = await BitrixAPI.getAllUsers();
        const userInfoMap = {};
        if (allUsersResponse.users) {
            allUsersResponse.users.forEach(user => {
                userInfoMap[user.ID] = user;
            });
        }
        console.log('Loaded user info for:', Object.keys(userInfoMap).length, 'users');

        // Загружаем сделки через BitrixAPI
        const dealsResponse = await BitrixAPI.getDealsList(startDate, endDate, selectedUsers);

        if (dealsResponse.success) {
            DealsManager.currentDealsData = dealsResponse.deals;
            DealsManager.displayDealsTable(dealsResponse.deals, userInfoMap);

            // Загружаем статистику
            const statsResponse = await BitrixAPI.getDealsStats(startDate, endDate, selectedUsers);
            if (statsResponse.success) {
                DealsManager.updateSummaryCards(statsResponse.stats);
                DealsManager.updateCharts(statsResponse.stats);
            }

            showNotification(`✅ Загружено ${dealsResponse.count} сделок`, 'success');
        } else {
            throw new Error(dealsResponse.error || 'Unknown error from server');
        }

    } catch (error) {
        console.error('❌ Error loading deals:', error);
        showNotification('❌ Ошибка загрузки сделок: ' + error.message, 'error');

        const tbody = document.getElementById('dealsBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center;padding:40px;color:#f56565">
                        ❌ Ошибка загрузки данных<br>
                        <small>${error.message}</small><br>
                        <button onclick="loadDealsData()" style="margin-top:15px">🔄 Попробовать снова</button>
                    </td>
                </tr>
            `;
        }
    } finally {
        hideLoading();
    }
}

async function loadDealsStats(userIds = [], startDate = null, endDate = null) {
    try {
        let url = `/api/deals/stats`;
        const params = [];

        if (startDate) params.push(`start_date=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`end_date=${encodeURIComponent(endDate)}`);
        if (userIds.length > 0) params.push(`user_ids=${userIds.join(',')}`);

        if (params.length > 0) {
            url += `?${params.join('&')}`;
        }

        const response = await fetchWithTimeout(url, {
            headers: getAuthHeaders(),
            timeout: 30000
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
            DealsManager.updateSummaryCards(data.stats);
            DealsManager.updateCharts(data.stats);
        }

    } catch (error) {
        console.error('❌ Error loading deals stats:', error);
    }
}

function getSelectedDealsUsers() {
    const checkboxes = document.querySelectorAll('#dealsEmployeesCheckboxes input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function renderDealsUserCheckboxes(users) {
    const container = document.getElementById('dealsEmployeesCheckboxes');
    if (!container) return;

    container.innerHTML = '';
    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <input type="checkbox" id="deals_user_${user.ID}" value="${user.ID}" class="user-checkbox" checked>
            <label for="deals_user_${user.ID}">${user.NAME} ${user.LAST_NAME}</label>
        `;
        container.appendChild(div);
    });
}

function switchTab(tabName) {
    // Скрываем все вкладки
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Убираем активный класс со всех кнопок
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });

    // Показываем выбранную вкладку
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Активируем кнопку
    event.target.classList.add('active');

    // Инициализируем графики для вкладки сделок при первом переходе
    if (tabName === 'deals' && Object.keys(DealsManager.charts).length === 0) {
        DealsManager.initCharts();

        // Устанавливаем даты по умолчанию для сделок
        const today = new Date();
        const startDate = new Date(today);
        startDate.setMonth(today.getMonth() - 1); // Последние 30 дней

        document.getElementById('dealsStartDate').value = startDate.toISOString().split('T')[0];
        document.getElementById('dealsEndDate').value = today.toISOString().split('T')[0];
    }
}

async function loadAnalyticsData() {
    showNotification('📊 Раздел аналитики в разработке', 'info');
}

async function testDealsDisplay() {
    console.log('🧪 Testing deals display...');

    const tbody = document.getElementById('dealsBody');
    if (!tbody) {
        console.error('❌ dealsBody not found!');
        return;
    }

    // Просто показываем тестовые данные
    tbody.innerHTML = `
        <tr>
            <td><strong>Тестовая сделка 1</strong></td>
            <td>Иван Иванов</td>
            <td><span class="stage-badge" style="background-color: #28a745">Успешно</span></td>
            <td>100 000 ₽</td>
            <td>2025-11-11</td>
            <td>2025-11-11</td>
        </tr>
        <tr>
            <td><strong>Тестовая сделка 2</strong></td>
            <td>Петр Петров</td>
            <td><span class="stage-badge" style="background-color: #ffc107">В работе</span></td>
            <td>50 000 ₽</td>
            <td>2025-11-10</td>
            <td>2025-11-11</td>
        </tr>
    `;

    console.log('✅ Test data displayed');
}


// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function () {
    // Инициализируем вкладку сделок когда DOM готов
    setTimeout(() => {
        if (document.getElementById('deals-tab')) {
            DealsManager.initCharts();
        }
    }, 1000);
});