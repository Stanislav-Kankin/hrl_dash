import aiohttp
import os
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import logging
import asyncio

logger = logging.getLogger(__name__)


class BitrixService:
    def __init__(self):
        self.webhook_url = os.getenv("BITRIX_WEBHOOK_URL")
        self.session = None
        self._cache = {}
        self._cache_ttl = 30  # кэш 30 секунд вместо 10 — меньше запросов

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
        try:
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    if 'result' in data:
                        return data['result']
                    elif 'error' in data:
                        logger.error(f"Bitrix API error: {data['error']}")
                        return None
                else:
                    logger.error(f"HTTP error {response.status} for {url}")
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

    async def get_users(self, only_active: bool = True) -> Optional[List[Dict]]:
        """Получает список пользователей"""
        try:
            params = {}
            if only_active:
                params['ACTIVE'] = 'true'
            users = await self.make_bitrix_request("user.get", params)
            return users
        except Exception as e:
            logger.error(f"Error getting users: {str(e)}")
            return None

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

            # Жестко заданные ID пресейл-сотрудников
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
            # Формируем ключ кэша
            user_key = "-".join(sorted(user_ids)) if user_ids else "all"
            type_key = "-".join(sorted(activity_types)) if activity_types else "all"
            cache_key = f"activities_{start_date}_{end_date}_{user_key}_{type_key}"
            if cache_key in self._cache:
                cache_time, cached_data = self._cache[cache_key]
                if cached_data is not None and (datetime.now() - cache_time).total_seconds() < self._cache_ttl:
                    logger.info(f"Using cached activities ({len(cached_data)} items)")
                    return cached_data

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
                # По умолчанию — 30 дней
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

            all_activities = []
            start = 0
            request_count = 0
            max_requests = 50  # на случай большого объёма

            while request_count < max_requests:
                params = {
                    'filter[>=CREATED]': start_date_str,
                    'filter[<=CREATED]': end_date_str,
                    'start': start,
                    'order[CREATED]': 'DESC',
                    'select[]': ['ID', 'CREATED', 'AUTHOR_ID', 'DESCRIPTION', 'TYPE_ID', 'SUBJECT', 'PROVIDER_ID']
                }

                if final_user_ids:
                    params['filter[AUTHOR_ID]'] = final_user_ids
                if activity_types:
                    params['filter[TYPE_ID]'] = activity_types

                activities = await self.make_bitrix_request("crm.activity.list", params)
                if activities is None:
                    break
                if not activities:
                    break

                all_activities.extend(activities)
                if len(activities) < 50:
                    break

                start += 50
                request_count += 1
                await asyncio.sleep(0.1)

            self._cache[cache_key] = (datetime.now(), all_activities)
            return all_activities

        except Exception as e:
            logger.error(f"Error in get_activities: {str(e)}")
            return None

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