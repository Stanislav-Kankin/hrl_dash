from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from datetime import datetime
from app.services.bitrix_service import BitrixService
from dotenv import load_dotenv
from typing import List, Optional
import os

app = FastAPI(title="Bitrix24 Analytics", version="1.0")
load_dotenv()
bitrix_service = BitrixService()


# Простая HTML страница для дашборда
html_template = """
<!DOCTYPE html>
<html>
<head>
    <title>Bitrix24 Analytics</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            background: #f5f5f5;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            background: white; 
            padding: 20px; 
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .card { 
            background: #fff; 
            padding: 20px; 
            margin: 10px 0; 
            border-radius: 8px;
            border-left: 4px solid #007bff;
        }
        button { 
            background: #007bff; 
            color: white; 
            border: none; 
            padding: 10px 20px; 
            border-radius: 5px; 
            cursor: pointer;
            margin: 5px;
        }
        button:hover { background: #0056b3; }
        button.active { 
            background: #0056b3; 
            font-weight: bold;
        }
        .stats { display: flex; flex-wrap: wrap; gap: 20px; }
        .stat-item { 
            flex: 1; 
            min-width: 200px; 
            text-align: center;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        .error { color: red; }
        .success { color: green; }
        .filters { 
            background: #f8f9fa; 
            padding: 15px; 
            border-radius: 8px; 
            margin: 10px 0;
        }
        .filter-group { 
            margin: 10px 0; 
            display: flex; 
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
        }
        .filter-group label { 
            font-weight: bold; 
            min-width: 120px;
        }
        select, input { 
            padding: 8px; 
            border: 1px solid #ddd; 
            border-radius: 4px;
            min-width: 200px;
        }
        .user-list { 
            max-height: 150px; 
            overflow-y: auto; 
            border: 1px solid #ddd;
            padding: 10px;
            background: white;
        }
        .user-item { 
            margin: 5px 0; 
            padding: 5px;
            cursor: pointer;
        }
        .user-item:hover { 
            background: #e9ecef;
        }
        .user-item.selected { 
            background: #007bff; 
            color: white;
        }
        .quick-buttons { 
            display: flex; 
            gap: 10px; 
            margin: 10px 0;
        }
        .call-item { 
            border: 1px solid #e9ecef; 
            padding: 10px; 
            margin: 5px 0; 
            border-radius: 5px;
        }
        .call-success { border-left: 4px solid #28a745; }
        .call-failed { border-left: 4px solid #dc3545; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Bitrix24 Analytics Dashboard</h1>
        <p>Дашборд для анализа активности сотрудников</p>
        
        <!-- Фильтры -->
        <div class="card">
            <h3>🔍 Фильтры анализа</h3>
            <div class="filters">
                <div class="filter-group">
                    <label>Сотрудники:</label>
                    <select id="userSelect" multiple onchange="updateSelectedUsers()">
                        <option value="">Загрузка сотрудников...</option>
                    </select>
                    <div>
                        <button onclick="selectAllUsers()">Выбрать всех</button>
                        <button onclick="clearUsers()">Очистить</button>
                    </div>
                </div>
                
                <div class="filter-group">
                    <label>Период:</label>
                    <select id="daysSelect">
                        <option value="7">7 дней</option>
                        <option value="30" selected>30 дней</option>
                        <option value="90">90 дней</option>
                        <option value="180">180 дней</option>
                    </select>
                </div>
                
                <div class="filter-group">
                    <label>Тип звонков:</label>
                    <select id="callTypeSelect">
                        <option value="all">Все звонки</option>
                        <option value="successful" selected>Только успешные</option>
                        <option value="failed">Только неудачные</option>
                    </select>
                </div>
                
                <div class="quick-buttons">
                    <button onclick="applyFilters('calls')">📞 Применить к звонкам</button>
                    <button onclick="applyFilters('tasks')">✅ Применить к задачам</button>
                    <button onclick="applyFilters('comments')">💬 Применить к комментариям</button>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h3>Быстрые действия</h3>
            <button onclick="loadData('calls')">📞 Все звонки</button>
            <button onclick="loadData('tasks')">✅ Все задачи</button>
            <button onclick="loadData('comments')">💬 Все комментарии</button>
            <button onclick="loadData('users')">👥 Все сотрудники</button>
            <button onclick="loadData('connection-test')">🔗 Тест подключения</button>
        </div>
        
        <div class="card">
            <h3>Результаты</h3>
            <div id="results">
                <p>Настройте фильтры и нажмите кнопку выше для загрузки данных...</p>
            </div>
        </div>
        
        <div class="card">
            <h3>Статистика</h3>
            <div class="stats" id="stats">
                <!-- Статистика будет здесь -->
            </div>
        </div>
    </div>

    <script>
    let allUsers = [];
    
    // Загрузка списка сотрудников при старте
    async function loadUsers() {
        try {
            const response = await fetch('/api/users-list');
            const data = await response.json();
            
            if (data.users) {
                allUsers = data.users;
                updateUserSelect();
            }
        } catch (error) {
            console.error('Ошибка загрузки сотрудников:', error);
        }
    }
    
    function updateUserSelect() {
        const select = document.getElementById('userSelect');
        select.innerHTML = '';
        
        allUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.ID;
            option.textContent = `${user.NAME} ${user.LAST_NAME} (${user.WORK_POSITION || 'Без должности'})`;
            select.appendChild(option);
        });
    }
    
    function updateSelectedUsers() {
        // Автоматическое обновление при выборе пользователей
        const selectedUsers = Array.from(document.getElementById('userSelect').selectedOptions)
            .map(option => option.value)
            .filter(id => id !== '');
        
        // Сохраняем выбранных пользователей для использования в фильтрах
        window.selectedUserIds = selectedUsers;
    }
    
    function selectAllUsers() {
        const select = document.getElementById('userSelect');
        Array.from(select.options).forEach(option => {
            option.selected = true;
        });
        updateSelectedUsers();
    }
    
    function clearUsers() {
        const select = document.getElementById('userSelect');
        Array.from(select.options).forEach(option => {
            option.selected = false;
        });
        updateSelectedUsers();
    }
    
    async function applyFilters(dataType) {
        const days = document.getElementById('daysSelect').value;
        const callType = document.getElementById('callTypeSelect').value;
        const onlySuccessful = callType !== 'failed';
        const showAll = callType === 'all';
        
        let url = '';
        const params = new URLSearchParams({
            days: days,
            only_successful: onlySuccessful.toString()
        });
        
        if (window.selectedUserIds && window.selectedUserIds.length > 0) {
            params.append('user_ids', window.selectedUserIds.join(','));
        }
        
        switch(dataType) {
            case 'calls':
                url = `/api/calls-filtered?${params}`;
                break;
            case 'tasks':
                url = `/api/tasks-filtered?${params}`;
                break;
            case 'comments':
                url = `/api/comments-filtered?${params}`;
                break;
        }
        
        document.getElementById('results').innerHTML = '<p>Загрузка данных с фильтрами...</p>';
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            // Красивое отображение данных с фильтрами
            displayFilteredData(data, dataType);
            
        } catch (error) {
            document.getElementById('results').innerHTML = 
                `<p style="color: red;">Ошибка: ${error}</p>`;
        }
    }
    
    function displayFilteredData(data, dataType) {
        let html = `<h4>Результаты с фильтрами:</h4>`;
        
        if (data.filters) {
            html += `<div style="background: #e9ecef; padding: 10px; border-radius: 5px; margin: 10px 0;">
                <strong>Примененные фильтры:</strong><br>
                • Период: ${data.filters.days} дней<br>
                • Тип звонков: ${data.filters.only_successful ? 'Только успешные' : 'Все'}<br>
                • Сотрудники: ${data.filters.user_ids ? data.filters.user_ids.length + ' выбрано' : 'Все'}
            </div>`;
        }
        
        if (data.error) {
            html += `<p style="color: red;">Ошибка: ${data.error}</p>`;
        } else {
            html += `<p><strong>${data.message}</strong></p>`;
            
            if (dataType === 'calls' && data.calls_data) {
                html += `<div style="max-height: 400px; overflow-y: auto;">`;
                data.calls_data.forEach(call => {
                    const isSuccess = parseInt(call.CALL_DURATION) > 0;
                    const callClass = isSuccess ? 'call-success' : 'call-failed';
                    html += `
                        <div class="call-item ${callClass}">
                            <strong>${call.USER_NAME || 'Неизвестный'}</strong> 
                            (${call.USER_POSITION || 'Без должности'})<br>
                            📞 ${call.PHONE_NUMBER} | 
                            ⏱️ ${call.CALL_DURATION} сек | 
                            📅 ${new Date(call.CALL_START_DATE).toLocaleString()}<br>
                            <small>Статус: ${call.CALL_FAILED_REASON}</small>
                        </div>
                    `;
                });
                html += `</div>`;
            }
        }
        
        document.getElementById('results').innerHTML = html;
        updateStats(data);
    }
    
    async function loadData(type) {
        document.getElementById('results').innerHTML = '<p>Загрузка данных...</p>';
        
        try {
            let response = await fetch('/api/' + type);
            let data = await response.json();
            
            // Простое отображение данных
            document.getElementById('results').innerHTML = 
                '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
            
            // Обновляем статистику
            updateStats(data);
            
        } catch (error) {
            document.getElementById('results').innerHTML = 
                '<p style="color: red;">Ошибка: ' + error + '</p>';
        }
    }
    
    function updateStats(data) {
        let statsHtml = '';
        
        if (data.total_calls) {
            statsHtml += `<div class="stat-item">
                <h3>📞</h3>
                <h2>${data.total_calls}</h2>
                <p>Всего звонков</p>
            </div>`;
        }
        
        if (data.total_comments) {
            statsHtml += `<div class="stat-item">
                <h3>💬</h3>
                <h2>${data.total_comments}</h2>
                <p>Комментариев</p>
            </div>`;
        }
        
        if (data.active_users) {
            statsHtml += `<div class="stat-item">
                <h3>👥</h3>
                <h2>${data.active_users}</h2>
                <p>Активных пользователей</p>
            </div>`;
        }

        if (data.connected !== undefined) {
            const statusClass = data.connected ? 'success' : 'error';
            const statusText = data.connected ? 'Подключено' : 'Ошибка';
            statsHtml += `<div class="stat-item ${statusClass}">
                <h3>🔗</h3>
                <h2>${statusText}</h2>
                <p>Статус Bitrix24</p>
            </div>`;
        }
        
        document.getElementById('stats').innerHTML = statsHtml;
    }

    // Загружаем сотрудников и тест подключения при загрузке страницы
    window.addEventListener('load', function() {
        loadUsers();
        loadData('connection-test');
    });
    </script>
</body>
</html>
"""


@app.get("/", response_class=HTMLResponse)
async def read_root():
    return html_template

@app.get("/api/users-list")
async def get_users_list():
    """Список сотрудников для фильтров"""
    try:
        users = await bitrix_service.get_users(only_active=True)
        
        if users is None:
            return {"users": []}
        
        # Форматируем для фронтенда
        formatted_users = []
        for user in users:
            if user.get('ACTIVE') and user.get('EMAIL'):
                formatted_users.append({
                    "ID": user['ID'],
                    "NAME": user.get('NAME', ''),
                    "LAST_NAME": user.get('LAST_NAME', ''),
                    "WORK_POSITION": user.get('WORK_POSITION', ''),
                    "EMAIL": user.get('EMAIL', '')
                })
        
        return {"users": formatted_users}
        
    except Exception as e:
        return {"users": [], "error": str(e)}

@app.get("/api/calls-filtered")
async def get_calls_filtered(
    user_ids: Optional[str] = None,
    days: int = 30,
    only_successful: bool = True
):
    """Получить звонки с фильтрами"""
    try:
        user_ids_list = user_ids.split(',') if user_ids else None
        
        calls = await bitrix_service.get_calls(days=days)
        
        if calls is None:
            return {"error": "Не удалось получить звонки"}
        
        # Применяем фильтры
        filtered_calls = calls
        
        if only_successful:
            filtered_calls = [
                call for call in filtered_calls 
                if int(call.get('CALL_DURATION', 0)) > 0
            ]
        
        if user_ids_list:
            filtered_calls = [
                call for call in filtered_calls 
                if call.get('PORTAL_USER_ID') in user_ids_list
            ]
        
        # Получаем пользователей для отображения имен
        users = await bitrix_service.get_users(only_active=True)
        user_map = {user['ID']: user for user in users}
        
        # Добавляем имена пользователей к звонкам
        calls_with_names = []
        for call in filtered_calls[:50]:  # Увеличили лимит
            user_info = user_map.get(call.get('PORTAL_USER_ID'), {})
            call_with_name = call.copy()
            call_with_name['USER_NAME'] = f"{user_info.get('NAME', '')} {user_info.get('LAST_NAME', '')}".strip()
            call_with_name['USER_POSITION'] = user_info.get('WORK_POSITION', '')
            calls_with_names.append(call_with_name)
        
        return {
            "total_calls": len(filtered_calls),
            "filtered_calls": len(filtered_calls),
            "calls_data": calls_with_names,
            "filters": {
                "user_ids": user_ids_list,
                "days": days,
                "only_successful": only_successful
            },
            "message": f"Найдено {len(filtered_calls)} звонков за {days} дней"
        }
        
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/tasks-filtered")
async def get_tasks_filtered(
    user_ids: Optional[str] = None,
    days: int = 30
):
    """Получить задачи с фильтрами"""
    try:
        # Здесь можно добавить фильтрацию по пользователям для задач
        tasks = await bitrix_service.get_tasks(days=days)
        
        if tasks is None:
            return {"error": "Не удалось получить задачи"}
        
        return {
            "total_tasks": len(tasks),
            "tasks_data": tasks[:20],
            "filters": {
                "user_ids": user_ids.split(',') if user_ids else None,
                "days": days
            },
            "message": f"Найдено {len(tasks)} задач за {days} дней"
        }
        
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/comments-filtered")
async def get_comments_filtered(
    user_ids: Optional[str] = None,
    days: int = 30
):
    """Получить комментарии с фильтрами"""
    try:
        comments = await bitrix_service.get_timeline_comments(days=days)
        
        if comments is None:
            return {"error": "Не удалось получить комментарии"}
        
        return {
            "total_comments": len(comments),
            "comments_data": comments[:20],
            "filters": {
                "user_ids": user_ids.split(',') if user_ids else None,
                "days": days
            },
            "message": f"Найдено {len(comments)} комментариев за {days} дней"
        }
        
    except Exception as e:
        return {"error": str(e)}

# Остальные endpoints остаются без изменений
@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0"
    }

@app.get("/api/calls")
async def get_calls():
    try:
        calls = await bitrix_service.get_calls(days=7)
        
        if calls is None:
            return {
                "error": "Недостаточно прав для доступа к звонкам",
                "setup_required": True,
                "total_calls": 0
            }
        
        return {
            "total_calls": len(calls),
            "calls_data": calls[:10],
            "message": f"Найдено {len(calls)} звонков за 7 дней" if calls else "Нет данных о звонках"
        }
        
    except Exception as e:
        return {"error": str(e), "total_calls": 0}

@app.get("/api/comments")
async def get_comments():
    try:
        comments = await bitrix_service.get_timeline_comments(days=7)
        
        if comments is None:
            return {
                "error": "Не удалось получить комментарии",
                "total_comments": 0
            }
        
        return {
            "total_comments": len(comments),
            "comments_data": comments[:10],
            "message": f"Найдено {len(comments)} комментариев за 7 дней"
        }
        
    except Exception as e:
        return {"error": str(e), "total_comments": 0}

@app.get("/api/users")
async def get_users():
    try:
        users = await bitrix_service.get_users(only_active=True)
        
        if users is None:
            return {
                "error": "Не удалось получить пользователей",
                "active_users": 0,
                "total_users": 0
            }
        
        active_employees = [
            user for user in users 
            if user.get('ACTIVE') and user.get('EMAIL')
        ]
        
        return {
            "active_users": len(active_employees),
            "total_users": len(users),
            "users": active_employees[:10],
            "message": f"Активных сотрудников: {len(active_employees)} из {len(users)} пользователей"
        }
        
    except Exception as e:
        return {"error": str(e), "active_users": 0, "total_users": 0}

@app.get("/api/connection-test")
async def test_connection():
    is_connected = await bitrix_service.test_connection()
    
    return {
        "connected": is_connected,
        "webhook_configured": bool(os.getenv("BITRIX_WEBHOOK_URL")),
        "webhook_url": os.getenv("BITRIX_WEBHOOK_URL", "Не настроен"),
        "message": "Подключение успешно" if is_connected else "Требуется настройка подключения"
    }

@app.get("/api/debug-bitrix")
async def debug_bitrix():
    test_methods = ["profile", "user.get", "crm.activity.list", "crm.company.list", "tasks.task.list"]
    
    results = {}
    for method in test_methods:
        try:
            result = await bitrix_service._make_request(method)
            results[method] = {
                "success": result is not None,
                "data": result if result else "Ошибка или нет данных"
            }
        except Exception as e:
            results[method] = {"success": False, "error": str(e)}
    
    return {
        "debug_info": results,
        "webhook_url": os.getenv("BITRIX_WEBHOOK_URL", "Не настроен"),
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/tasks")
async def get_tasks():
    try:
        tasks = await bitrix_service.get_tasks(days=7)
        
        if tasks is None:
            return {
                "error": "Не удалось подключиться к Bitrix24",
                "setup_required": True,
                "total_tasks": 0
            }
        
        return {
            "total_tasks": len(tasks),
            "tasks_data": tasks[:10],
            "message": f"Найдено {len(tasks)} задач за 7 дней"
        }
        
    except Exception as e:
        return {"error": str(e), "total_tasks": 0}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)