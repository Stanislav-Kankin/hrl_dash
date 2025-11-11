// deals.js - Функции для работы со сделками

class DealsManager {
    static charts = {};
    static currentDealsData = null;
    static currentPage = 1;
    static pageSize = 50;
    static currentView = 'period'; // 'period' или 'all'

    static initCharts() {
        console.log('📊 Initializing deals charts...');

        // График распределения сделок по стадиям
        const stagesCtx = document.getElementById('dealsStagesChart')?.getContext('2d');
        if (stagesCtx && !this.charts.stages) {
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
        if (valueCtx && !this.charts.value) {
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

        console.log('✅ Deals charts initialized');
    }

    static updateCharts(stats) {
        if (!stats || !stats.deals_by_stage) {
            console.log('No stats data for charts:', stats);
            return;
        }

        const stagesData = stats.deals_by_stage;
        console.log('Updating charts with stages data:', stagesData);

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
        if (!stats) {
            console.log('No stats for summary cards');
            return;
        }

        console.log('Updating summary cards with:', stats);

        document.getElementById('totalDeals').textContent = stats.total_deals?.toLocaleString() || '0';
        document.getElementById('totalDealsValue').textContent = stats.total_value?.toLocaleString() + ' ₽' || '0 ₽';

        // Рассчитываем сделки в работе (все кроме завершенных)
        const inProgress = stats.deals_by_stage?.filter(stage =>
            !stage.stage_name.toLowerCase().includes('выигр') &&
            !stage.stage_name.toLowerCase().includes('проигр') &&
            !stage.stage_name.toLowerCase().includes('заверш')
        ).reduce((sum, stage) => sum + stage.count, 0) || 0;

        document.getElementById('dealsInProgress').textContent = inProgress.toLocaleString();

        // Успешные сделки (выигранные)
        const successful = stats.deals_by_stage?.filter(stage =>
            stage.stage_name.toLowerCase().includes('выигр') ||
            stage.stage_name.toLowerCase().includes('успеш')
        ).reduce((sum, stage) => sum + stage.count, 0) || 0;

        document.getElementById('successfulDeals').textContent = successful.toLocaleString();
    }

    static displayDealsTable(deals, userInfoMap, showPagination = true) {
        const tbody = document.getElementById('dealsBody');
        if (!tbody) {
            console.error('❌ dealsBody element not found!');
            return;
        }

        console.log('Displaying deals table with:', deals ? deals.length : 0, 'deals');

        // Логируем распределение по стадиям для отладки
        if (deals && deals.length > 0) {
            const stageDistribution = {};
            deals.forEach(deal => {
                const stageName = deal.STAGE_NAME;
                stageDistribution[stageName] = (stageDistribution[stageName] || 0) + 1;
            });
            console.log('📊 Stage distribution:', stageDistribution);
        }

        if (!deals || deals.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading">Нет данных о сделках</td></tr>';
            this.updatePagination(0);
            return;
        }

        // Пагинация
        const totalPages = Math.ceil(deals.length / this.pageSize);
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, deals.length);
        const pageDeals = deals.slice(startIndex, endIndex);

        tbody.innerHTML = '';

        pageDeals.forEach((deal, index) => {
            const row = document.createElement('tr');
            const globalIndex = startIndex + index + 1;

            // Получаем информацию о пользователе
            const userInfo = userInfoMap[deal.ASSIGNED_BY_ID];
            const userName = userInfo ?
                `${userInfo.NAME || ''} ${userInfo.LAST_NAME || ''}`.trim() :
                `ID: ${deal.ASSIGNED_BY_ID}`;

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

            // Дополнительная информация о стадии
            const stageInfo = deal.ENTITY_ID ? `<br><small>Тип: ${deal.ENTITY_ID}</small>` : '';

            row.innerHTML = `
            <td>
                <strong>#${globalIndex}. ${escapeHtml(deal.TITLE || 'Без названия')}</strong>
                ${stageInfo}
            </td>
            <td>${escapeHtml(userName)}</td>
            <td>${stageBadge}</td>
            <td style="text-align: right;">${amount}</td>
            <td>${createdDate}</td>
            <td>${modifiedDate}</td>
            <td>${deal.ID}</td>
        `;
            tbody.appendChild(row);
        });

        if (showPagination) {
            this.updatePagination(deals.length, totalPages);
        }

        console.log('✅ Deals table updated with', pageDeals.length, 'rows (page', this.currentPage, 'of', totalPages + ')');
    }

    static updatePagination(totalDeals, totalPages) {
        const paginationContainer = document.getElementById('dealsPagination');
        if (!paginationContainer) return;

        if (totalDeals === 0) {
            paginationContainer.innerHTML = '';
            return;
        }

        const startIndex = (this.currentPage - 1) * this.pageSize + 1;
        const endIndex = Math.min(this.currentPage * this.pageSize, totalDeals);

        paginationContainer.innerHTML = `
            <div class="pagination-info">
                Показано ${startIndex}-${endIndex} из ${totalDeals} сделок
            </div>
            <div class="pagination-controls">
                <button class="pagination-btn" onclick="DealsManager.previousPage()" ${this.currentPage === 1 ? 'disabled' : ''}>
                    ◀ Назад
                </button>
                <span class="pagination-page">Страница ${this.currentPage} из ${totalPages}</span>
                <button class="pagination-btn" onclick="DealsManager.nextPage()" ${this.currentPage === totalPages ? 'disabled' : ''}>
                    Вперед ▶
                </button>
            </div>
        `;
    }

    static nextPage() {
        this.currentPage++;
        this.refreshCurrentView();
    }

    static previousPage() {
        this.currentPage--;
        this.refreshCurrentView();
    }

    static refreshCurrentView() {
        if (this.currentView === 'period') {
            loadDealsData();
        } else {
            loadUserAllDeals();
        }
    }

    static switchView(viewType) {
        this.currentView = viewType;
        this.currentPage = 1; // Сбрасываем на первую страницу
    }

    // 🔥 НОВАЯ ФУНКЦИЯ: Расчет статистики на фронтенде для всех сделок
    static calculateStatsFromDeals(deals) {
        if (!deals || deals.length === 0) {
            return {
                total_deals: 0,
                total_value: 0,
                deals_by_stage: []
            };
        }

        const stageStats = {};
        let totalValue = 0;

        deals.forEach(deal => {
            const stageId = deal.STAGE_ID;
            const stageName = deal.STAGE_NAME;
            const stageColor = deal.STAGE_COLOR;
            const value = parseFloat(deal.OPPORTUNITY || 0);

            if (!stageStats[stageId]) {
                stageStats[stageId] = {
                    stage_id: stageId,
                    stage_name: stageName,
                    stage_color: stageColor,
                    count: 0,
                    value: 0
                };
            }

            stageStats[stageId].count += 1;
            stageStats[stageId].value += value;
            totalValue += value;
        });

        const dealsByStage = Object.values(stageStats);

        return {
            total_deals: deals.length,
            total_value: totalValue,
            deals_by_stage: dealsByStage
        };
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
    DealsManager.switchView('period');

    const selectedUsers = getSelectedDealsUsers();
    const startDate = document.getElementById('dealsStartDate').value;
    const endDate = document.getElementById('dealsEndDate').value;

    try {
        // 🔥 ИСПОЛЬЗУЕМ УЖЕ ЗАГРУЖЕННЫХ ПОЛЬЗОВАТЕЛЕЙ ИЗ app.js
        const userInfoMap = {};
        if (window.allUsers && window.allUsers.length > 0) {
            window.allUsers.forEach(user => {
                userInfoMap[user.ID] = user;
            });
            console.log('✅ Using existing users cache:', Object.keys(userInfoMap).length);
        } else {
            // Если нет кэша, загружаем но КЭШИРУЕМ
            const allUsersResponse = await BitrixAPI.getAllUsers();
            if (allUsersResponse.users) {
                window.allUsers = allUsersResponse.users; // Сохраняем в глобальный кэш
                allUsersResponse.users.forEach(user => {
                    userInfoMap[user.ID] = user;
                });
                console.log('✅ Loaded and cached users:', Object.keys(userInfoMap).length);
            }
        }

        // Остальной код без изменений...
        const dealsResponse = await BitrixAPI.getDealsList(startDate, endDate, selectedUsers, 1000);

        if (dealsResponse.success) {
            DealsManager.currentDealsData = dealsResponse.deals;
            DealsManager.displayDealsTable(dealsResponse.deals, userInfoMap, true);

            const statsResponse = await BitrixAPI.getDealsStats(startDate, endDate, selectedUsers);
            if (statsResponse.success && statsResponse.stats) {
                DealsManager.updateSummaryCards(statsResponse.stats);
                DealsManager.updateCharts(statsResponse.stats);
            } else {
                const calculatedStats = DealsManager.calculateStatsFromDeals(dealsResponse.deals);
                DealsManager.updateSummaryCards(calculatedStats);
                DealsManager.updateCharts(calculatedStats);
            }

            showNotification(`✅ Загружено ${dealsResponse.count} сделок за период`, 'success');
        } else {
            throw new Error(dealsResponse.error || 'Unknown error from server');
        }

    } catch (error) {
        console.error('❌ Error loading deals:', error);
        showNotification('❌ Ошибка загрузки сделок: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// 🔥 НОВАЯ ФУНКЦИЯ: Загрузка ВСЕХ сделок сотрудников
async function loadUserAllDeals() {
    showLoading('Загрузка всех сделок сотрудников...');
    DealsManager.switchView('all');

    const selectedUsers = getSelectedDealsUsers();

    if (selectedUsers.length === 0) {
        showNotification('❌ Выберите хотя бы одного сотрудника', 'error');
        hideLoading();
        return;
    }

    try {
        // Загружаем список ВСЕХ пользователей для отображения имен
        const allUsersResponse = await BitrixAPI.getAllUsers();
        const userInfoMap = {};
        if (allUsersResponse.users) {
            allUsersResponse.users.forEach(user => {
                userInfoMap[user.ID] = user;
            });
        }

        // Загружаем ВСЕ сделки сотрудников
        const dealsResponse = await BitrixAPI.getUserAllDeals(selectedUsers);

        if (dealsResponse.success) {
            DealsManager.currentDealsData = dealsResponse.deals;
            DealsManager.displayDealsTable(dealsResponse.deals, userInfoMap, true);

            // 🔥 РАССЧИТЫВАЕМ СТАТИСТИКУ НА ФРОНТЕНДЕ для всех сделок
            const calculatedStats = DealsManager.calculateStatsFromDeals(dealsResponse.deals);
            DealsManager.updateSummaryCards(calculatedStats);
            DealsManager.updateCharts(calculatedStats);

            showNotification(`✅ Загружено ${dealsResponse.count} всех сделок сотрудников`, 'success');
        } else {
            throw new Error(dealsResponse.error || 'Unknown error from server');
        }

    } catch (error) {
        console.error('❌ Error loading all deals:', error);
        showNotification('❌ Ошибка загрузки всех сделок: ' + error.message, 'error');

        const tbody = document.getElementById('dealsBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;padding:40px;color:#f56565">
                        ❌ Ошибка загрузки данных<br>
                        <small>${error.message}</small><br>
                        <button onclick="loadUserAllDeals()" style="margin-top:15px">🔄 Попробовать снова</button>
                    </td>
                </tr>
            `;
        }
    } finally {
        hideLoading();
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
    if (tabName === 'deals') {
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

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function () {
    // Инициализируем вкладку сделок когда DOM готов
    setTimeout(() => {
        if (document.getElementById('deals-tab')) {
            DealsManager.initCharts();
        }
    }, 1000);
});