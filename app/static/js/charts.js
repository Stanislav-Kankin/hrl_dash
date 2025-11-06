// charts.js - Функции для построения графиков
class ActivityCharts {
    static charts = {};

    static initCharts() {
        // Инициализируем все canvas элементы для графиков
        this.charts.weekActivity = this.createWeekActivityChart();
        this.charts.hourActivity = this.createHourActivityChart();
        this.charts.typeDistribution = this.createTypeDistributionChart();
        this.charts.dailyActivity = this.createDailyActivityChart();
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
        const workHours = Array.from({length: 14}, (_, i) => {
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
                            title: function(context) {
                                return `Время: ${context[0].label}`;
                            },
                            label: function(context) {
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

    static createDailyActivityChart() {
        const ctx = document.getElementById('dailyActivityChart').getContext('2d');
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Активности по дням',
                    data: [],
                    backgroundColor: 'rgba(102, 126, 234, 0.2)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: 'rgba(102, 126, 234, 1)',
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
                            label: function(context) {
                                return `Активностей: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Даты'
                        }
                    },
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

        // Обновляем график по дням
        if (this.charts.dailyActivity && statistics.daily_stats) {
            const dailyLabels = statistics.daily_stats.map(day => {
                const date = new Date(day.date);
                return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            });
            const dailyData = statistics.daily_stats.map(day => day.total);
            
            console.log('Daily labels:', dailyLabels);
            console.log('Daily data:', dailyData);
            
            this.charts.dailyActivity.data.labels = dailyLabels;
            this.charts.dailyActivity.data.datasets[0].data = dailyData;
            this.charts.dailyActivity.update();
        }
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