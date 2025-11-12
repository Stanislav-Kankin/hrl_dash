// deals.js - Функции для работы со сделками

class DealsManager {
    static charts = {};
    static currentDealsData = null;
    static currentPage = 1;
    static pageSize = 50;
    static totalPages = 1;
    static currentView = 'period';
    static currentUserInfoMap = null;

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
                        backgroundColor: [
                            '#4f46e5', '#7c3aed', '#a855f7', '#c026d3', '#db2777',
                            '#e11d48', '#ea580c', '#d97706', '#65a30d', '#16a34a',
                            '#059669', '#0d9488', '#0891b2', '#0284c7', '#2563eb',
                            '#1d4ed8', '#4338ca', '#6b21a8', '#86198f', '#9d174d'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'right'
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
                        label: 'Сумма сделок (руб)',
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
                            ticks: {
                                callback: function (value) {
                                    return value.toLocaleString('ru-RU') + ' ₽';
                                }
                            }
                        }
                    }
                }
            });
        }

        // График сравнения сотрудников по сделкам
        const comparisonCtx = document.getElementById('dealsComparisonChart')?.getContext('2d');
        if (comparisonCtx && !this.charts.comparison) {
            this.charts.comparison = new Chart(comparisonCtx, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Всего сделок',
                            data: [],
                            backgroundColor: 'rgba(54, 162, 235, 0.8)',
                            borderColor: 'rgba(54, 162, 235, 1)',
                            borderWidth: 1
                        },
                        {
                            label: 'В работе',
                            data: [],
                            backgroundColor: 'rgba(255, 159, 64, 0.8)',
                            borderColor: 'rgba(255, 159, 64, 1)',
                            borderWidth: 1
                        },
                        {
                            label: 'Успешные',
                            data: [],
                            backgroundColor: 'rgba(75, 192, 192, 0.8)',
                            borderColor: 'rgba(75, 192, 192, 1)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Сравнение сотрудников по сделкам'
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Сотрудники'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Количество сделок'
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

        // Обновляем круговую диаграмму
        if (this.charts.stages) {
            const stagesData = stats.deals_by_stage;
            this.charts.stages.data.labels = stagesData.map(stage => stage.stage_name);
            this.charts.stages.data.datasets[0].data = stagesData.map(stage => stage.count);
            this.charts.stages.update();
        }

        // Обновляем столбчатую диаграмму
        if (this.charts.value) {
            const stagesData = stats.deals_by_stage;
            this.charts.value.data.labels = stagesData.map(stage => stage.stage_name);
            this.charts.value.data.datasets[0].data = stagesData.map(stage => stage.value);
            this.charts.value.update();
        }

        // Также обновляем таблицу
        this.updateStagesTable(stats);
    }

    static updateComparisonChart(deals, userInfoMap) {
        if (!deals || !userInfoMap || !this.charts.comparison) {
            console.log('No data for comparison chart');
            return;
        }

        // Получаем выбранных пользователей из чекбоксов
        const selectedUserIds = getSelectedDealsUsers();
        console.log('Selected users for comparison:', selectedUserIds);

        // Группируем сделки по сотрудникам (только выбранным)
        const userDeals = {};
        selectedUserIds.forEach(userId => {
            userDeals[userId] = {
                total: 0,
                inProgress: 0,
                successful: 0,
                unsuccessful: 0,
                postponed: 0
            };
        });

        deals.forEach(deal => {
            const userId = deal.ASSIGNED_BY_ID;
            if (userDeals[userId]) {
                userDeals[userId].total++;

                // Определяем стадию
                const stageName = (deal.STAGE_NAME || '').toLowerCase();
                if (stageName.includes('выигр') || stageName.includes('успеш') || stageName.includes('заверш') || stageName.includes('продажа')) {
                    userDeals[userId].successful++;
                } else if (stageName.includes('проигр') || stageName.includes('отказ') || stageName.includes('нецелев') || stageName.includes('конкурент')) {
                    userDeals[userId].unsuccessful++;
                } else if (stageName.includes('отложен') || stageName.includes('недозвон')) {
                    userDeals[userId].postponed++;
                } else {
                    userDeals[userId].inProgress++;
                }
            }
        });

        // Сортируем по количеству сделок
        const sortedUsers = Object.entries(userDeals)
            .sort(([, a], [, b]) => b.total - a.total);

        const labels = sortedUsers.map(([userId]) => {
            const user = userInfoMap[userId];
            return user ? `${user.NAME} ${user.LAST_NAME}`.trim() : `ID: ${userId}`;
        });

        const totalData = sortedUsers.map(([, stats]) => stats.total);
        const inProgressData = sortedUsers.map(([, stats]) => stats.inProgress);
        const successfulData = sortedUsers.map(([, stats]) => stats.successful);
        const unsuccessfulData = sortedUsers.map(([, stats]) => stats.unsuccessful);
        const postponedData = sortedUsers.map(([, stats]) => stats.postponed);

        // Обновляем основной график сравнения
        this.charts.comparison.data.labels = labels;
        this.charts.comparison.data.datasets = [
            {
                label: 'Всего сделок',
                data: totalData,
                backgroundColor: 'rgba(54, 162, 235, 0.8)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            },
            {
                label: 'В работе',
                data: inProgressData,
                backgroundColor: 'rgba(255, 206, 86, 0.8)',
                borderColor: 'rgba(255, 206, 86, 1)',
                borderWidth: 1
            },
            {
                label: 'Успешные',
                data: successfulData,
                backgroundColor: 'rgba(75, 192, 192, 0.8)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            },
            {
                label: 'Неуспешные',
                data: unsuccessfulData,
                backgroundColor: 'rgba(255, 99, 132, 0.8)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1
            },
            {
                label: 'Отложенные',
                data: postponedData,
                backgroundColor: 'rgba(153, 102, 255, 0.8)',
                borderColor: 'rgba(153, 102, 255, 1)',
                borderWidth: 1
            }
        ];

        this.charts.comparison.update();

        // Показываем контейнер
        const comparisonContainer = document.getElementById('dealsComparisonChartContainer');
        if (comparisonContainer && sortedUsers.length > 1) {
            comparisonContainer.style.display = 'block';
        } else if (comparisonContainer) {
            comparisonContainer.style.display = 'none';
        }

        console.log('✅ Comparison chart updated with', sortedUsers.length, 'users');
    }

    static updateStagesTable(stats) {
        if (!stats || !stats.deals_by_stage) {
            console.log('No stats data for stages table:', stats);
            return;
        }

        const stagesData = stats.deals_by_stage;
        const totalValue = stats.total_value || 0;
        const totalDeals = stats.total_deals || 0;

        console.log('Updating stages table with:', stagesData);

        const tbody = document.getElementById('stagesTableBody');
        const footer = document.getElementById('stagesTableFooter');

        if (!tbody) {
            console.error('❌ stagesTableBody not found - check HTML structure');
            this.createStagesTableIfMissing();
            return;
        }

        // Сортируем стадии по убыванию суммы
        const sortedStages = stagesData.sort((a, b) => b.value - a.value);

        tbody.innerHTML = '';

        sortedStages.forEach(stage => {
            const percentage = totalValue > 0 ? ((stage.value / totalValue) * 100).toFixed(1) : 0;
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #e9ecef';
            row.style.transition = 'background-color 0.2s';

            row.onmouseenter = () => row.style.backgroundColor = '#f8f9fa';
            row.onmouseleave = () => row.style.backgroundColor = '';

            const stageColor = this.getEnhancedStageColor(stage.stage_name, stage.stage_color);

            row.innerHTML = `
            <td style="padding: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 16px; height: 16px; border-radius: 50%; background-color: ${stageColor}; border: 2px solid ${stageColor};"></div>
                    <span style="font-weight: 500;">${stage.stage_name || 'Неизвестная стадия'}</span>
                </div>
            </td>
            <td style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">${stage.count.toLocaleString()}</td>
            <td style="padding: 12px; text-align: right; font-weight: 600; color: #059669;">${stage.value.toLocaleString('ru-RU')} ₽</td>
            <td style="padding: 12px; text-align: center;">
                <span style="background: #e5e7eb; padding: 6px 12px; border-radius: 16px; font-size: 0.85em; font-weight: 600; color: #374151;">
                    ${percentage}%
                </span>
            </td>
        `;
            tbody.appendChild(row);
        });

        if (footer) {
            footer.style.display = 'table-footer-group';
            document.getElementById('totalDealsCount').textContent = totalDeals.toLocaleString();
            document.getElementById('totalDealsAmount').textContent = totalValue.toLocaleString('ru-RU') + ' ₽';
        }

        console.log('✅ Stages table updated with', sortedStages.length, 'stages');
    }

    static createStagesTableIfMissing() {
        const resultsSection = document.querySelector('.results-section');
        if (!resultsSection) {
            console.error('❌ results-section not found');
            return;
        }

        if (document.getElementById('stagesTableBody')) {
            return;
        }

        console.log('🛠️ Creating stages table dynamically...');

        const tableHTML = `
        <div class="table-container" style="margin-top: 20px;">
            <h3 style="padding: 20px 20px 0; margin: 0; color: #2c3e50;">📊 Статистика сделок по стадиям</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: linear-gradient(135deg, #667eea, #764ba2); color: white;">
                        <th style="padding: 15px; text-align: left; width: 40%;">Стадия сделки</th>
                        <th style="padding: 15px; text-align: center; width: 15%;">Количество</th>
                        <th style="padding: 15px; text-align: right; width: 25%;">Сумма</th>
                        <th style="padding: 15px; text-align: center; width: 20%;">Доля от общей суммы</th>
                    </tr>
                </thead>
                <tbody id="stagesTableBody">
                    <tr>
                        <td colspan="4" style="text-align: center; padding: 40px; color: #6c757d;">
                            Загрузка данных...
                        </td>
                    </tr>
                </tbody>
                <tfoot id="stagesTableFooter" style="display: none;">
                    <tr style="background: #f8f9fa; font-weight: bold; border-top: 2px solid #e9ecef;">
                        <td style="padding: 15px; text-align: left;">ИТОГО</td>
                        <td style="padding: 15px; text-align: center;" id="totalDealsCount">0</td>
                        <td style="padding: 15px; text-align: right;" id="totalDealsAmount">0 ₽</td>
                        <td style="padding: 15px; text-align: center;">100%</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;

        const summaryCards = resultsSection.querySelector('.summary-cards');
        if (summaryCards && summaryCards.nextSibling) {
            summaryCards.insertAdjacentHTML('afterend', tableHTML);
        } else {
            resultsSection.insertAdjacentHTML('beforeend', tableHTML);
        }

        console.log('✅ Stages table created dynamically');
    }

    static getEnhancedStageColor(stageName, originalColor) {
        if (!stageName) return originalColor || '#cccccc';

        const name = stageName.toLowerCase();

        if (name.includes('проигр') || name.includes('lost') || name.includes('отказ')) {
            if (name.includes('нереал') || name.includes('не реал')) return '#dc2626';
            if (name.includes('отмен')) return '#ef4444';
            return '#f87171';
        }

        if (name.includes('выигр') || name.includes('won') || name.includes('успеш') || name.includes('заверш')) {
            return '#059669';
        }

        if (name.includes('обработ') || name.includes('в работе') || name.includes('взято') ||
            name.includes('кп') || name.includes('коммерч') || name.includes('подготов') ||
            name.includes('negotiation') || name.includes('processing')) {
            return '#ea580c';
        }

        if (name.includes('нов') || name.includes('первич') || name.includes('инициир') ||
            name.includes('new') || name.includes('initial') || name.includes('lead')) {
            return '#2563eb';
        }

        if (name.includes('архив') || name.includes('не опред') || name.includes('unknown')) {
            return '#6b7280';
        }

        return originalColor || '#6366f1';
    }

    static updateSummaryCards(stats) {
        if (!stats) {
            console.log('No stats for summary cards');
            return;
        }

        console.log('Updating summary cards with:', stats);

        document.getElementById('totalDeals').textContent = stats.total_deals?.toLocaleString() || '0';
        document.getElementById('totalDealsValue').textContent = stats.total_value?.toLocaleString() + ' ₽' || '0 ₽';

        const inProgress = stats.deals_by_stage?.filter(stage =>
            !stage.stage_name.toLowerCase().includes('выигр') &&
            !stage.stage_name.toLowerCase().includes('проигр') &&
            !stage.stage_name.toLowerCase().includes('заверш')
        ).reduce((sum, stage) => sum + stage.count, 0) || 0;

        document.getElementById('dealsInProgress').textContent = inProgress.toLocaleString();

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

        console.log('Displaying deals table:', deals ? deals.length : 0, 'deals');
        console.log('Selected users in table:', Object.keys(userInfoMap).length);

        if (!deals || deals.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading">Нет данных о сделках</td></tr>';
            this.updatePagination(0);
            return;
        }

        this.currentDealsData = deals;
        this.currentUserInfoMap = userInfoMap;

        this.totalPages = Math.ceil(deals.length / this.pageSize);
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, deals.length);
        const pageDeals = deals.slice(startIndex, endIndex);

        tbody.innerHTML = '';

        // 🔥 ГРУППИРУЕМ СДЕЛКИ ПО СОТРУДНИКАМ ДЛЯ УДОБСТВА
        const dealsByUser = {};
        pageDeals.forEach(deal => {
            const userId = deal.ASSIGNED_BY_ID;
            if (!dealsByUser[userId]) {
                dealsByUser[userId] = [];
            }
            dealsByUser[userId].push(deal);
        });

        let rowIndex = startIndex;

        // 🔥 ПОКАЗЫВАЕМ СДЕЛКИ С ГРУППИРОВКОЙ ПО СОТРУДНИКАМ
        Object.entries(dealsByUser).forEach(([userId, userDeals]) => {
            const userInfo = userInfoMap[userId];
            const userName = userInfo ?
                `${userInfo.NAME || ''} ${userInfo.LAST_NAME || ''}`.trim() :
                `ID: ${userId}`;

            // 🔥 ЗАГОЛОВОК ГРУППЫ - СОТРУДНИК
            const groupHeader = document.createElement('tr');
            groupHeader.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
            groupHeader.style.color = 'white';
            groupHeader.innerHTML = `
            <td colspan="8" style="padding: 12px; font-weight: bold; font-size: 1.1em;">
                👤 ${userName} - ${userDeals.length} сделок
            </td>
        `;
            tbody.appendChild(groupHeader);

            // 🔥 СДЕЛКИ ЭТОГО СОТРУДНИКА
            userDeals.forEach((deal, userDealIndex) => {
                const row = document.createElement('tr');
                row.style.borderBottom = '1px solid #e9ecef';

                if (userDealIndex % 2 === 0) {
                    row.style.background = '#f8f9fa';
                }

                const globalIndex = rowIndex + 1;

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

                const stageColor = this.getEnhancedStageColor(deal.STAGE_NAME, deal.STAGE_COLOR);
                const stageBadge = `<span class="stage-badge" style="background-color: ${stageColor}">${deal.STAGE_NAME || 'Неизвестно'}</span>`;

                const amount = parseFloat(deal.OPPORTUNITY || 0).toLocaleString('ru-RU') + ' ₽';

                // Определяем статус сделки
                const stageName = (deal.STAGE_NAME || '').toLowerCase();
                let status = '';
                let statusColor = '';

                if (stageName.includes('выигр') || stageName.includes('успеш') || stageName.includes('заверш') || stageName.includes('продажа')) {
                    status = '✅ Успешная';
                    statusColor = '#059669';
                } else if (stageName.includes('проигр') || stageName.includes('отказ') || stageName.includes('нецелев') || stageName.includes('конкурент')) {
                    status = '❌ Неуспешная';
                    statusColor = '#dc2626';
                } else if (stageName.includes('отложен') || stageName.includes('недозвон')) {
                    status = '⏸️ Отложена';
                    statusColor = '#6b7280';
                } else {
                    status = '🟡 В работе';
                    statusColor = '#d97706';
                }

                row.innerHTML = `
                <td style="padding: 10px;">
                    <div style="font-weight: 600; margin-bottom: 4px;">
                        ${deal.TITLE || 'Без названия'}
                    </div>
                    <div style="font-size: 0.8em; color: #6b7280;">
                        ID: ${deal.ID} | #${globalIndex}
                    </div>
                </td>
                <td style="padding: 10px;">
                    <div style="font-weight: 600; color: #667eea;">${userName}</div>
                    <div style="font-size: 0.8em; color: #6b7280;">
                        ID: ${userId}
                    </div>
                </td>
                <td style="padding: 10px;">${stageBadge}</td>
                <td style="padding: 10px; text-align: right; font-weight: 600;">${amount}</td>
                <td style="padding: 10px;">${createdDate}</td>
                <td style="padding: 10px;">${modifiedDate}</td>
                <td style="padding: 10px;">
                    <div style="font-size: 0.9em;">
                        <div>${createdDate}</div>
                        <div style="font-size: 0.8em; color: #6b7280;">
                            создана
                        </div>
                    </div>
                </td>
                <td style="padding: 10px; color: ${statusColor}; font-weight: 600;">${status}</td>
            `;
                tbody.appendChild(row);
                rowIndex++;
            });

            // 🔥 РАЗДЕЛИТЕЛЬ МЕЖДУ ГРУППАМИ
            const separator = document.createElement('tr');
            separator.innerHTML = '<td colspan="8" style="padding: 8px; background: #e9ecef;"></td>';
            tbody.appendChild(separator);
        });

        if (showPagination) {
            this.updatePagination(deals.length, this.totalPages);
        }

        // Обновляем график сравнения
        this.updateComparisonChart(deals, userInfoMap);

        console.log('✅ Deals table updated with grouped display');
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

        let largeDatasetWarning = '';
        if (totalDeals > 1000) {
            largeDatasetWarning = `
                <div style="color: #f59e0b; font-size: 12px; margin-top: 5px;">
                    ⚠️ Большой набор данных. Рекомендуется использовать фильтры по дате.
                </div>
            `;
        }

        paginationContainer.innerHTML = `
            <div class="pagination-info">
                Показано ${startIndex}-${endIndex} из ${totalDeals.toLocaleString()} сделок
                ${largeDatasetWarning}
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
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.displayCurrentPage();
        }
    }

    static previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.displayCurrentPage();
        }
    }

    static displayCurrentPage() {
        if (this.currentDealsData && this.currentUserInfoMap) {
            this.displayDealsTable(this.currentDealsData, this.currentUserInfoMap, true);
            console.log(`🔄 Displaying page ${this.currentPage} of ${this.totalPages}`);
        } else {
            console.error('❌ No data available for pagination');
        }
    }

    static switchView(viewType) {
        this.currentView = viewType;
        this.currentPage = 1;
        console.log(`🔄 Switched to view: ${viewType}, page reset to 1`);
    }

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

async function testDealsConnection() {
    showLoading('Тестирование подключения к сделкам...');

    try {
        const selectedUsers = getSelectedDealsUsers();
        const startDate = document.getElementById('dealsStartDate').value;
        const endDate = document.getElementById('dealsEndDate').value;

        console.log('🧪 Testing deals connection...');

        const testResult = await BitrixAPI.debugDealsDetailed(startDate, endDate, selectedUsers);
        console.log('🧪 Test result:', testResult);

        if (testResult.success) {
            let message = `✅ Тест пройден!\n\n`;
            message += `Сервис: ${testResult.service_status.service_exists ? 'OK' : 'ERROR'}\n`;
            message += `Webhook: ${testResult.service_status.webhook_configured ? 'OK' : 'ERROR'}\n`;
            message += `Найдено сделок: ${testResult.deals_count}\n`;
            message += `Найдено стадий: ${testResult.stages_count}\n`;
            message += `Статистика: ${testResult.stats_available ? 'OK' : 'ERROR'}\n`;

            if (testResult.sample_deals && testResult.sample_deals.length > 0) {
                message += `\nПример сделки: "${testResult.sample_deals[0].TITLE}"`;
            }

            alert(message);
        } else {
            alert(`❌ Тест не пройден: ${testResult.error}\nТип ошибки: ${testResult.error_type}`);
        }
    } catch (error) {
        console.error('❌ Test error:', error);
        alert(`❌ Ошибка тестирования: ${error.message}`);
    } finally {
        hideLoading();
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

async function loadDealsData() {
    showLoading('Загрузка данных о сделках...');
    DealsManager.switchView('period');
    DealsManager.currentPage = 1;

    const selectedUsers = getSelectedDealsUsers();
    const startDate = document.getElementById('dealsStartDate').value;
    const endDate = document.getElementById('dealsEndDate').value;

    try {
        console.log('🔍 Starting deals load:', { selectedUsers, startDate, endDate });

        const testResponse = await BitrixAPI.debugTestDeals(startDate, endDate, selectedUsers);
        console.log('🔧 Test response:', testResponse);

        if (!testResponse.success) {
            throw new Error('Тест не пройден: ' + testResponse.error);
        }

        const userInfoMap = {};
        let allUsersResponse;

        try {
            allUsersResponse = await BitrixAPI.getAllUsers();
            if (allUsersResponse.users) {
                window.allUsers = allUsersResponse.users;
                allUsersResponse.users.forEach(user => {
                    userInfoMap[user.ID] = user;
                });
                console.log('✅ Loaded users:', Object.keys(userInfoMap).length);
            }
        } catch (userError) {
            console.warn('⚠️ Could not load users, using fallback');
            const presalesResponse = await BitrixAPI.getUsersList();
            if (presalesResponse.users) {
                presalesResponse.users.forEach(user => {
                    userInfoMap[user.ID] = user;
                });
            }
        }

        console.log('📊 Loading deals...');
        const dealsResponse = await BitrixAPI.getDealsList(startDate, endDate, selectedUsers, 500);

        console.log('📊 Deals response:', dealsResponse);

        if (dealsResponse.success && dealsResponse.deals) {
            DealsManager.currentDealsData = dealsResponse.deals;
            DealsManager.displayDealsTable(dealsResponse.deals, userInfoMap, true);

            try {
                const statsResponse = await BitrixAPI.getEnhancedDealsStats(startDate, endDate, selectedUsers);
                if (statsResponse.success && statsResponse.stats) {
                    DealsManager.updateSummaryCards(statsResponse.stats);
                    DealsManager.updateCharts(statsResponse.stats);
                } else {
                    const calculatedStats = DealsManager.calculateStatsFromDeals(dealsResponse.deals);
                    DealsManager.updateSummaryCards(calculatedStats);
                    DealsManager.updateCharts(calculatedStats);
                }
            } catch (statsError) {
                console.warn('⚠️ Stats error, using frontend calculation:', statsError);
                const calculatedStats = DealsManager.calculateStatsFromDeals(dealsResponse.deals);
                DealsManager.updateSummaryCards(calculatedStats);
                DealsManager.updateCharts(calculatedStats);
            }

            showNotification(`✅ Загружено ${dealsResponse.count} сделок за период`, 'success');
        } else {
            throw new Error(dealsResponse.error || 'Не удалось загрузить сделки');
        }

    } catch (error) {
        console.error('❌ Error loading deals:', error);

        let errorMessage = error.message;
        if (error.message.includes('Failed to fetch')) {
            errorMessage = 'Проблема с подключением к серверу';
        } else if (error.message.includes('401')) {
            errorMessage = 'Требуется авторизация';
        }

        showNotification('❌ Ошибка загрузки сделок: ' + errorMessage, 'error');

        const tbody = document.getElementById('dealsBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:40px;color:#f56565">
                        ❌ Ошибка загрузки данных<br>
                        <small>${errorMessage}</small><br>
                        <button onclick="loadDealsData()" style="margin-top:15px">🔄 Попробовать снова</button>
                    </td>
                </tr>
            `;
        }
    } finally {
        hideLoading();
    }
}

async function loadUserAllDeals() {
    const selectedUsers = getSelectedDealsUsers();

    if (selectedUsers.length === 0) {
        showNotification('❌ Выберите хотя бы одного сотрудника', 'error');
        return;
    }

    if (!confirm(`⚠️ Вы запрашиваете ВСЕ сделки выбранных сотрудников. Это может занять несколько минут и загрузить тысячи сделок. Продолжить?`)) {
        return;
    }

    showLoading('Подготовка к загрузке всех сделок...');

    DealsManager.switchView('all');

    try {
        console.log('👥 Loading ALL deals for users:', selectedUsers);

        const allUsersResponse = await BitrixAPI.getAllUsers();
        const userInfoMap = {};
        if (allUsersResponse.users) {
            allUsersResponse.users.forEach(user => {
                userInfoMap[user.ID] = user;
            });
        }

        const dealsResponse = await BitrixAPI.getUserAllDeals(selectedUsers);

        console.log('👥 All deals response:', dealsResponse);

        if (dealsResponse.success && dealsResponse.deals) {
            DealsManager.currentDealsData = dealsResponse.deals;
            DealsManager.displayDealsTable(dealsResponse.deals, userInfoMap, true);

            const calculatedStats = DealsManager.calculateStatsFromDeals(dealsResponse.deals);
            DealsManager.updateSummaryCards(calculatedStats);
            DealsManager.updateCharts(calculatedStats);

            showNotification(`✅ Загружено ${dealsResponse.count} всех сделок сотрудников`, 'success');
        } else {
            throw new Error(dealsResponse.error || 'Не удалось загрузить сделки');
        }

    } catch (error) {
        console.error('❌ Error loading all deals:', error);
        showNotification('❌ Ошибка загрузки всех сделок: ' + error.message, 'error');

        const tbody = document.getElementById('dealsBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:40px;color:#f56565">
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
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });

    document.getElementById(`${tabName}-tab`).classList.add('active');
    event.target.classList.add('active');

    if (tabName === 'deals') {
        DealsManager.initCharts();

        const today = new Date();
        const startDate = new Date(today);
        startDate.setMonth(today.getMonth() - 1);

        document.getElementById('dealsStartDate').value = startDate.toISOString().split('T')[0];
        document.getElementById('dealsEndDate').value = today.toISOString().split('T')[0];
    }
}

async function loadAnalyticsData() {
    showNotification('📊 Раздел аналитики в разработке', 'info');
}

document.addEventListener('DOMContentLoaded', function () {
    console.log('🔄 DealsManager initializing...');

    setTimeout(() => {
        if (!document.getElementById('stagesTableBody')) {
            DealsManager.createStagesTableIfMissing();
        }
    }, 1000);
});