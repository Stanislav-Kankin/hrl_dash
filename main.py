from fastapi import FastAPI
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

# Инициализируем сервис
bitrix_service = BitrixService()

current_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(current_dir, "app", "static")


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

@app.get("/api/stats/detailed")
async def get_detailed_stats(
    days: int = 30,
    start_date: str = None,
    end_date: str = None,
    user_ids: str = None,
    activity_type: str = None,
    include_statistics: bool = False
):
    """Получить детальную статистику с опциональной аналитикой"""
    try:
        user_ids_list = user_ids.split(',') if user_ids else []
        activity_types = [activity_type] if activity_type else None
        
        logger.info(f"Fetching stats: days={days}, start_date={start_date}, end_date={end_date}, users={user_ids_list}, types={activity_types}")
        
        # Получаем активности
        activities = await bitrix_service.get_activities(
            days=days,
            start_date=start_date,
            end_date=end_date,
            user_ids=user_ids_list,
            activity_types=activity_types
        )
        
        if not activities:
            return {
                "success": True,
                "user_stats": [],
                "total_activities": 0,
                "active_users": 0,
                "period_days": days if not start_date else None,
                "date_range": {
                    "start": start_date,
                    "end": end_date
                } if start_date and end_date else None
            }
        
        # Обрабатываем статистику по пользователям
        user_stats = []
        user_activities = {}
        
        for activity in activities:
            user_id = activity['AUTHOR_ID']
            if user_id not in user_activities:
                user_activities[user_id] = []
            user_activities[user_id].append(activity)
        
        # Получаем информацию о пользователях
        presales_users = await bitrix_service.get_presales_users()
        user_info_map = {user['ID']: user for user in presales_users}
        
        for user_id, user_acts in user_activities.items():
            user_info = user_info_map.get(user_id)
            if not user_info:
                continue
                
            # Считаем статистику по типам
            calls = len([a for a in user_acts if a['TYPE_ID'] == '2'])
            comments = len([a for a in user_acts if a['TYPE_ID'] == '6'])
            tasks = len([a for a in user_acts if a['TYPE_ID'] == '4'])
            meetings = len([a for a in user_acts if a['TYPE_ID'] == '1'])
            total = len(user_acts)
            
            # Дни активности
            activity_dates = set()
            last_activity = None
            
            for act in user_acts:
                act_date = datetime.fromisoformat(act['CREATED'].replace('Z', '+00:00'))
                date_key = act_date.strftime('%Y-%m-%d')
                activity_dates.add(date_key)
                
                if not last_activity or act_date > last_activity:
                    last_activity = act_date
            
            user_stats.append({
                "user_id": user_id,
                "user_name": f"{user_info.get('NAME', '')} {user_info.get('LAST_NAME', '')}",
                "calls": calls,
                "comments": comments,
                "tasks": tasks,
                "meetings": meetings,
                "total": total,
                "days_count": len(activity_dates),
                "last_activity_date": last_activity.strftime('%Y-%m-%d %H:%M') if last_activity else "Нет данных",
                "activities": user_acts
            })
        
        total_activities = len(activities)
        
        result = {
            "success": True,
            "user_stats": user_stats,
            "total_activities": total_activities,
            "active_users": len(user_stats),
            "period_days": days if not start_date else None,
            "date_range": {
                "start": start_date,
                "end": end_date
            } if start_date and end_date else None
        }
        
        # Добавляем статистику если запрошено
        if include_statistics:
            statistics = await bitrix_service.get_activity_statistics(
                days=days,
                start_date=start_date,
                end_date=end_date,
                user_ids=user_ids_list
            )
            result["statistics"] = statistics
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting detailed stats: {str(e)}")
        return {"success": False, "error": str(e)}

@app.get("/api/statistics")
async def get_statistics(
    days: int = None,
    start_date: str = None,
    end_date: str = None,
    user_ids: str = None
):
    """Получить статистику активностей с группировкой"""
    try:
        user_ids_list = user_ids.split(',') if user_ids else []
        
        statistics = await bitrix_service.get_activity_statistics(
            days=days,
            start_date=start_date,
            end_date=end_date,
            user_ids=user_ids_list
        )
        
        return {
            "success": True,
            "statistics": statistics
        }
    except Exception as e:
        logger.error(f"Error getting statistics: {str(e)}")
        return {"success": False, "error": str(e)}

@app.post("/api/clear-cache")
async def clear_cache():
    """Очистить кэш"""
    try:
        bitrix_service.clear_cache()
        return {"success": True, "message": "Cache cleared successfully"}
    except Exception as e:
        logger.error(f"Error clearing cache: {str(e)}")
        return {"success": False, "error": str(e)}

@app.get("/api/connection-test")
async def test_connection():
    """Тест подключения к Bitrix24"""
    try:
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