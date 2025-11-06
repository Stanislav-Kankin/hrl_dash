from fastapi import FastAPI, Request
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
bitrix_service = BitrixService()

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
    user_ids: Optional[str] = None,
    activity_type: Optional[str] = None
):
    """Детальная статистика по сотрудникам"""
    try:
        user_ids_list = user_ids.split(',') if user_ids else None
        activity_type_list = activity_type.split(',') if activity_type else None
        
        logger.info(f"Fetching activities with days={days}, users={user_ids_list}, types={activity_type_list}")
        
        activities = await bitrix_service.get_activities(
            days=days, 
            user_ids=user_ids_list,
            activity_types=activity_type_list
        )
        
        if activities is None:
            return {"error": "Не удалось получить активности"}
        
        users = await bitrix_service.get_presales_users()
        user_map = {user['ID']: user for user in users} if users else {}
        
        # Обрабатываем статистику
        user_stats = process_user_stats_detailed(activities, user_map, days)
        
        # Сортируем по убыванию активности
        user_stats.sort(key=lambda x: x["total"], reverse=True)
        
        return {
            "period_days": days,
            "total_activities": len(activities),
            "active_users": len(user_stats),
            "user_stats": user_stats,
            "message": f"Детальная статистика за {days} дней"
        }
        
    except Exception as e:
        logger.error(f"Error in detailed stats: {str(e)}")
        return {"error": str(e)}

def process_user_stats_detailed(activities: List[Dict], user_map: Dict, period_days: int) -> List[Dict]:
    """Детальная обработка статистики по пользователям"""
    user_stats = {}
    
    for activity in activities:
        user_id = activity.get('AUTHOR_ID')
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
        user["days"].add(activity_date)
        
        # Классифицируем активность
        type_id = activity.get('TYPE_ID', '')
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
        stats_list.append({
            **stats,
            "days_count": len(stats["days"]),
            "last_activity_date": stats["last_activity"][:10] if stats["last_activity"] else "Нет данных"
        })
    
    return stats_list

@app.get("/api/connection-test")
async def test_connection():
    """Тест подключения к Bitrix24"""
    is_connected = await bitrix_service.test_connection()
    
    return {
        "connected": is_connected,
        "webhook_configured": bool(os.getenv("BITRIX_WEBHOOK_URL")),
        "message": "Подключение успешно" if is_connected else "Требуется настройка подключения"
    }

@app.get("/api/health")
async def health_check():
    """Проверка здоровья API"""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0"
    }

@app.on_event("shutdown")
async def shutdown_event():
    """Закрываем сессию при завершении"""
    await bitrix_service.close_session()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)