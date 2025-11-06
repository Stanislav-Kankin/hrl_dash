from fastapi import FastAPI
from fastapi.responses import HTMLResponse
import requests
import pandas as pd
from datetime import datetime
import os

app = FastAPI(title="Bitrix24 Analytics", version="1.0")

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


# Маршруты API
@app.get("/", response_class=HTMLResponse)
async def read_root():
    return html_template


@app.get("/api/calls")
async def get_calls():
    """Заглушка для данных о звонках"""
    return {
        "total_calls": 156,
        "calls_today": 23,
        "avg_call_duration": "4:32",
        "top_caller": "Иван Петров (15 звонков)"
    }


@app.get("/api/comments")
async def get_comments():
    """Заглушка для данных о комментариях"""
    return {
        "total_comments": 89,
        "comments_today": 12,
        "most_active": "Анна Сидорова (8 комментариев)",
        "popular_topic": "Проект 'Альфа'"
    }


@app.get("/api/users")
async def get_users():
    """Заглушка для данных о пользователях"""
    return {
        "active_users": 8,
        "total_users": 15,
        "online_now": 3,
        "avg_session_time": "2:15"
    }


@app.get("/api/health")
async def health_check():
    """Проверка работы API"""
    return {
        "status": "ok", 
        "timestamp": datetime.now().isoformat(),
        "version": "1.0"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)