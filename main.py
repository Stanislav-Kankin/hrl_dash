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

bitrix_service = BitrixService()

current_dir = os.path.dirname(os.path.abspath(__file__))
app.mount("/static", StaticFiles(directory="app/static"), name="static")

class EmailRequest(BaseModel):
    email: str

# === Аутентификация ===
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

# === Публичные эндпоинты ===
@app.get("/", response_class=HTMLResponse)
async def read_root():
    return FileResponse("app/main.html")

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat(), "version": "1.0"}

@app.get("/api/users-list")
async def get_users_list():
    try:
        users = await bitrix_service.get_presales_users()
        if not users:
            return {"users": []}
        formatted = [{"ID": str(u['ID']), "NAME": u.get('NAME', ''), "LAST_NAME": u.get('LAST_NAME', ''), "WORK_POSITION": u.get('WORK_POSITION', '')} for u in users]
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
    include_statistics: bool = True
):
    try:
        user_ids_list = user_ids.split(',') if user_ids else []
        activity_types = [activity_type] if activity_type else None

        presales_users = await bitrix_service.get_presales_users()
        if not presales_users:
            return {"success": False, "error": "Список сотрудников пуст"}

        user_info_map = {str(u['ID']): u for u in presales_users}
        target_user_ids = user_ids_list if user_ids_list else list(user_info_map.keys())

        activities = await bitrix_service.get_activities(
            start_date=start_date,
            end_date=end_date,
            user_ids=target_user_ids,
            activity_types=activity_types
        )

        user_activities = {}
        if activities:
            for act in activities:
                uid = str(act['AUTHOR_ID'])
                if uid not in user_activities:
                    user_activities[uid] = []
                user_activities[uid].append(act)

        # === ВАЖНО: Отображаем ТОЛЬКО запрошенных пользователей ===
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

        total_activities = len(activities) if activities else 0
        result = {
            "success": True,
            "user_stats": user_stats,
            "total_activities": total_activities,
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

# Админ-эндпоинты
@app.get("/api/admin/allowed-emails")
async def get_allowed_emails(current_user: dict = Depends(get_current_admin)):
    return {"allowed_emails": auth_service.get_allowed_emails()}

@app.post("/api/admin/add-allowed-email")
async def add_allowed_email(request: EmailRequest, current_user: dict = Depends(get_current_admin)):
    auth_service.add_allowed_email(request.email)
    return {"message": f"Email {request.email} добавлен"}

@app.post("/api/admin/remove-allowed-email")
async def remove_allowed_email(request: EmailRequest, current_user: dict = Depends(get_current_admin)):
    auth_service.remove_allowed_email(request.email)
    return {"message": f"Email {request.email} удален"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)