import aiohttp
import os
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import logging
import asyncio
import hashlib

logger = logging.getLogger(__name__)

class BitrixService:
    def __init__(self):
        self.webhook_url = os.getenv("BITRIX_WEBHOOK_URL")
        self.session = None
        self._cache = {}
        self._cache_ttl = 30  # кэш 30 секунд

    async def ensure_session(self):
        """Создает сессию если её нет"""
        if self.session is None or self.session.closed:
            timeout = aiohttp.ClientTimeout(total=30)
            self.session = aiohttp.ClientSession(timeout=timeout)

    async def close_session(self):
        """Закрывает сессию"""
        if self.session and not self.session.closed:
            await self.session.close()
            self.session = None

    async def make_bitrix_request(self, method: str, params: Dict = None) -> Optional[Dict]:
        """Выполняет запрос к Bitrix24 API"""
        if not self.webhook_url:
            logger.error("BITRIX_WEBHOOK_URL не настроен")
            return None

        await self.ensure_session()
        url = f"{self.webhook_url}/{method}"
        
        # 🔥 Логируем параметры запроса
        logger.info(f"🔍 Bitrix API Request: {method}")
        logger.info(f"🔍 URL: {url}")
        if params:
            logger.info(f"🔍 Params keys: {list(params.keys())}")
            if 'filter[AUTHOR_ID]' in params:
                logger.info(f"🔍 AUTHOR_ID filter: {params['filter[AUTHOR_ID]']}")
        
        try:
            async with self.session.get(url, params=params) as response:
                logger.info(f"🔍 Response status: {response.status}")
                if response.status == 200:
                    data = await response.json()
                    if 'result' in data:
                        logger.info(f"🔍 Bitrix API Success: got {len(data['result'])} results")
                        return data['result']
                    elif 'error' in data:
                        logger.error(f"Bitrix API error: {data['error']}")
                        return None
                else:
                    error_text = await response.text()
                    logger.error(f"HTTP error {response.status} for {url}: {error_text}")
                    return None
        except asyncio.TimeoutError:
            logger.error(f"Timeout error for method {method}")
            return None
        except Exception as e:
            logger.error(f"Request error: {str(e)}")
            return None

    async def test_connection(self) -> bool:
        """Проверяет подключение к Bitrix24"""
        try:
            result = await self.make_bitrix_request("user.current")
            return result is not None
        except Exception as e:
            logger.error(f"Connection test failed: {str(e)}")
            return False

    async def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        """Получить пользователя по ID"""
        try:
            params = {'ID': user_id}
            users = await self.make_bitrix_request("user.get", params)
            return users[0] if users and len(users) > 0 else None
        except Exception as e:
            logger.error(f"Error getting user by ID {user_id}: {str(e)}")
            return None

    async def get_presales_users(self) -> Optional[List[Dict]]:
        """Получает список сотрудников пресейла по жёстко заданным ID с кэшированием"""
        try:
            cache_key = "presales_users"
            if cache_key in self._cache:
                cache_time, cached_data = self._cache[cache_key]
                if (datetime.now() - cache_time).total_seconds() < self._cache_ttl:
                    return cached_data

            known_presales_ids = ['8860', '8988', '17087', '17919', '17395', '18065']
            presales_users = []
            for user_id in known_presales_ids:
                user = await self.get_user_by_id(user_id)
                if user:
                    presales_users.append(user)
                else:
                    logger.warning(f"Presales user ID {user_id} not found in Bitrix24")

            self._cache[cache_key] = (datetime.now(), presales_users)
            return presales_users
        except Exception as e:
            logger.error(f"Error in get_presales_users: {str(e)}")
            return None

    async def get_activities(
        self,
        days: int = None,
        start_date: str = None,
        end_date: str = None,
        user_ids: List[str] = None,
        activity_types: List[str] = None
    ) -> Optional[List[Dict]]:
        try:
            # Определяем диапазон дат
            if start_date and end_date:
                start_date_obj = datetime.fromisoformat(start_date)
                end_date_obj = datetime.fromisoformat(end_date)
                start_date_obj = start_date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = end_date_obj.replace(hour=23, minute=59, second=59, microsecond=999999)
            elif days:
                end_date_obj = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
                start_date_obj = (end_date_obj - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
            else:
                end_date_obj = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
                start_date_obj = (end_date_obj - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)

            start_date_str = start_date_obj.strftime("%Y-%m-%dT%H:%M:%S")
            end_date_str = end_date_obj.strftime("%Y-%m-%dT%H:%M:%S")

            # Определяем, по каким пользователям фильтровать
            final_user_ids = None
            if user_ids and user_ids != ["all"]:
                final_user_ids = [str(uid) for uid in user_ids]
            else:
                presales = await self.get_presales_users()
                if presales:
                    final_user_ids = [str(user["ID"]) for user in presales]

            logger.info(f"🔍 get_activities: user_ids={final_user_ids}, start_date={start_date_str}, end_date={end_date_str}")

            # 🔥 ИСПРАВЛЕНИЕ: делаем отдельные запросы для каждого пользователя
            all_activities = []
            
            if final_user_ids:
                for user_id in final_user_ids:
                    user_activities = await self._get_activities_for_single_user(
                        user_id, start_date_str, end_date_str, activity_types
                    )
                    if user_activities:
                        all_activities.extend(user_activities)
                        logger.info(f"🔍 User {user_id}: got {len(user_activities)} activities")

            # 🔥 ДИАГНОСТИКА: логируем финальные результаты
            logger.info(f"📊 FINAL ACTIVITIES COUNT: {len(all_activities)}")
            logger.info(f"📊 User IDs requested: {user_ids}")
            logger.info(f"📊 Date range: {start_date_str} to {end_date_str}")

            # Проверим распределение по пользователям
            if all_activities:
                user_distribution = {}
                for act in all_activities:
                    user_id = str(act.get('AUTHOR_ID', ''))
                    user_distribution[user_id] = user_distribution.get(user_id, 0) + 1
                logger.info(f"📊 Activities by user: {user_distribution}")
            else:
                logger.info("📊 No activities found")

            return all_activities

        except Exception as e:
            logger.error(f"Error in get_activities: {str(e)}")
            return None
        
    async def _get_activities_for_single_user(
        self, 
        user_id: str, 
        start_date_str: str, 
        end_date_str: str, 
        activity_types: List[str] = None
    ) -> List[Dict]:
        """Получает активности для одного пользователя"""
        user_activities = []
        start = 0
        request_count = 0
        max_requests = 10  # Ограничим для безопасности

        while request_count < max_requests:
            params = {
                'filter[>=CREATED]': start_date_str,
                'filter[<=CREATED]': end_date_str,
                'filter[AUTHOR_ID]': user_id,
                'start': start,
                'order[CREATED]': 'DESC',
                'select[]': ['ID', 'CREATED', 'AUTHOR_ID', 'DESCRIPTION', 'TYPE_ID', 'SUBJECT', 'PROVIDER_ID']
            }

            if activity_types:
                params['filter[TYPE_ID]'] = activity_types

            activities = await self.make_bitrix_request("crm.activity.list", params)
            if activities is None:
                break
            if not activities:
                break

            user_activities.extend(activities)
            logger.info(f"🔍 User {user_id} - Batch {request_count + 1}: got {len(activities)} activities, total: {len(user_activities)}")

            if len(activities) < 50:
                logger.info(f"🔍 User {user_id} - Last batch had {len(activities)} items, stopping pagination.")
                break

            start += 50
            request_count += 1
            await asyncio.sleep(0.1)  # Небольшая пауза между запросами

        return user_activities

    async def get_activity_statistics(
        self,
        days: int = None,
        start_date: str = None,
        end_date: str = None,
        user_ids: List[str] = None
    ) -> Dict[str, Any]:
        activities = await self.get_activities(days=days, start_date=start_date, end_date=end_date, user_ids=user_ids)
        if not activities:
            return {}

        daily_stats = {}
        hourly_stats = {str(i).zfill(2): 0 for i in range(24)}
        type_stats = {}
        weekday_stats = {
            'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0,
            'Friday': 0, 'Saturday': 0, 'Sunday': 0
        }

        for activity in activities:
            created_str = activity['CREATED'].replace('Z', '+00:00')
            activity_date = datetime.fromisoformat(created_str)
            date_key = activity_date.strftime('%Y-%m-%d')
            hour_key = activity_date.strftime('%H')
            weekday = activity_date.strftime('%A')
            type_id = str(activity['TYPE_ID'])

            if date_key not in daily_stats:
                daily_stats[date_key] = {'date': date_key, 'day_of_week': weekday, 'total': 0, 'by_type': {}}

            daily_stats[date_key]['total'] += 1
            daily_stats[date_key]['by_type'][type_id] = daily_stats[date_key]['by_type'].get(type_id, 0) + 1
            type_stats[type_id] = type_stats.get(type_id, 0) + 1
            hourly_stats[hour_key] += 1
            weekday_stats[weekday] += 1

        sorted_daily = sorted(daily_stats.values(), key=lambda x: x['date'])

        return {
            'total_activities': len(activities),
            'daily_stats': sorted_daily,
            'hourly_stats': hourly_stats,
            'type_stats': type_stats,
            'weekday_stats': weekday_stats,
            'date_range': {
                'start': sorted_daily[0]['date'] if sorted_daily else '',
                'end': sorted_daily[-1]['date'] if sorted_daily else ''
            }
        }

    def clear_cache(self):
        """Очищает кэш"""
        self._cache.clear()
        logger.info("Cache cleared")