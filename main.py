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
app.mount("/static", StaticFiles(directory="app/static"), name="static")


class EmailRequest(BaseModel):
    email: str


# === Аутентификация ===
@app.post("/api/auth/register", response_model=UserResponse)
async def register(user_data: UserRegister):
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
    return current_user


# === Публичные эндпоинты ===
@app.get("/", response_class=HTMLResponse)
async def read_root():
    return FileResponse("app/main.html")


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0"
    }


@app.get("/api/users-list")
async def get_users_list():
    """Список сотрудников для фильтров"""
    try:
        users = await bitrix_service.get_presales_users()
        if not users:
            logger.warning("⚠️ No presales users found in get_users_list")
            return {"users": []}
        formatted_users = []
        for user in users:
            formatted_users.append({
                "ID": str(user['ID']),
                "NAME": user.get('NAME', ''),
                "LAST_NAME": user.get('LAST_NAME', ''),
                "WORK_POSITION": user.get('WORK_POSITION', ''),
                "EMAIL": user.get('EMAIL', '')
            })
        logger.info(f"✅ Returning {len(formatted_users)} presales users")
        return {
            "users": formatted_users,
            "total_presales_users": len(formatted_users),
            "message": f"Найдено {len(formatted_users)} сотрудников пресейла"
        }
    except Exception as e:
        logger.error(f"Error in users-list: {str(e)}", exc_info=True)
        return {"users": [], "error": str(e)}


@app.get("/api/stats/detailed")
async def get_detailed_stats(
    days: int = None,
    start_date: str = None,
    end_date: str = None,
    user_ids: str = None,
    activity_type: str = None,
    include_statistics: bool = True,  # ВСЕГДА True для дашборда
    include_activities: bool = False
):
    try:
        user_ids_list = user_ids.split(',') if user_ids else []
        activity_types = [activity_type] if activity_type else None
        logger.info(f"📥 Fetching stats: start_date={start_date}, end_date={end_date}, users={user_ids_list}")

        # Получаем ВСЕХ пресейл-сотрудников — даже если user_ids пустой
        presales_users = await bitrix_service.get_presales_users()
        if not presales_users:
            logger.error("❌ No presales users available — cannot proceed")
            return {
                "success": False,
                "error": "Список сотрудников пресейла пуст"
            }

        user_info_map = {str(user['ID']): user for user in presales_users}
        logger.info(f"👥 Presales user IDs: {list(user_info_map.keys())}")

        # Получаем активности — если user_ids заданы, фильтруем по ним, иначе по всем пресейл-пользователям
        target_user_ids = user_ids_list if user_ids_list else list(user_info_map.keys())
        logger.info(f"🔍 Target user IDs for activities: {target_user_ids}")

        activities = await bitrix_service.get_activities(
            start_date=start_date,
            end_date=end_date,
            user_ids=target_user_ids,
            activity_types=activity_types
        )

        # Группируем активности по пользователям
        user_activities = {}
        if activities:
            for activity in activities:
                user_id = str(activity['AUTHOR_ID'])
                if user_id not in user_activities:
                    user_activities[user_id] = []
                user_activities[user_id].append(activity)

            logger.info(f"📊 Activities found for users: {list(user_activities.keys())}")

        # Формируем статистику для ВСЕХ 6 сотрудников (даже без активностей)
        user_stats = []
        active_user_ids = set()
        for user_id, user_info in user_info_map.items():
            user_acts = user_activities.get(user_id, [])
            calls = len([a for a in user_acts if str(a['TYPE_ID']) == '2'])
            comments = len([a for a in user_acts if str(a['TYPE_ID']) == '6'])
            tasks = len([a for a in user_acts if str(a['TYPE_ID']) == '4'])
            meetings = len([a for a in user_acts if str(a['TYPE_ID']) == '1'])
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

            user_stats.append({
                "user_id": user_id,
                "user_name": f"{user_info.get('NAME', '')} {user_info.get('LAST_NAME', '')}".strip(),
                "calls": calls,
                "comments": comments,
                "tasks": tasks,
                "meetings": meetings,
                "total": total,
                "days_count": len(activity_dates),
                "last_activity_date": last_activity.strftime('%Y-%m-%d %H:%M') if last_activity else "Нет данных"
            })

        total_activities = len(activities) if activities else 0
        result = {
            "success": True,
            "user_stats": user_stats,
            "total_activities": total_activities,
            "active_users": len(active_user_ids),
            "date_range": {
                "start": start_date,
                "end": end_date
            } if start_date and end_date else None
        }

        # ВСЕГДА добавляем статистику для графиков
        statistics = await bitrix_service.get_activity_statistics(
            start_date=start_date,
            end_date=end_date,
            user_ids=target_user_ids
        )
        result["statistics"] = statistics

        logger.info(f"✅ Returning {len(user_stats)} users, {total_activities} activities, graphs will work")
        return result

    except Exception as e:
        logger.error(f"❌ Error in get_detailed_stats: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}


# === Отладочные и служебные эндпоинты ===
@app.get("/api/connection-test")
async def test_connection():
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


@app.get("/api/debug/presales-users")
async def debug_presales_users():
    try:
        presales_users = await bitrix_service.get_presales_users()
        if not presales_users:
            return {"error": "No presales users returned"}
        return {
            "count": len(presales_users),
            "users": [
                {"ID": str(u['ID']), "NAME": u.get('NAME'), "LAST_NAME": u.get('LAST_NAME')}
                for u in presales_users
            ]
        }
    except Exception as e:
        logger.error(f"Debug presales error: {str(e)}")
        return {"error": str(e)}


@app.get("/api/clear-cache")
async def clear_cache(current_user: dict = Depends(get_current_user)):
    try:
        bitrix_service.clear_cache()
        return {"success": True, "message": "Cache cleared"}
    except Exception as e:
        logger.error(f"Error clearing cache: {str(e)}")
        return {"success": False, "error": str(e)}


@app.get("/api/user-activities/{user_id}")
async def get_user_activities(
    user_id: str,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    try:
        activities = await bitrix_service.get_activities(
            start_date=start_date,
            end_date=end_date,
            user_ids=[user_id]
        )
        formatted_activities = []
        if activities:
            for activity in activities[:200]:
                formatted_activities.append({
                    "ID": activity.get("ID"),
                    "CREATED": activity.get("CREATED"),
                    "AUTHOR_ID": activity.get("AUTHOR_ID"),
                    "TYPE_ID": activity.get("TYPE_ID"),
                    "DESCRIPTION": (activity.get("DESCRIPTION") or "")[:300],
                    "SUBJECT": activity.get("SUBJECT"),
                    "PROVIDER_ID": activity.get("PROVIDER_ID")
                })
        return {
            "success": True,
            "user_id": user_id,
            "activities_count": len(activities) if activities else 0,
            "activities_returned": len(formatted_activities),
            "activities": formatted_activities
        }
    except Exception as e:
        logger.error(f"Error in user-activities: {str(e)}")
        return {"success": False, "error": str(e)}


# Админ-эндпоинты (оставлены без изменений)
@app.get("/api/admin/allowed-emails")
async def get_allowed_emails(current_user: dict = Depends(get_current_admin)):
    return {"allowed_emails": auth_service.get_allowed_emails()}


@app.post("/api/admin/add-allowed-email")
async def add_allowed_email(request: EmailRequest, current_user: dict = Depends(get_current_admin)):
    auth_service.add_allowed_email(request.email)
    return {"message": f"Email {request.email} добавлен в разрешенные"}


@app.post("/api/admin/remove-allowed-email")
async def remove_allowed_email(request: EmailRequest, current_user: dict = Depends(get_current_admin)):
    auth_service.remove_allowed_email(request.email)
    return {"message": f"Email {request.email} удален из разрешенных"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)