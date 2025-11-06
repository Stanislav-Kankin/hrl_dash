from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from datetime import datetime, timedelta
from app.services.bitrix_service import BitrixService
from dotenv import load_dotenv
from typing import List, Optional, Dict, Any

import os
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Bitrix24 Analytics Dashboard", version="1.0")
load_dotenv()

# Монтируем статические файлы из папки app/static
app.mount("/static", StaticFiles(directory="app/static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_root():
    """Главная страница с дашбордом"""
    return FileResponse("app/main.html")

@app.get("/api/users-list")
async def get_users_list():
    """Список сотрудников для фильтров"""
    try:
        bitrix_service = BitrixService()
        users = await bitrix_service.get_presales_users()
        
        if users is None:
            return {"users": []}
        
        formatted_users = []
        for user in users:
            formatted_users.append({
                "ID": user['ID'],
                "NAME": user.get('NAME', ''),
                "LAST_NAME": user.get('LAST_NAME', ''),
                "WORK_POSITION": user.get('WORK_POSITION', ''),
                "EMAIL": user.get('EMAIL', '')
            })
        
        return {
            "users": formatted_users,
            "total_presales_users": len(formatted_users),
            "message": f"Найдено {len(formatted_users)} сотрудников пресейла"
        }
        
    except Exception as e:
        logger.error(f"Error in users-list: {str(e)}")
        return {"users": [], "error": str(e)}

from datetime import datetime, timedelta
from fastapi import FastAPI, Query
from typing import List, Optional, Dict, Any
import logging

# ... остальной код ...

@app.get("/api/stats/detailed")
async def get_detailed_stats(
    days: int = Query(30, description="Период в днях"),
    start_date: Optional[str] = Query(None, description="Начальная дата (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Конечная дата (YYYY-MM-DD)"),
    user_ids: Optional[str] = Query(None, description="ID пользователей через запятую"),
    activity_type: Optional[str] = Query(None, description="Тип активности")
):
    """Детальная статистика по сотрудникам с выбором диапазона дат"""
    try:
        bitrix_service = BitrixService()
        
        # Парсим параметры
        user_ids_list = user_ids.split(',') if user_ids else []
        activity_type_list = [activity_type] if activity_type and activity_type != 'all' else None
        
        # Определяем период
        if start_date and end_date:
            # Используем указанный диапазон дат
            period_message = f"с {start_date} по {end_date}"
            # Здесь нужно будет доработать bitrix_service для работы с конкретными датами
            actual_days = 30  # Временное решение
        else:
            # Используем период в днях
            period_message = f"за {days} дней"
            actual_days = days
        
        logger.info(f"Fetching stats: {period_message}, users={user_ids_list}, types={activity_type_list}")
        
        # Получаем активности (ВСЕ данные с пагинацией)
        activities = await bitrix_service.get_activities(
            days=actual_days, 
            user_ids=user_ids_list if user_ids_list else None,  # Если пусто - будут только пресейлы
            activity_types=activity_type_list
        )
        
        if activities is None:
            activities = []
        
        # Получаем пользователей
        users = await bitrix_service.get_presales_users()
        if users is None:
            users = []
        
        # Фильтруем пользователей если указаны конкретные ID
        if user_ids_list:
            users = [user for user in users if str(user.get('ID')) in user_ids_list]
        
        user_map = {str(user['ID']): user for user in users}
        
        # Обрабатываем статистику
        user_stats = process_user_stats_detailed(activities, user_map, actual_days)
        
        # Сортируем по убыванию активности
        user_stats.sort(key=lambda x: x["total"], reverse=True)
        
        return {
            "period_days": actual_days,
            "period_message": period_message,
            "total_activities": len(activities),
            "active_users": len(user_stats),
            "user_stats": user_stats,
            "message": f"Детальная статистика {period_message}"
        }
        
    except Exception as e:
        logger.error(f"Error in detailed stats: {str(e)}")
        return {"error": str(e), "user_stats": []}

def process_user_stats_detailed(activities: List[Dict], user_map: Dict, period_days: int) -> List[Dict]:
    """Детальная обработка статистики по пользователям"""
    user_stats = {}
    
    for activity in activities:
        user_id = str(activity.get('AUTHOR_ID'))
        if not user_id:
            continue
            
        if user_id not in user_stats:
            user_info = user_map.get(user_id, {})
            user_stats[user_id] = {
                "user_id": user_id,
                "user_name": f"{user_info.get('NAME', '')} {user_info.get('LAST_NAME', '')}".strip() or f"ID: {user_id}",
                "days": set(),
                "calls": 0,
                "comments": 0,
                "tasks": 0,
                "meetings": 0,
                "other": 0,
                "total": 0,
                "last_activity": activity.get('CREATED', ''),
                "activities": []
            }
        
        user = user_stats[user_id]
        activity_date = activity.get('CREATED', '')[:10]  # YYYY-MM-DD
        if activity_date:
            user["days"].add(activity_date)
        
        # Классифицируем активность
        type_id = str(activity.get('TYPE_ID', ''))
        if type_id == "2":
            user["calls"] += 1
        elif type_id == "6":
            user["comments"] += 1
        elif type_id == "4":
            user["tasks"] += 1
        elif type_id == "1":
            user["meetings"] += 1
        else:
            user["other"] += 1
        
        user["total"] += 1
        
        # Обновляем последнюю активность
        if activity.get('CREATED', '') > user["last_activity"]:
            user["last_activity"] = activity.get('CREATED', '')
        
        user["activities"].append(activity)
    
    # Преобразуем в список и добавляем вычисляемые поля
    stats_list = []
    for user_id, stats in user_stats.items():
        last_activity = stats["last_activity"]
        last_activity_date = last_activity[:10] if last_activity else "Нет данных"
        
        stats_list.append({
            **stats,
            "days_count": len(stats["days"]),
            "last_activity_date": last_activity_date
        })
    
    return stats_list

@app.get("/api/connection-test")
async def test_connection():
    """Тест подключения к Bitrix24"""
    try:
        bitrix_service = BitrixService()
        is_connected = await bitrix_service.test_connection()
        
        return {
            "connected": is_connected,
            "webhook_configured": bool(os.getenv("BITRIX_WEBHOOK_URL")),
            "message": "Подключение успешно" if is_connected else "Требуется настройка подключения"
        }
    except Exception as e:
        logger.error(f"Connection test error: {str(e)}")
        return {"connected": False, "error": str(e)}

@app.get("/api/health")
async def health_check():
    """Проверка здоровья API"""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0"
    }

@app.get("/api/debug/users")
async def debug_users():
    """Отладочный эндпоинт для проверки пользователей"""
    try:
        bitrix_service = BitrixService()
        
        # Получаем всех пользователей
        all_users = await bitrix_service.get_users(only_active=True)
        
        # Получаем пресейл пользователей
        presales_users = await bitrix_service.get_presales_users()
        
        return {
            "total_users": len(all_users) if all_users else 0,
            "total_presales_users": len(presales_users) if presales_users else 0,
            "all_users": [
                {
                    "ID": user['ID'],
                    "NAME": user.get('NAME', ''),
                    "LAST_NAME": user.get('LAST_NAME', ''),
                    "WORK_POSITION": user.get('WORK_POSITION', ''),
                    "EMAIL": user.get('EMAIL', ''),
                    "ACTIVE": user.get('ACTIVE', '')
                } for user in (all_users or [])[:10]  # Ограничиваем для отладки
            ],
            "presales_users": [
                {
                    "ID": user['ID'],
                    "NAME": user.get('NAME', ''),
                    "LAST_NAME": user.get('LAST_NAME', ''),
                    "WORK_POSITION": user.get('WORK_POSITION', ''),
                    "EMAIL": user.get('EMAIL', '')
                } for user in (presales_users or [])
            ]
        }
        
    except Exception as e:
        logger.error(f"Error in debug users: {str(e)}")
        return {"error": str(e)}

@app.get("/api/find-users")
async def find_users():
    """Найти пользователей по имени"""
    try:
        bitrix_service = BitrixService()
        all_users = await bitrix_service.get_users(only_active=True)
        
        if not all_users:
            return {"error": "No users found"}
        
        # Ищем нужных сотрудников
        target_names = [
            "Безина Ольга", "Фатюхина Полина", "Агапова Анастасия",
            "Некрасова Елена", "Вахрушева Наталия", "Прокофьева Дарья"
        ]
        
        found_users = []
        for user in all_users:
            full_name = f"{user.get('NAME', '')} {user.get('LAST_NAME', '')}"
            for target_name in target_names:
                if target_name.lower() in full_name.lower():
                    found_users.append({
                        "ID": user['ID'],
                        "NAME": user.get('NAME', ''),
                        "LAST_NAME": user.get('LAST_NAME', ''),
                        "WORK_POSITION": user.get('WORK_POSITION', ''),
                        "FULL_NAME": full_name
                    })
                    break
        
        return {
            "target_names": target_names,
            "found_users": found_users,
            "message": f"Найдено {len(found_users)} из {len(target_names)} сотрудников"
        }
        
    except Exception as e:
        logger.error(f"Error in find-users: {str(e)}")
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)