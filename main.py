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
from typing import List, Optional, Dict, Any
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

@app.get("/api/stats/main")
async def get_main_stats(
    start_date: str,
    end_date: str,
    user_ids: str = None,
    activity_type: str = None,
    include_statistics: bool = True,
    force_refresh: bool = False,  # 🔥 НОВЫЙ ПАРАМЕТР
    current_user: dict = Depends(get_current_user)
):
    """УНИВЕРСАЛЬНЫЙ эндпоинт - с возможностью принудительного обновления"""
    try:
        user_ids_list = user_ids.split(',') if user_ids else []
        activity_types = [activity_type] if activity_type else None
        presales_users = await bitrix_service.get_presales_users()
        if not presales_users:
            return {"success": False, "error": "Список сотрудников пуст"}

        user_info_map = {str(u['ID']): u for u in presales_users}
        target_user_ids = user_ids_list if user_ids_list else list(user_info_map.keys())

        logger.info(f"🔍 Main stats: {start_date} to {end_date}, users: {len(target_user_ids)}, force_refresh: {force_refresh}")

        cache_used = False
        activities = []
        completeness = 0

        # 🔥 ЕСЛИ НЕ ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ - проверяем кэш
        if not force_refresh:
            cache_analysis = await warehouse_service.get_cached_activities_for_selected_users(
                target_user_ids, start_date, end_date, activity_types
            )


            cached_activities = cache_analysis["activities"]
            completeness = cache_analysis["completeness"]

            if completeness >= 95.0:
                activities = cached_activities
                cache_used = True
                logger.info(f"✅ Using cached data: {completeness:.1f}% complete, {len(activities)} activities")

        # 🔥 ЕСЛИ ДАННЫХ НЕТ В КЭШЕ ИЛИ ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ - грузим из Bitrix
        if not activities:
            if force_refresh:
                logger.info(f"🔄 Force refresh requested, loading from Bitrix...")
            else:
                logger.info(f"🔄 No complete cache found ({completeness:.1f}%), loading from Bitrix...")
            
            activities = await bitrix_service.get_activities(
                start_date=start_date,
                end_date=end_date,
                user_ids=target_user_ids,
                activity_types=activity_types
            )
            
            if activities:
                asyncio.create_task(warehouse_service.cache_activities(activities))
                logger.info(f"✅ Cached {len(activities)} activities for period {start_date} to {end_date}")

        # 🔥 СОХРАНЯЕМ СНАПШОТЫ ДЛЯ КАЖДОГО ДНЯ В ПЕРИОДЕ
        if activities:
            try:
                start = datetime.fromisoformat(start_date)
                end = datetime.fromisoformat(end_date)
                current = start
                
                # Для каждого дня в периоде создаем отдельный снапшот
                while current <= end:
                    date_str = current.strftime("%Y-%m-%d")
                    
                    # Фильтруем активности за текущий день
                    daily_activities = []
                    for activity in activities:
                        try:
                            created_str = activity.get('CREATED', '').replace('Z', '+00:00')
                            activity_date = datetime.fromisoformat(created_str).strftime('%Y-%m-%d')
                            if activity_date == date_str:
                                daily_activities.append(activity)
                        except Exception:
                            continue
                    
                    # Создаем снапшот только если есть активности за этот день
                    if daily_activities:
                        asyncio.create_task(warehouse_service.save_daily_snapshot_from_activities(
                            daily_activities, target_user_ids, date_str
                        ))
                    
                    current += timedelta(days=1)
            except Exception as e:
                logger.error(f"Error creating daily snapshots: {e}")

        # --- Логика подсчета статистики ---
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
            "cache_used": cache_used,
            "cache_completeness": completeness,
            "activities_count": len(activities),
            "start_date": start_date,
            "end_date": end_date
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
        logger.error(f"❌ Error in get_main_stats: {str(e)}", exc_info=True)
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

@app.get("/api/refresh-cache")
async def refresh_cache(
    start_date: str = None,
    end_date: str = None,
    user_ids: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Принудительное обновление кэша"""
    try:
        user_ids_list = user_ids.split(',') if user_ids else []
        presales_users = await bitrix_service.get_presales_users()
        if not presales_users:
            return {"success": False, "error": "Список сотрудников пуст"}

        target_user_ids = user_ids_list if user_ids_list else [str(u['ID']) for u in presales_users]
        
        # Если даты не указаны - используем текущий день
        if not start_date or not end_date:
            today = datetime.now().strftime("%Y-%m-%d")
            start_date = today
            end_date = today

        # Получаем свежие данные
        activities = await bitrix_service.get_activities(
            start_date=start_date,
            end_date=end_date,
            user_ids=target_user_ids
        )
        
        # Очищаем старый кэш и сохраняем новый
        if activities:
            await warehouse_service.cache_activities(activities)
            
            # Создаем снапшоты для каждого дня периода
            start = datetime.fromisoformat(start_date)
            end = datetime.fromisoformat(end_date)
            current = start
            
            snapshots_created = 0
            while current <= end:
                date_str = current.strftime("%Y-%m-%d")
                
                # Фильтруем активности за текущий день
                daily_activities = []
                for activity in activities:
                    try:
                        created_str = activity.get('CREATED', '').replace('Z', '+00:00')
                        activity_date = datetime.fromisoformat(created_str).strftime('%Y-%m-%d')
                        if activity_date == date_str:
                            daily_activities.append(activity)
                    except Exception:
                        continue
                
                # Создаем снапшот только если есть активности за этот день
                if daily_activities:
                    await warehouse_service.save_daily_snapshot_from_activities(
                        daily_activities, target_user_ids, date_str
                    )
                    snapshots_created += 1
                
                current += timedelta(days=1)
            
            return {
                "success": True, 
                "message": f"Cache refreshed with {len(activities)} activities",
                "period": f"{start_date} to {end_date}",
                "snapshots_created": snapshots_created,
                "activities_count": len(activities)
            }
        else:
            return {"success": False, "error": "No activities found"}
            
    except Exception as e:
        logger.error(f"Error refreshing cache: {e}")
        return {"success": False, "error": str(e)}

@app.post("/api/refresh-period-cache")
async def refresh_period_cache(
    start_date: str,
    end_date: str,
    user_ids: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Принудительное обновление кэша за период"""
    try:
        user_ids_list = user_ids.split(',') if user_ids else []
        presales_users = await bitrix_service.get_presales_users()
        if not presales_users:
            return {"success": False, "error": "Список сотрудников пуст"}

        target_user_ids = user_ids_list if user_ids_list else [str(u['ID']) for u in presales_users]

        # Получаем свежие данные
        activities = await bitrix_service.get_activities(
            start_date=start_date,
            end_date=end_date,
            user_ids=target_user_ids
        )
        
        # Сохраняем в кэш
        if activities:
            await warehouse_service.cache_activities(activities)
            
            # Создаем снапшоты для каждого дня периода
            start = datetime.fromisoformat(start_date)
            end = datetime.fromisoformat(end_date)
            current = start
            
            snapshots_created = 0
            while current <= end:
                date_str = current.strftime("%Y-%m-%d")
                
                # Фильтруем активности за текущий день
                daily_activities = []
                for activity in activities:
                    try:
                        created_str = activity.get('CREATED', '').replace('Z', '+00:00')
                        activity_date = datetime.fromisoformat(created_str).strftime('%Y-%m-%d')
                        if activity_date == date_str:
                            daily_activities.append(activity)
                    except Exception:
                        continue
                
                # Создаем снапшот только если есть активности за этот день
                if daily_activities:
                    await warehouse_service.save_daily_snapshot_from_activities(
                        daily_activities, target_user_ids, date_str
                    )
                    snapshots_created += 1
                
                current += timedelta(days=1)
            
            return {
                "success": True, 
                "message": f"Cache refreshed with {len(activities)} activities",
                "period": f"{start_date} to {end_date}",
                "snapshots_created": snapshots_created,
                "activities_count": len(activities)
            }
        else:
            return {"success": False, "error": "No activities found"}
            
    except Exception as e:
        logger.error(f"Error refreshing period cache: {e}")
        return {"success": False, "error": str(e)}

@app.get("/api/cache-status")
async def get_cache_status(
    start_date: str,
    end_date: str,
    user_ids: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Проверяет состояние кэша для периода"""
    try:
        user_ids_list = user_ids.split(',') if user_ids else []
        presales_users = await bitrix_service.get_presales_users()
        if not presales_users:
            return {"success": False, "error": "Список сотрудников пуст"}

        target_user_ids = user_ids_list if user_ids_list else [str(u['ID']) for u in presales_users]

        # Проверяем полноту кэша
        is_cached = await warehouse_service.is_period_cached(target_user_ids, start_date, end_date)
        
        # Получаем информацию о днях в кэше
        async with aiosqlite.connect(warehouse_service.db_path) as db:
            placeholders = ','.join('?' for _ in target_user_ids)
            query = f'''
                SELECT DISTINCT data_date 
                FROM activities_cache 
                WHERE user_id IN ({placeholders}) 
                AND data_date BETWEEN ? AND ?
                ORDER BY data_date
            '''
            params = target_user_ids + [start_date, end_date]
            cursor = await db.execute(query, params)
            cached_dates = [row[0] for row in await cursor.fetchall()]

        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
        total_days = (end - start).days + 1

        return {
            "success": True,
            "period": f"{start_date} to {end_date}",
            "total_days": total_days,
            "cached_days": len(cached_dates),
            "is_complete": is_cached,
            "cached_dates": cached_dates,
            "missing_days": total_days - len(cached_dates)
        }
            
    except Exception as e:
        logger.error(f"Error checking cache status: {e}")
        return {"success": False, "error": str(e)}

@app.post("/api/load-large-period")
async def load_large_period(
    start_date: str,
    end_date: str,
    user_ids: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Постепенная загрузка большого периода с прогрессом"""
    try:
        user_ids_list = user_ids.split(',') if user_ids else []
        presales_users = await bitrix_service.get_presales_users()
        if not presales_users:
            return {"success": False, "error": "Список сотрудников пуст"}

        user_info_map = {str(u['ID']): u for u in presales_users}
        target_user_ids = user_ids_list if user_ids_list else list(user_info_map.keys())

        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
        total_days = (end - start).days + 1

        # Разбиваем на недельные chunks
        chunk_size = 7
        current_start = start
        all_activities = []
        chunks_processed = 0

        while current_start <= end:
            current_end = min(current_start + timedelta(days=chunk_size - 1), end)
            chunk_start_str = current_start.strftime("%Y-%m-%d")
            chunk_end_str = current_end.strftime("%Y-%m-%d")

            logger.info(f"📅 Processing chunk {chunks_processed + 1}: {chunk_start_str} to {chunk_end_str}")

            # Получаем данные для chunk
            chunk_activities = await bitrix_service.get_activities(
                start_date=chunk_start_str,
                end_date=chunk_end_str,
                user_ids=target_user_ids
            )

            if chunk_activities:
                all_activities.extend(chunk_activities)
                # Кэшируем каждый chunk
                asyncio.create_task(warehouse_service.cache_activities(chunk_activities))

            chunks_processed += 1
            current_start = current_end + timedelta(days=1)

            # Небольшая пауза между chunks
            await asyncio.sleep(1)

        return {
            "success": True,
            "message": f"Large period loaded: {total_days} days in {chunks_processed} chunks",
            "activities_count": len(all_activities),
            "chunks_processed": chunks_processed
        }

    except Exception as e:
        logger.error(f"Error loading large period: {e}")
        return {"success": False, "error": str(e)}

@app.get("/api/debug/cache-coverage")
async def debug_cache_coverage(
    start_date: str = None, 
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Отладочная информация о покрытии кэша"""
    try:
        if not start_date or not end_date:
            # По умолчанию показываем последние 30 дней
            end_date = datetime.now().strftime("%Y-%m-%d")
            start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        
        presales_users = await bitrix_service.get_presales_users()
        target_user_ids = [str(u['ID']) for u in presales_users] if presales_users else []
        
        cache_info = await warehouse_service.get_cached_activities_optimized(
            target_user_ids, start_date, end_date
        )
        
        return {
            "success": True,
            "period": f"{start_date} to {end_date}",
            "cache_info": cache_info
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/stats/fast")
async def get_fast_stats(
    start_date: str,
    end_date: str,
    user_ids: str = None,
    activity_type: str = None,
    include_statistics: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """БЫСТРЫЙ эндпоинт - ТОЛЬКО из кэша, без запросов к Bitrix"""
    try:
        user_ids_list = user_ids.split(',') if user_ids else []
        activity_types = [activity_type] if activity_type else None
        presales_users = await bitrix_service.get_presales_users()
        if not presales_users:
            return {"success": False, "error": "Список сотрудников пуст"}

        user_info_map = {str(u['ID']): u for u in presales_users}
        target_user_ids = user_ids_list if user_ids_list else list(user_info_map.keys())

        logger.info(f"⚡ Fast stats: {start_date} to {end_date}, selected users: {len(target_user_ids)}")

        # 🔥 ИСПОЛЬЗУЕМ УПРОЩЕННЫЙ МЕТОД ДЛЯ ПРОВЕРКИ КЭША
        cache_analysis = await warehouse_service.get_cached_activities_simple(
            target_user_ids, start_date, end_date, activity_types
        )
        
        cached_activities = cache_analysis["activities"]
        completeness = cache_analysis["completeness"]

        # 🔥 ТОЛЬКО если данные полностью в кэше (>95%)
        if completeness >= 95.0:
            activities = cached_activities
            logger.info(f"⚡ Using cached data for {len(target_user_ids)} users: {completeness:.1f}% complete (required: 95.0%)")
            
            # --- Логика подсчета статистики из активностей ---
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
                "cache_used": True,
                "from_cache": True,
                "cache_completeness": completeness,
                "activities_count": len(activities),
                "start_date": start_date,
                "end_date": end_date
            }

            if include_statistics:
                # Используем существующий метод для статистики
                statistics = await bitrix_service.get_activity_statistics(
                    start_date=start_date,
                    end_date=end_date,
                    user_ids=target_user_ids
                )
                result["statistics"] = statistics

            return result
        else:
            # 🔥 Данных в кэше недостаточно
            return {
                "success": False,
                "from_cache": False,
                "cache_completeness": completeness,
                "error": f"Данные в кэше неполные ({completeness:.1f}%). Используйте загрузку из Bitrix."
            }
        
    except Exception as e:
        logger.error(f"❌ Error in get_fast_stats: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}

async def get_deals(
    self,
    start_date: str = None,
    end_date: str = None,
    user_ids: List[str] = None,
    limit: int = None
) -> Optional[List[Dict]]:
    """Получение списка сделок - УЛУЧШЕННАЯ ВЕРСИЯ"""
    try:
        all_deals = []
        start = 0
        batch_size = 50
        
        while True:
            params = {
                'select[]': ['ID', 'TITLE', 'STAGE_ID', 'ASSIGNED_BY_ID', 'DATE_CREATE', 'DATE_MODIFY', 'OPPORTUNITY', 'CURRENCY_ID', 'TYPE_ID', 'STATUS_ID'],
                'start': start
            }

            # Фильтрация по дате
            if start_date and end_date:
                try:
                    start_date_obj = datetime.fromisoformat(start_date)
                    end_date_obj = datetime.fromisoformat(end_date)
                    params['filter[>=DATE_CREATE]'] = start_date_obj.strftime("%Y-%m-%d")
                    params['filter[<=DATE_CREATE]'] = end_date_obj.strftime("%Y-%m-%d")
                except Exception as e:
                    logger.error(f"Error parsing dates: {e}")

            # Фильтрация по пользователям
            if user_ids:
                params['filter[ASSIGNED_BY_ID]'] = user_ids

            deals = await self.make_bitrix_request("crm.deal.list", params)
            if not deals:
                break

            all_deals.extend(deals)
            logger.info(f"📊 Batch {start//50 + 1}: got {len(deals)} deals, total: {len(all_deals)}")

            if len(deals) < 50:
                break
                
            if limit and len(all_deals) >= limit:
                all_deals = all_deals[:limit]
                break
                
            if len(all_deals) >= 1000:
                logger.warning("⚠️ Reached maximum deals limit (1000)")
                break

            start += 50
            await asyncio.sleep(0.1)

        logger.info(f"📊 Total deals loaded: {len(all_deals)}")

        # Получаем ВСЕ типы стадий
        all_stages = await self.get_deal_stages()
        
        # Создаем карту для всех возможных ID стадий
        stage_map = {}
        for stage in all_stages:
            stage_id = stage.get('STATUS_ID')
            stage_map[stage_id] = stage
        
        # 🔥 УЛУЧШЕННОЕ СОПОСТАВЛЕНИЕ СТАДИЙ
        enriched_deals = []
        for deal in all_deals:
            stage_id = deal.get('STAGE_ID')
            type_id = deal.get('TYPE_ID')
            status_id = deal.get('STATUS_ID')
            
            # Пробуем найти стадию в порядке приоритета
            stage_info = None
            for potential_id in [stage_id, type_id, status_id]:
                if potential_id and potential_id in stage_map:
                    stage_info = stage_map[potential_id]
                    break
            
            # Если не нашли, создаем базовую информацию
            if not stage_info:
                stage_info = {
                    'NAME': stage_id or 'Неизвестно',
                    'COLOR': '#cccccc'
                }
            
            enriched_deals.append({
                'ID': deal.get('ID'),
                'TITLE': deal.get('TITLE'),
                'STAGE_ID': stage_id,
                'TYPE_ID': type_id,
                'STATUS_ID': status_id,
                'STAGE_NAME': stage_info.get('NAME', 'Неизвестно'),
                'STAGE_COLOR': stage_info.get('COLOR', '#cccccc'),
                'ENTITY_ID': stage_info.get('ENTITY_ID', 'UNKNOWN'),
                'ASSIGNED_BY_ID': deal.get('ASSIGNED_BY_ID'),
                'DATE_CREATE': deal.get('DATE_CREATE'),
                'DATE_MODIFY': deal.get('DATE_MODIFY'),
                'OPPORTUNITY': deal.get('OPPORTUNITY'),
                'CURRENCY_ID': deal.get('CURRENCY_ID')
            })

        # Логируем распределение по стадиям
        stage_distribution = {}
        for deal in enriched_deals:
            stage_name = deal['STAGE_NAME']
            stage_distribution[stage_name] = stage_distribution.get(stage_name, 0) + 1
        
        logger.info(f"📊 Stage distribution: {stage_distribution}")

        return enriched_deals

    except Exception as e:
        logger.error(f"Error getting deals: {str(e)}")
        return None
    
@app.get("/api/all-users")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    """Получение списка всех пользователей - ИСПОЛЬЗУЕТ КЭШ"""
    try:
        users = await bitrix_service.get_all_users()  # 🔥 ЭТОТ МЕТОД УЖЕ КЭШИРУЕТ
        if not users:
            return {"users": []}
        formatted = [{"ID": str(u['ID']), "NAME": u.get('NAME', ''), "LAST_NAME": u.get('LAST_NAME', '')} for u in users]
        return {"users": formatted}
    except Exception as e:
        logger.error(f"Error in all-users: {str(e)}")
        return {"users": [], "error": str(e)}

@app.get("/api/deals/stats")
async def get_deals_stats(
    start_date: str = None,
    end_date: str = None,
    user_ids: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Получение статистики по сделкам"""
    try:
        logger.info(f"🔍 GET /api/deals/stats called with: start_date={start_date}, end_date={end_date}, user_ids={user_ids}")
        
        user_ids_list = user_ids.split(',') if user_ids else []
        stats = await bitrix_service.get_deals_statistics(
            start_date=start_date,
            end_date=end_date,
            user_ids=user_ids_list
        )
        
        logger.info(f"✅ GET /api/deals/stats returning stats: {stats.keys() if stats else 'empty'}")
        
        return {
            "success": True,
            "stats": stats
        }
    except Exception as e:
        logger.error(f"❌ Error in get_deals_stats: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}

@app.get("/api/deals/stages")
async def get_deals_stages(current_user: dict = Depends(get_current_user)):
    """Получение списка стадий сделок"""
    try:
        stages = await bitrix_service.get_deal_stages()
        return {
            "success": True,
            "stages": stages
        }
    except Exception as e:
        logger.error(f"❌ Error in get_deals_stages: {str(e)}")
        return {"success": False, "error": str(e)}


@app.get("/api/deals/user-all")
async def get_user_all_deals(
    user_ids: str,
    current_user: dict = Depends(get_current_user)
):
    """Получение ВСЕХ сделок сотрудников (без ограничения даты)"""
    try:
        user_ids_list = user_ids.split(',')
        logger.info(f"🔍 GET /api/deals/user-all for users: {user_ids_list}")
        
        # 🔥 БЕЗ ФИЛЬТРА ПО ДАТЕ - все сделки сотрудников
        deals = await bitrix_service.get_deals(
            user_ids=user_ids_list,
            limit=500  # Лимит на все сделки
        )
        
        logger.info(f"✅ GET /api/deals/user-all returning {len(deals) if deals else 0} deals")
        
        return {
            "success": True,
            "deals": deals,
            "count": len(deals) if deals else 0,
            "users": user_ids_list
        }
    except Exception as e:
        logger.error(f"❌ Error in get_user_all_deals: {str(e)}")
        return {"success": False, "error": str(e)}


@app.get("/api/deals/debug-stages")
async def debug_deal_stages(current_user: dict = Depends(get_current_user)):
    """Отладочный эндпоинт для проверки стадий сделок"""
    try:
        stages = await bitrix_service.get_deal_stages()
        
        # Группируем по типам
        stages_by_type = {}
        for stage in stages:
            entity_id = stage.get('ENTITY_ID', 'UNKNOWN')
            if entity_id not in stages_by_type:
                stages_by_type[entity_id] = []
            stages_by_type[entity_id].append({
                'id': stage.get('STATUS_ID'),
                'name': stage.get('NAME'),
                'color': stage.get('COLOR'),
                'entity_id': entity_id
            })
        
        return {
            "success": True,
            "stages_by_type": stages_by_type,
            "total_stages": len(stages)
        }
    except Exception as e:
        logger.error(f"❌ Error in debug_deal_stages: {str(e)}")
        return {"success": False, "error": str(e)}


@app.get("/api/deals/list")
async def get_deals_list(
    start_date: str = None,
    end_date: str = None,
    user_ids: str = None,
    limit: int = None,  # 🔥 ДОБАВЛЕН ПАРАМЕТР
    current_user: dict = Depends(get_current_user)
):
    """Получение списка сделок С ЛИМИТОМ"""
    try:
        logger.info(f"🔍 GET /api/deals/list called with: start_date={start_date}, end_date={end_date}, user_ids={user_ids}, limit={limit}")
        
        user_ids_list = user_ids.split(',') if user_ids else []
        deals = await bitrix_service.get_deals(
            start_date=start_date,
            end_date=end_date,
            user_ids=user_ids_list,
            limit=limit  # 🔥 ПЕРЕДАЕМ ЛИМИТ
        )
        
        logger.info(f"✅ GET /api/deals/list returning {len(deals) if deals else 0} deals")
        
        return {
            "success": True,
            "deals": deals,
            "count": len(deals) if deals else 0
        }
    except Exception as e:
        logger.error(f"❌ Error in get_deals_list: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/api/stats/super-fast")
async def get_super_fast_stats(
    start_date: str,
    end_date: str,
    user_ids: str = None,
    activity_type: str = None,
    current_user: dict = Depends(get_current_user)
):
    """СУПЕР-БЫСТРЫЙ эндпоинт - ТОЛЬКО из кэша, НИКАКИХ запросов к Bitrix"""
    try:
        user_ids_list = user_ids.split(',') if user_ids else []
        activity_types = [activity_type] if activity_type else None
        presales_users = await bitrix_service.get_presales_users()
        if not presales_users:
            return {"success": False, "error": "Список сотрудников пуст"}

        user_info_map = {str(u['ID']): u for u in presales_users}
        target_user_ids = user_ids_list if user_ids_list else list(user_info_map.keys())

        logger.info(f"🚀 SUPER-FAST stats: {start_date} to {end_date}, users: {len(target_user_ids)}")

        # 🔥 ПРЯМОЙ ДОСТУП К КЭШУ - НИКАКОЙ СЛОЖНОЙ ЛОГИКИ
        cache_result = await warehouse_service.get_cached_activities_direct(
            target_user_ids, start_date, end_date, activity_types
        )
        
        activities = cache_result["activities"]
        completeness = cache_result["completeness"]

        # 🔥 ВСЕГДА возвращаем данные из кэша, даже если они неполные
        if activities:
            logger.info(f"🚀 Using cached data: {len(activities)} activities ({completeness:.1f}% work days complete)")
            
            # --- Логика подсчета статистики из активностей ---
            user_activities = {}
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
                "cache_used": True,
                "from_cache": True,
                "cache_completeness": completeness,
                "activities_count": len(activities),
                "start_date": start_date,
                "end_date": end_date,
                "note": "Данные загружены из кэша. Для полных данных используйте загрузку из Bitrix."
            }

            # Статистика для графиков (тоже из кэша)
            if activities:
                result["statistics"] = await bitrix_service.get_activity_statistics_from_activities(
                    activities, start_date, end_date
                )

            return result
        else:
            # 🔥 Если в кэше вообще нет данных
            return {
                "success": False,
                "from_cache": True,
                "cache_completeness": 0,
                "error": "В кэше нет данных за выбранный период. Используйте загрузку из Bitrix."
            }
        
    except Exception as e:
        logger.error(f"❌ Error in get_super_fast_stats: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)