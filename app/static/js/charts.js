// charts.js - Функции для построения графиков
class ActivityCharts {
    static charts = {};

    static initCharts() {
        if (Object.keys(this.charts).length > 0) {
            console.log('📊 Charts already initialized, skipping re-initialization');
            return;
        }

        console.log('📊 Initializing charts for the first time...');

        // Инициализируем все canvas элементы для графиков
        this.charts.weekActivity = this.createWeekActivityChart();
        this.charts.hourActivity = this.createHourActivityChart();
        this.charts.typeDistribution = this.createTypeDistributionChart();
        this.charts.comparison = this.createComparisonChart();

        console.log('✅ All charts initialized successfully');
    }

    static createWeekActivityChart() {
        const ctx = document.getElementById('weekActivityChart').getContext('2d');
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
                datasets: [{
                    label: 'Активности',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    backgroundColor: 'rgba(102, 126, 234, 0.8)',
                    borderColor: 'rgba(102, 126, 234, 1)',
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
                        text: 'Активность по дням недели'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Количество активностей'
                        }
                    }
                }
            }
        });
    }

    static createHourActivityChart() {
        const ctx = document.getElementById('hourActivityChart').getContext('2d');

        // Только рабочие часы с 06:00 до 19:00
        const workHours = Array.from({ length: 14 }, (_, i) => {
            const hour = i + 6; // Начинаем с 6 утра
            return `${hour.toString().padStart(2, '0')}:00`;
        });

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: workHours,
                datasets: [{
                    label: 'Активности',
                    data: new Array(14).fill(0),
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: 'rgba(255, 99, 132, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            title: function (context) {
                                return `Время: ${context[0].label}`;
                            },
                            label: function (context) {
                                return `Активностей: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Часы рабочего дня'
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Количество активностей'
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }

    static createTypeDistributionChart() {
        const ctx = document.getElementById('typeDistributionChart').getContext('2d');
        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Звонки', 'Комментарии', 'Задачи', 'Встречи', 'Другие'],
                datasets: [{
                    data: [0, 0, 0, 0, 0],
                    backgroundColor: [
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(255, 206, 86, 0.8)',
                        'rgba(255, 99, 132, 0.8)',
                        'rgba(153, 102, 255, 0.8)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    static createComparisonChart() {
        const ctx = document.getElementById('comparisonChart').getContext('2d');
        console.log('📊 Creating comparison chart...');
        
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Звонки',
                        data: [],
                        backgroundColor: 'rgba(54, 162, 235, 0.8)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Комментарии',
                        data: [],
                        backgroundColor: 'rgba(75, 192, 192, 0.8)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Задачи',
                        data: [],
                        backgroundColor: 'rgba(255, 206, 86, 0.8)',
                        borderColor: 'rgba(255, 206, 86, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Встречи',
                        data: [],
                        backgroundColor: 'rgba(255, 99, 132, 0.8)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Сравнение активности сотрудников'
                    },
                    legend: {
                        position: 'top',
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
                            text: 'Количество активностей'
                        },
                        stacked: false
                    }
                }
            }
        });
    }

    static updateAllCharts(statistics) {
        if (!statistics) {
            console.log('No statistics provided for charts');
            return;
        }

        console.log('Updating charts with statistics:', statistics);

        // Обновляем график по дням недели
        if (this.charts.weekActivity) {
            const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const weekData = weekDays.map(day => statistics.weekday_stats?.[day] || 0);

            console.log('Week data:', weekData);

            this.charts.weekActivity.data.datasets[0].data = weekData;
            this.charts.weekActivity.update();
        }

        // Обновляем график по часам (только рабочие часы 06:00-19:00)
        if (this.charts.hourActivity && statistics.hourly_stats) {
            // Создаем массив данных только для рабочих часов (6-19)
            const workHourData = [];
            for (let i = 6; i <= 19; i++) {
                const hourKey = i.toString().padStart(2, '0');
                workHourData.push(statistics.hourly_stats[hourKey] || 0);
            }

            console.log('Work hour data (06:00-19:00):', workHourData);

            this.charts.hourActivity.data.datasets[0].data = workHourData;
            this.charts.hourActivity.update();
        }

        // Обновляем круговую диаграмму типов
        if (this.charts.typeDistribution) {
            const typeData = [
                statistics.type_stats?.['2'] || 0, // Звонки
                statistics.type_stats?.['6'] || 0, // Комментарии
                statistics.type_stats?.['4'] || 0, // Задачи
                statistics.type_stats?.['1'] || 0, // Встречи
                (statistics.total_activities || 0) -
                ((statistics.type_stats?.['2'] || 0) +
                    (statistics.type_stats?.['6'] || 0) +
                    (statistics.type_stats?.['4'] || 0) +
                    (statistics.type_stats?.['1'] || 0)) // Другие
            ];

            console.log('Type data:', typeData);

            this.charts.typeDistribution.data.datasets[0].data = typeData;
            this.charts.typeDistribution.update();
        }
    }

    static updateComparisonChart(userStats) {
        console.log('🔄 updateComparisonChart called with:', userStats);
        
        if (!this.charts.comparison) {
            console.log('❌ Comparison chart not initialized');
            return;
        }

        const chartContainer = document.getElementById('comparisonChartContainer');
        
        if (!userStats || userStats.length <= 1) {
            // Скрываем график если выбран только один сотрудник
            if (chartContainer) {
                chartContainer.style.display = 'none';
                console.log('📊 Comparison chart hidden (only 1 user or no users)');
            }
            return;
        }

        const labels = userStats.map(user => user.user_name);
        const callsData = userStats.map(user => user.calls || 0);
        const commentsData = userStats.map(user => user.comments || 0);
        const tasksData = userStats.map(user => user.tasks || 0);
        const meetingsData = userStats.map(user => user.meetings || 0);

        console.log('📊 Comparison data:', {
            labels,
            callsData,
            commentsData,
            tasksData,
            meetingsData
        });

        this.charts.comparison.data.labels = labels;
        this.charts.comparison.data.datasets[0].data = callsData;
        this.charts.comparison.data.datasets[1].data = commentsData;
        this.charts.comparison.data.datasets[2].data = tasksData;
        this.charts.comparison.data.datasets[3].data = meetingsData;
        
        this.charts.comparison.update();

        // Показываем контейнер
        if (chartContainer) {
            chartContainer.style.display = 'block';
            console.log('📊 Comparison chart container shown');
        }

        console.log('✅ Comparison chart updated with', userStats.length, 'users');
    }

    static destroyCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart) {
                chart.destroy();
            }
        });
        this.charts = {};
    }
}