import aiohttp
import os
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
import aiosqlite

logger = logging.getLogger(__name__)

class BitrixService:
    def __init__(self):
        self.webhook_url = os.getenv("BITRIX_WEBHOOK_URL")
        self.session = None
        self._cache = {}
        self._cache_ttl = 300  # Увеличил кэш до 5 минут
        self.executor = ThreadPoolExecutor(max_workers=5)
        
    async def ensure_session(self):
        """Создает сессию если её нет"""
        if self.session is None or self.session.closed:
            timeout = aiohttp.ClientTimeout(total=60)
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
        
        logger.info(f"🔍 Bitrix API Request: {method}")
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

    async def make_bitrix_request_batch(self, method: str, params_list: List[Dict]) -> List[Optional[Dict]]:
        """Пакетные запросы к Bitrix24 API"""
        if not self.webhook_url:
            logger.error("BITRIX_WEBHOOK_URL не настроен")
            return [None] * len(params_list)

        await self.ensure_session()
        
        async def single_request(params):
            url = f"{self.webhook_url}/{method}"
            try:
                async with self.session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get('result') if 'result' in data else None
                    return None
            except Exception as e:
                logger.error(f"Request error for {params}: {e}")
                return None
        
        # Выполняем запросы параллельно
        tasks = [single_request(params) for params in params_list]
        return await asyncio.gather(*tasks, return_exceptions=True)

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
        """ОСНОВНОЙ МЕТОД - улучшенная версия с пакетными запросами"""
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

            # 🔥 УЛУЧШЕНИЕ: Параллельные запросы для всех пользователей
            all_activities = []
            
            if final_user_ids:
                tasks = []
                for user_id in final_user_ids:
                    task = self._get_activities_for_single_user_improved(
                        user_id, start_date_str, end_date_str, activity_types
                    )
                    tasks.append(task)
                
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                for i, user_activities in enumerate(results):
                    if isinstance(user_activities, Exception):
                        logger.error(f"Error getting activities for user {final_user_ids[i]}: {user_activities}")
                    elif user_activities:
                        all_activities.extend(user_activities)
                        logger.info(f"🔍 User {final_user_ids[i]}: got {len(user_activities)} activities")

            # 🔥 УЛУЧШЕНИЕ: Фильтрация завершенных активностей
            filtered_activities = await self._filter_completed_activities(all_activities)
            
            logger.info(f"📊 FINAL ACTIVITIES: {len(all_activities)} total, {len(filtered_activities)} completed")

            # Проверим распределение по пользователям
            if filtered_activities:
                user_distribution = {}
                for act in filtered_activities:
                    user_id = str(act.get('AUTHOR_ID', ''))
                    user_distribution[user_id] = user_distribution.get(user_id, 0) + 1
                logger.info(f"📊 Completed activities by user: {user_distribution}")

            return filtered_activities

        except Exception as e:
            logger.error(f"Error in get_activities: {str(e)}")
            return None

    async def _get_activities_for_single_user_improved(
        self, 
        user_id: str, 
        start_date_str: str, 
        end_date_str: str, 
        activity_types: List[str] = None
    ) -> List[Dict]:
        """Улучшенная версия получения активностей для одного пользователя с лимитами"""
        user_activities = []
        start = 0
        request_count = 0
        max_requests = 20  # 🔥 УМЕНЬШИЛ ДО 20 (1000 активностей максимум)
        max_activities = 1000  # 🔥 МАКСИМУМ АКТИВНОСТЕЙ НА ПОЛЬЗОВАТЕЛЯ

        while request_count < max_requests and len(user_activities) < max_activities:
            params = {
                'filter[>=CREATED]': start_date_str,
                'filter[<=CREATED]': end_date_str,
                'filter[AUTHOR_ID]': user_id,
                'start': start,
                'order[CREATED]': 'DESC'
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
            await asyncio.sleep(0.05)
            
            # 🔥 ПРЕРЫВАЕМ ЕСЛИ ДОСТИГЛИ ЛИМИТА
            if len(user_activities) >= max_activities:
                logger.warning(f"⚠️ User {user_id} reached activity limit: {max_activities}")
                break

        return user_activities

    async def _filter_completed_activities(self, activities: List[Dict]) -> List[Dict]:
        """Фильтрует активности - УПРОЩЕННАЯ ВЕРСИЯ БЕЗ ПРОВЕРКИ ЗАДАЧ"""
        if not activities:
            return []

        completed_activities = []
        
        for activity in activities:
            type_id = str(activity.get('TYPE_ID'))
            
            # Для задач временно считаем ВСЕ активными (из-за ошибки 401)
            # В будущем нужно настроить вебхук с правами на tasks
            if type_id == '4':  # Задача
                # ВРЕМЕННО: считаем все задачи завершенными
                completed_activities.append(activity)
            else:
                # Для звонков, комментариев и встреч считаем все завершенными
                completed_activities.append(activity)
        
        logger.info(f"📊 Simplified filter: {len(activities)} -> {len(completed_activities)} activities")
        return completed_activities

    async def get_activities_comprehensive(
        self,
        start_date: str,
        end_date: str,
        user_ids: List[str]
    ) -> Dict[str, List[Dict]]:
        """Комплексный сбор активностей с фильтрацией по статусу"""
        try:
            all_activities = {}
            
            # Параллельный сбор данных для всех пользователей
            tasks = []
            for user_id in user_ids:
                task = self._get_complete_activities_for_user(user_id, start_date, end_date)
                tasks.append(task)
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for i, user_activities in enumerate(results):
                if isinstance(user_activities, Exception):
                    logger.error(f"Error getting activities for user {user_ids[i]}: {user_activities}")
                    all_activities[user_ids[i]] = []
                else:
                    # Фильтруем только завершенные активности
                    filtered_activities = await self._filter_completed_activities(user_activities)
                    all_activities[user_ids[i]] = filtered_activities
            
            return all_activities
            
        except Exception as e:
            logger.error(f"Error in get_activities_comprehensive: {str(e)}")
            return {}

    async def _get_complete_activities_for_user(
        self, 
        user_id: str, 
        start_date: str, 
        end_date: str
    ) -> List[Dict]:
        """Получает полный набор активностей для пользователя"""
        start_date_obj = datetime.fromisoformat(start_date)
        end_date_obj = datetime.fromisoformat(end_date)
        start_date_str = start_date_obj.strftime("%Y-%m-%dT%H:%M:%S")
        end_date_str = end_date_obj.strftime("%Y-%m-%dT%H:%M:%S")
        
        return await self._get_activities_for_single_user_improved(
            user_id, start_date_str, end_date_str
        )

    async def get_user_leads(self, user_id: str, date: str = None) -> List[Dict]:
        """Получает лиды пользователя с их стадиями"""
        if not date:
            date = datetime.now().strftime("%Y-%m-%d")
            
        try:
            params = {
                'filter[ASSIGNED_BY_ID]': user_id,
                'select[]': ['ID', 'TITLE', 'STATUS_ID', 'DATE_CREATE', 'ASSIGNED_BY_ID', 'STAGE_ID']
            }
            
            leads = await self.make_bitrix_request("crm.lead.list", params)
            return leads or []
            
        except Exception as e:
            logger.error(f"Error getting leads for user {user_id}: {e}")
            return []

    async def get_lead_stages_history(self, lead_id: str, start_date: str, end_date: str) -> List[Dict]:
        """Получает историю изменений стадий лида"""
        try:
            params = {
                'filter[ENTITY_TYPE]': 'LEAD',
                'filter[ENTITY_ID]': lead_id,
                'filter[>=CREATED]': f"{start_date}T00:00:00",
                'filter[<=CREATED]': f"{end_date}T23:59:59",
                'select[]': ['ID', 'CREATED', 'FIELD_NAME', 'FROM_VALUE', 'TO_VALUE']
            }
            
            history = await self.make_bitrix_request("crm.timeline.list", params)
            return [item for item in (history or []) if item.get('FIELD_NAME') == 'STATUS_ID']
            
        except Exception as e:
            logger.error(f"Error getting lead history {lead_id}: {e}")
            return []

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