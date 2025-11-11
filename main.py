from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from datetime import datetime, timedelta
from app.services.bitrix_service import BitrixService
from app.services.data_warehouse_service import DataWarehouseService
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi.security import HTTPBearer
from app.schemas.auth import UserRegister, UserLogin, Token, UserResponse
from app.services.auth_service import auth_service
from app.dependencies import get_current_user, get_current_admin
import os
import logging
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Инициализация сервисов
bitrix_service = BitrixService()
warehouse_service = DataWarehouseService(bitrix_service)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await warehouse_service.initialize()
    await warehouse_service.start_background_sync()
    logger.info("✅ Warehouse service started")
    yield
    # Shutdown
    await bitrix_service.close_session()

app = FastAPI(
    title="Bitrix24 Analytics Dashboard", 
    version="1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://dev-cloud-ksa.ru", "http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Остальной код остается без изменений...
current_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(current_dir, "app", "static")
app.mount("/static", StaticFiles(directory="app/static"), name="static")

class EmailRequest(BaseModel):
    email: str

@app.get("/", response_class=HTMLResponse)
async def read_root():
    return FileResponse("app/main.html")

@app.get("/api/users-list")
async def get_users_list():
    try:
        users = await bitrix_service.get_presales_users()
        if not users:
            return {"users": []}
        formatted = [{"ID": str(u['ID']), "NAME": u.get('NAME', ''), "LAST_NAME": u.get('LAST_NAME', '')} for u in users]
        return {"users": formatted}
    except Exception as e:
        logger.error(f"Error in users-list: {str(e)}")
        return {"users": [], "error": str(e)}


@app.get("/api/stats/detailed")
async def get_detailed_stats(
    start_date: str = None,
    end_date: str = None,
    user_ids: str = None,
    activity_type: str = None,
    include_statistics: bool = True,
    use_cache: bool = True  # 🔥 ДОБАВИЛ ФЛАГ ДЛЯ КЭША
):
    try:
        user_ids_list = user_ids.split(',') if user_ids else []
        activity_types = [activity_type] if activity_type else None
        presales_users = await bitrix_service.get_presales_users()
        if not presales_users:
            return {"success": False, "error": "Список сотрудников пуст"}

        user_info_map = {str(u['ID']): u for u in presales_users}
        target_user_ids = user_ids_list if user_ids_list else list(user_info_map.keys())

        # 🔥 ПРОВЕРЯЕМ КЭШ ПРЕЖДЕ ЧЕМ ДЕЛАТЬ ЗАПРОС К BITRIX
        activities = []
        cache_used = False
        
        if use_cache:
            cached_activities = await warehouse_service.get_cached_activities(
                target_user_ids, start_date, end_date
            )
            if cached_activities:
                activities = cached_activities
                cache_used = True
                logger.info(f"✅ Using cached data: {len(activities)} activities from warehouse")
        
        # Если кэша нет или он отключен, делаем запрос к Bitrix
        if not activities:
            activities = await bitrix_service.get_activities(
                start_date=start_date,
                end_date=end_date,
                user_ids=target_user_ids,
                activity_types=activity_types
            )
            # 🔥 СОХРАНЯЕМ В КЭШ ДЛЯ СЛЕДУЮЩИХ ЗАПРОСОВ
            if activities:
                asyncio.create_task(warehouse_service.cache_activities(activities))
                logger.info(f"✅ Cached {len(activities)} activities for future requests")

        # 🔥 СОХРАНЯЕМ ЕЖЕДНЕВНЫЙ СНАПШОТ
        today = datetime.now().strftime("%Y-%m-%d")
        asyncio.create_task(warehouse_service.save_daily_snapshot_from_activities(
            activities, target_user_ids, today
        ))

        # --- Остальная логика подсчета статистики ---
        user_activities = {}
        if activities:
            for act in activities:
                uid = str(act['AUTHOR_ID'])
                if uid in target_user_ids:
                    if uid not in user_activities:
                        user_activities[uid] = []
                    user_activities[uid].append(act)

        response_users = user_ids_list if user_ids_list else list(user_info_map.keys())
        user_stats = []
        for uid in response_users:
            info = user_info_map.get(uid)
            if not info:
                continue

            acts = user_activities.get(uid, [])
            calls = len([a for a in acts if str(a['TYPE_ID']) == '2'])
            comments = len([a for a in acts if str(a['TYPE_ID']) == '6'])
            tasks = len([a for a in acts if str(a['TYPE_ID']) == '4'])
            meetings = len([a for a in acts if str(a['TYPE_ID']) == '1'])
            total = len(acts)
            activity_dates = {datetime.fromisoformat(a['CREATED'].replace('Z', '+00:00')).strftime('%Y-%m-%d') for a in acts}
            last_act = max([datetime.fromisoformat(a['CREATED'].replace('Z', '+00:00')) for a in acts]) if acts else None

            user_stats.append({
                "user_id": uid,
                "user_name": f"{info.get('NAME', '')} {info.get('LAST_NAME', '')}".strip(),
                "calls": calls,
                "comments": comments,
                "tasks": tasks,
                "meetings": meetings,
                "total": total,
                "days_count": len(activity_dates),
                "last_activity_date": last_act.strftime('%Y-%m-%d %H:%M') if last_act else "Нет данных"
            })

        total_activities = sum(len(user_activities.get(uid, [])) for uid in response_users)

        result = {
            "success": True, 
            "user_stats": user_stats, 
            "total_activities": total_activities,
            "cache_used": cache_used,  # 🔥 ДОБАВИЛ ИНФОРМАЦИЮ О КЭШЕ
            "activities_count": len(activities)
        }

        if include_statistics:
            statistics = await bitrix_service.get_activity_statistics(
                start_date=start_date,
                end_date=end_date,
                user_ids=target_user_ids
            )
            result["statistics"] = statistics

        return result
        
    except Exception as e:
        logger.error(f"❌ Error in get_detailed_stats: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}

# === Отладочные эндпоинты ===
@app.get("/api/connection-test")
async def test_connection():
    try:
        is_connected = await bitrix_service.test_connection()
        return {"connected": is_connected}
    except Exception as e:
        logger.error(f"Connection test error: {str(e)}")
        return {"connected": False, "error": str(e)}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse(os.path.join(os.path.dirname(__file__), "favicon.ico"))

@app.get("/api/debug/presales-users")
async def debug_presales_users():
    try:
        users = await bitrix_service.get_presales_users()
        return {"users": [{"ID": u['ID'], "NAME": u.get('NAME'), "LAST_NAME": u.get('LAST_NAME')} for u in users]}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/clear-cache")
async def clear_cache(current_user: dict = Depends(get_current_user)):
    bitrix_service.clear_cache()
    return {"success": True}

@app.get("/api/user-activities/{user_id}")
async def get_user_activities(user_id: str, start_date: str = None, end_date: str = None):
    activities = await bitrix_service.get_activities(start_date=start_date, end_date=end_date, user_ids=[user_id])
    formatted = []
    if activities:
        for act in activities[:200]:
            formatted.append({
                "ID": act.get("ID"),
                "CREATED": act.get("CREATED"),
                "AUTHOR_ID": act.get("AUTHOR_ID"),
                "TYPE_ID": act.get("TYPE_ID"),
                "DESCRIPTION": (act.get("DESCRIPTION") or "")[:300],
                "SUBJECT": act.get("SUBJECT")
            })
    return {"success": True, "activities": formatted, "activities_count": len(activities) if activities else 0}

# Аутентификация
@app.post("/api/auth/register", response_model=UserResponse)
async def register(user_data: UserRegister):
    try:
        user = auth_service.register_user(email=user_data.email, password=user_data.password, full_name=user_data.full_name)
        return user
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    user = auth_service.authenticate_user(user_data.email, user_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    access_token_expires = timedelta(minutes=auth_service.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth_service.create_access_token(data={"sub": user["email"]}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    return current_user

# Административные эндпоинты
@app.get("/api/admin/allowed-emails")
async def get_allowed_emails(current_user: dict = Depends(get_current_admin)):
    try:
        emails = auth_service.get_allowed_emails()
        return {"success": True, "emails": emails}
    except Exception as e:
        logger.error(f"Error getting allowed emails: {str(e)}")
        return {"success": False, "error": str(e)}

@app.post("/api/admin/add-allowed-email")
async def add_allowed_email(request: EmailRequest, current_user: dict = Depends(get_current_admin)):
    try:
        auth_service.add_allowed_email(request.email)
        return {"success": True, "message": f"Email {request.email} added to allowed list"}
    except Exception as e:
        logger.error(f"Error adding allowed email: {str(e)}")
        return {"success": False, "error": str(e)}

@app.delete("/api/admin/remove-allowed-email")
async def remove_allowed_email(request: EmailRequest, current_user: dict = Depends(get_current_admin)):
    try:
        auth_service.remove_allowed_email(request.email)
        return {"success": True, "message": f"Email {request.email} removed from allowed list"}
    except Exception as e:
        logger.error(f"Error removing allowed email: {str(e)}")
        return {"success": False, "error": str(e)}

@app.get("/api/admin/users-count")
async def get_users_count(current_user: dict = Depends(get_current_admin)):
    try:
        users = await bitrix_service.get_presales_users()
        count = len(users) if users else 0
        return {"success": True, "count": count}
    except Exception as e:
        logger.error(f"Error getting users count: {str(e)}")
        return {"success": False, "error": str(e)}

@app.on_event("startup")
async def startup_event():
    await warehouse_service.initialize()
    await warehouse_service.start_background_sync()

@app.get("/api/stats/fast")
async def get_fast_stats(
    start_date: str,
    end_date: str,
    user_ids: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Быстрая статистика из кэша"""
    try:
        selected_user_ids = user_ids.split(',') if user_ids else []
        presales_users = await bitrix_service.get_presales_users()
        
        if not presales_users:
            return {"success": False, "error": "Список сотрудников пуст"}
            
        target_user_ids = selected_user_ids if selected_user_ids else [str(u['ID']) for u in presales_users]
        
        # Проверяем, есть ли полные данные в кэше
        cache_available = await warehouse_service.is_period_cached(target_user_ids, start_date, end_date)
        
        if cache_available:
            # Берем данные из кэша
            cached_stats = await warehouse_service.get_fast_stats(target_user_ids, start_date, end_date)
            if cached_stats:
                # Добавляем информацию о пользователях
                user_info_map = {str(u['ID']): u for u in presales_users}
                for stat in cached_stats['user_stats']:
                    user_info = user_info_map.get(stat['user_id'])
                    if user_info:
                        stat['user_name'] = f"{user_info.get('NAME', '')} {user_info.get('LAST_NAME', '')}".strip()
                
                cached_stats['success'] = True
                cached_stats['cache_used'] = True
                return cached_stats
        
        # Если кэша нет, используем обычный метод (но с кэшированием)
        logger.info("📊 Cache not available, using live data")
        return await get_detailed_stats(start_date, end_date, user_ids, None, True, False)
        
    except Exception as e:
        logger.error(f"Error in fast stats: {e}")
        return {"success": False, "error": str(e)}

@app.get("/api/leads/current")
async def get_current_leads(
    user_ids: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Текущие лиды пользователей"""
    try:
        selected_user_ids = user_ids.split(',') if user_ids else []
        results = {}
        
        for user_id in selected_user_ids:
            leads = await bitrix_service.get_user_leads(user_id)
            results[user_id] = leads
            
        return {"success": True, "leads": results}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/refresh-cache")
async def refresh_cache(
    start_date: str = None,
    end_date: str = None,
    user_ids: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Принудительное обновление кэша с улучшенной логикой"""
    try:
        user_ids_list = user_ids.split(',') if user_ids else []
        presales_users = await bitrix_service.get_presales_users()
        if not presales_users:
            return {"success": False, "error": "Список сотрудников пуст"}

        target_user_ids = user_ids_list if user_ids_list else [str(u['ID']) for u in presales_users]
        
        # Если даты не указаны, берем последние 90 дней
        if not start_date or not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
            start_date = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        
        # Получаем свежие данные
        activities = await bitrix_service.get_activities(
            start_date=start_date,
            end_date=end_date,
            user_ids=target_user_ids
        )
        
        # Очищаем старый кэш и сохраняем новый
        if activities:
            await warehouse_service.cache_activities(activities)
            
            # Создаем снапшоты для каждого дня
            start = datetime.fromisoformat(start_date)
            end = datetime.fromisoformat(end_date)
            current = start
            
            while current <= end:
                date_str = current.strftime("%Y-%m-%d")
                await warehouse_service.save_daily_snapshot_from_activities(
                    activities, target_user_ids, date_str
                )
                current += timedelta(days=1)
            
            return {
                "success": True, 
                "message": f"Cache refreshed with {len(activities)} activities",
                "period": f"{start_date} to {end_date}",
                "users_count": len(target_user_ids),
                "activities_count": len(activities)
            }
        else:
            return {"success": False, "error": "No activities found"}
            
    except Exception as e:
        logger.error(f"Error refreshing cache: {e}")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)