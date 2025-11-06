from fastapi import FastAPI
from fastapi.responses import HTMLResponse
import requests
import pandas as pd
from datetime import datetime
from app.services.bitrix_service import BitrixService
from dotenv import load_dotenv
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
        .stats { display: flex; flex-wrap: wrap; gap: 20px; }
        .stat-item { 
            flex: 1; 
            min-width: 200px; 
            text-align: center;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Bitrix24 Analytics Dashboard</h1>
        <p>Дашборд для анализа активности сотрудников</p>
        
        <div class="card">
            <h3>Быстрые действия</h3>
            <button onclick="loadData('calls')">📞 Статистика звонков</button>
            <button onclick="loadData('comments')">💬 Активность комментариев</button>
            <button onclick="loadData('users')">👥 Данные сотрудников</button>
        </div>
        
        <div class="card">
            <h3>Результаты</h3>
            <div id="results">
                <p>Нажмите кнопку выше для загрузки данных...</p>
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
        // Здесь будет логика для красивых графиков
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
        
        document.getElementById('stats').innerHTML = statsHtml;
    }
    </script>
</body>
</html>
"""


@app.get("/", response_class=HTMLResponse)
async def read_root():
    return html_template

@app.get("/api/health")
async def health_check():
    """Проверка работы API"""
    return {
        "status": "ok", 
        "timestamp": datetime.now().isoformat(),
        "version": "1.0"
    }


@app.get("/api/calls")
async def get_calls():
    """Реальные данные о звонках из Bitrix24"""
    try:
        calls = bitrix_service.get_calls(days=7)
        
        if calls is None:
            return {
                "error": "Не удалось подключиться к Bitrix24",
                "setup_required": True,
                "total_calls": 0,
                "calls_today": 0
            }
        
        # Простая аналитика
        today = datetime.now().date()
        calls_today = len([
            call for call in calls 
            if datetime.fromisoformat(call.get('CREATED', '')).date() == today
        ])
        
        return {
            "total_calls": len(calls),
            "calls_today": calls_today,
            "calls_data": calls[:10],  # Первые 10 звонков
            "message": f"Найдено {len(calls)} звонков за 7 дней"
        }
        
    except Exception as e:
        return {"error": str(e), "total_calls": 0, "calls_today": 0}

@app.get("/api/users")
async def get_users():
    """Реальные данные о пользователях из Bitrix24"""
    try:
        users = bitrix_service.get_users()
        
        if users is None:
            return {
                "error": "Не удалось подключиться к Bitrix24",
                "setup_required": True,
                "active_users": 0,
                "total_users": 0
            }
        
        return {
            "active_users": len([u for u in users if u.get('ACTIVE', False)]),
            "total_users": len(users),
            "users": users[:10],  # Первые 10 пользователей
            "online_now": "Нужна настройка статусов"  # Упрощенно
        }
        
    except Exception as e:
        return {"error": str(e), "active_users": 0, "total_users": 0}

@app.get("/api/connection-test")
async def test_connection():
    """Проверить подключение к Bitrix24"""
    is_connected = bitrix_service.test_connection()
    
    return {
        "connected": is_connected,
        "webhook_configured": bool(os.getenv("BITRIX_WEBHOOK_URL")),
        "message": "Подключение успешно" if is_connected else "Требуется настройка подключения"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)