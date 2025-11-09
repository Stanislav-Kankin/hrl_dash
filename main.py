from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from datetime import datetime, timedelta
from app.services.bitrix_service import BitrixService
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi.security import HTTPBearer
from app.schemas.auth import UserRegister, UserLogin, Token, UserResponse
from app.services.auth_service import auth_service
from app.dependencies import get_current_user, get_current_admin
import os
import logging
from fastapi.middleware.cors import CORSMiddleware


# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Bitrix24 Analytics Dashboard", version="1.0")
load_dotenv()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://dev-cloud-ksa.ru", "http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализируем сервис
bitrix_service = BitrixService()

current_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(current_dir, "app", "static")

# Монтируем статические файлы из папки app/static
app.mount("/static", StaticFiles(directory="app/static"), name="static")

class EmailRequest(BaseModel):
    email: str

# Эндпоинты аутентификации (публичные)
@app.post("/api/auth/register", response_model=UserResponse)
async def register(user_data: UserRegister):
    """Регистрация нового пользователя"""
    try:
        user = auth_service.register_user(
            email=user_data.email,
            password=user_data.password,
            full_name=user_data.full_name
        )
        return user
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@app.post("/api/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    """Вход пользователя"""
    user = auth_service.authenticate_user(user_data.email, user_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth_service.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth_service.create_access_token(
        data={"sub": user["email"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Получить информацию о текущем пользователе"""
    return current_user

# Публичные эндпоинты
@app.get("/", response_class=HTMLResponse)
async def read_root():
    """Главная страница с дашбордом"""
    return FileResponse("app/main.html")

@app.get("/api/health")
async def health_check():
    """Проверка здоровья API"""
    return {
        "status": "ok", 
        "timestamp": datetime.now().isoformat(),
        "version": "1.0"
    }

# Основные эндпоинты БЕЗ аутентификации
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
    include_statistics: bool = False,
    include_activities: bool = False
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
        
        # Получаем ВСЕХ пресейл-сотрудников для статистики
        presales_users = await bitrix_service.get_presales_users()
        user_info_map = {str(user['ID']): user for user in presales_users}  # ВАЖНО: приводим ID к строке
        
        logger.info(f"📊 User info map keys: {list(user_info_map.keys())}")
        
        # ДИАГНОСТИКА: посмотрим распределение активностей по пользователям
        if activities:
            author_distribution = {}
            for activity in activities:
                author_id = str(activity.get('AUTHOR_ID', 'unknown'))
                author_distribution[author_id] = author_distribution.get(author_id, 0) + 1
            logger.info(f"🔍 Activity distribution by author: {author_distribution}")
        
        if not activities:
            # Возвращаем ВСЕХ пользователей даже если нет активностей
            user_stats = []
            for user_id, user_info in user_info_map.items():
                user_stats.append({
                    "user_id": user_id,
                    "user_name": f"{user_info.get('NAME', '')} {user_info.get('LAST_NAME', '')}",
                    "calls": 0,
                    "comments": 0,
                    "tasks": 0,
                    "meetings": 0,
                    "total": 0,
                    "days_count": 0,
                    "last_activity_date": "Нет данных"
                })

            return {
                "success": True,
                "user_stats": user_stats,
                "total_activities": 0,
                "active_users": 0,
                "period_days": days if not start_date else None,
                "date_range": {
                    "start": start_date,
                    "end": end_date
                } if start_date and end_date else None
            }
        
        # Группируем активности по пользователям
        user_activities = {}
        for activity in activities:
            user_id = str(activity['AUTHOR_ID'])  # ВАЖНО: приводим к строке
            if user_id not in user_activities:
                user_activities[user_id] = []
            user_activities[user_id].append(activity)
        
        logger.info(f"📊 Users with activities: {list(user_activities.keys())}")
        
        # Создаем статистику для ВСЕХ пресейл-сотрудников
        user_stats = []
        active_user_ids = set()
        
        for user_id, user_info in user_info_map.items():
            user_acts = user_activities.get(user_id, [])
            
            # Считаем статистику по типам
            calls = len([a for a in user_acts if a['TYPE_ID'] == '2'])
            comments = len([a for a in user_acts if a['TYPE_ID'] == '6'])
            tasks = len([a for a in user_acts if a['TYPE_ID'] == '4'])
            meetings = len([a for a in user_acts if a['TYPE_ID'] == '1'])
            total = len(user_acts)
            
            if total > 0:
                active_user_ids.add(user_id)
            
            # Дни активности
            activity_dates = set()
            last_activity = None
            
            for act in user_acts:
                act_date = datetime.fromisoformat(act['CREATED'].replace('Z', '+00:00'))
                date_key = act_date.strftime('%Y-%m-%d')
                activity_dates.add(date_key)
                
                if not last_activity or act_date > last_activity:
                    last_activity = act_date
            
            user_stat = {
                "user_id": user_id,
                "user_name": f"{user_info.get('NAME', '')} {user_info.get('LAST_NAME', '')}",
                "calls": calls,
                "comments": comments,
                "tasks": tasks,
                "meetings": meetings,
                "total": total,
                "days_count": len(activity_dates),
                "last_activity_date": last_activity.strftime('%Y-%m-%d %H:%M') if last_activity else "Нет данных"
            }
            
            # ДОБАВЛЯЕМ ACTIVITIES ТОЛЬКО ЕСЛИ ЯВНО ЗАПРОШЕНО
            if include_activities and user_acts:
                user_stat["activities"] = user_acts
            
            user_stats.append(user_stat)
        
        total_activities = len(activities)
        
        result = {
            "success": True,
            "user_stats": user_stats,
            "total_activities": total_activities,
            "active_users": len(active_user_ids),  # Только пользователи с активностями
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
        
        logger.info(f"✅ Returning stats: {len(user_stats)} users, {len(active_user_ids)} active users, {total_activities} total activities")
        return result
        
    except Exception as e:
        logger.error(f"Error getting detailed stats: {str(e)}")
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

# Защищенные эндпоинты (требуют аутентификации)
@app.post("/api/clear-cache")
async def clear_cache(current_user: dict = Depends(get_current_user)):
    """Очистить кэш"""
    try:
        bitrix_service.clear_cache()
        return {"success": True, "message": "Cache cleared successfully"}
    except Exception as e:
        logger.error(f"Error clearing cache: {str(e)}")
        return {"success": False, "error": str(e)}

@app.get("/api/debug/users")
async def debug_users(current_user: dict = Depends(get_current_user)):
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
                } for user in (all_users or [])[:10]
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
async def find_users(current_user: dict = Depends(get_current_user)):
    """Найти пользователей по имени"""
    try:
        all_users = await bitrix_service.get_users(only_active=True)
        
        if not all_users:
            return {"error": "No users found"}
        
        target_names = [
            "Безина Ольга", "Фатюхина Полина", "Агапова Анастасия",
            "Некрасова Елена", "Вахрушева Наталия", "Прокофьева Дарья"
        ]
        
        found_users = []
        for user in all_users:
            full_name = f"{user.get('NAME', '')} {user.get('LAST_NAME', '')}".strip()
            for target_name in target_names:
                # Более гибкое сравнение
                if (target_name.lower() in full_name.lower() or 
                    full_name.lower() in target_name.lower()):
                    found_users.append({
                        "ID": user['ID'],
                        "NAME": user.get('NAME', ''),
                        "LAST_NAME": user.get('LAST_NAME', ''),
                        "WORK_POSITION": user.get('WORK_POSITION', ''),
                        "FULL_NAME": full_name,
                        "EMAIL": user.get('EMAIL', '')
                    })
                    break
        
        return {
            "target_names": target_names,
            "found_users": found_users,
            "total_users": len(all_users),
            "message": f"Найдено {len(found_users)} из {len(target_names)} сотрудников"
        }
        
    except Exception as e:
        logger.error(f"Error in find-users: {str(e)}")
        return {"error": str(e)}
    
@app.get("/api/user-activities/{user_id}")
async def get_user_activities(
    user_id: str,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Получить активности конкретного пользователя (для детализации)"""
    try:
        logger.info(f"🔍 Getting activities for user {user_id}, dates: {start_date} to {end_date}")
        
        activities = await bitrix_service.get_activities(
            start_date=start_date,
            end_date=end_date,
            user_ids=[user_id]
        )
        
        logger.info(f"✅ Found {len(activities) if activities else 0} activities for user {user_id}")
        
        # Ограничиваем и форматируем ответ чтобы избежать ошибки размера
        formatted_activities = []
        if activities:
            for activity in activities[:200]:  # Ограничиваем до 200 записей для теста
                formatted_activity = {
                    "ID": activity.get("ID"),
                    "CREATED": activity.get("CREATED"),
                    "AUTHOR_ID": activity.get("AUTHOR_ID"),
                    "TYPE_ID": activity.get("TYPE_ID"),
                    "DESCRIPTION": (activity.get("DESCRIPTION") or "")[:200],  # Ограничиваем длину описания
                    "SUBJECT": activity.get("SUBJECT"),
                    "PROVIDER_ID": activity.get("PROVIDER_ID")
                }
                formatted_activities.append(formatted_activity)
        
        response_data = {
            "success": True,
            "user_id": user_id,
            "activities_count": len(activities) if activities else 0,
            "activities_returned": len(formatted_activities),
            "activities": formatted_activities
        }
        
        logger.info(f"📊 Response prepared: {len(formatted_activities)} activities")
        return response_data
        
    except Exception as e:
        logger.error(f"❌ Error getting user activities: {str(e)}")
        return {"success": False, "error": str(e)}
    
# Админ эндпоинты для управления белым списком
@app.get("/api/admin/allowed-emails")
async def get_allowed_emails(current_user: dict = Depends(get_current_admin)):
    """Получить список разрешенных email"""
    return {"allowed_emails": auth_service.get_allowed_emails()}

@app.post("/api/admin/add-allowed-email")
async def add_allowed_email(request: EmailRequest, current_user: dict = Depends(get_current_admin)):
    """Добавить email в белый список"""
    auth_service.add_allowed_email(request.email)
    return {"message": f"Email {request.email} добавлен в разрешенные"}

@app.post("/api/admin/remove-allowed-email")
async def remove_allowed_email(request: EmailRequest, current_user: dict = Depends(get_current_admin)):
    """Удалить email из белого списка"""
    auth_service.remove_allowed_email(request.email)
    return {"message": f"Email {request.email} удален из разрешенных"}

@app.get("/api/debug/activity-distribution")
async def debug_activity_distribution(
    start_date: str = "2025-10-09",
    end_date: str = "2025-11-08"
):
    """Отладочный эндпоинт для проверки распределения активностей"""
    try:
        activities = await bitrix_service.get_activities(
            start_date=start_date,
            end_date=end_date
        )
        
        if not activities:
            return {"error": "No activities found"}
        
        # Анализируем распределение по авторам
        distribution = {}
        for activity in activities:
            author_id = str(activity.get('AUTHOR_ID', 'unknown'))
            
            if author_id not in distribution:
                distribution[author_id] = {
                    "count": 0,
                    "types": {},
                    "last_activity": None
                }
            
            distribution[author_id]["count"] += 1
            
            # Типы активностей
            type_id = activity.get('TYPE_ID', 'unknown')
            distribution[author_id]["types"][type_id] = distribution[author_id]["types"].get(type_id, 0) + 1
            
            # Последняя активность
            created = activity.get('CREATED')
            if created:
                activity_date = datetime.fromisoformat(created.replace('Z', '+00:00'))
                if not distribution[author_id]["last_activity"] or activity_date > distribution[author_id]["last_activity"]:
                    distribution[author_id]["last_activity"] = activity_date
        
        return {
            "total_activities": len(activities),
            "distribution": distribution,
            "sample_activity": activities[0] if activities else None
        }
        
    except Exception as e:
        logger.error(f"Debug error: {str(e)}")
        return {"error": str(e)}
    
@app.get("/api/debug/presales-users")
async def debug_presales_users():
    """Отладочный эндпоинт для проверки пресейл пользователей"""
    try:
        presales_users = await bitrix_service.get_presales_users()
        
        if not presales_users:
            return {"error": "No presales users found"}
        
        users_info = []
        for user in presales_users:
            users_info.append({
                "id": user.get('ID'),
                "name": f"{user.get('NAME', '')} {user.get('LAST_NAME', '')}",
                "email": user.get('EMAIL'),
                "position": user.get('WORK_POSITION'),
                "active": user.get('ACTIVE')
            })
        
        return {
            "total_presales_users": len(presales_users),
            "users": users_info
        }
        
    except Exception as e:
        logger.error(f"Debug presales error: {str(e)}")
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)