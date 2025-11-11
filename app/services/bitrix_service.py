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
        self._cache_ttl = 10 * 60
        self.executor = ThreadPoolExecutor(max_workers=5)
        self.max_activities_per_user = 100000  # 🔥 ОГРАНИЧЕНИЕ на количество активностей на пользователя
        self.max_days_per_request = 100  # 🔥 Максимальный период в днях для одного запроса
        
    async def ensure_session(self):
        """Создает сессию если её нет"""
        if self.session is None or self.session.closed:
            timeout = aiohttp.ClientTimeout(total=500)  # 🔥 Увеличиваем таймаут
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
        """ОСНОВНОЙ МЕТОД - получение активностей с ОГРАНИЧЕНИЯМИ для больших периодов"""
        try:
            # Определяем диапазон дат
            if start_date and end_date:
                start_date_obj = datetime.fromisoformat(start_date)
                end_date_obj = datetime.fromisoformat(end_date)
                start_date_obj = start_date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = end_date_obj.replace(hour=23, minute=59, second=59, microsecond=999999)
                
                # 🔥 ПРОВЕРКА: если период больше максимального - разбиваем на части
                total_days = (end_date_obj - start_date_obj).days + 1
                if total_days > self.max_days_per_request:
                    logger.info(f"📅 Large period detected: {total_days} days, splitting into chunks...")
                    return await self._get_activities_large_period(
                        start_date_obj, end_date_obj, user_ids, activity_types
                    )
                    
            elif days:
                end_date_obj = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
                start_date_obj = (end_date_obj - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
                
                # 🔥 ПРОВЕРКА для дней
                if days > self.max_days_per_request:
                    logger.info(f"📅 Large period detected: {days} days, splitting into chunks...")
                    return await self._get_activities_large_period(
                        start_date_obj, end_date_obj, user_ids, activity_types
                    )
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

            # Параллельные запросы для всех пользователей
            all_activities = []
            
            if final_user_ids:
                tasks = []
                for user_id in final_user_ids:
                    task = self._get_activities_for_single_user(
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

            # Фильтрация завершенных активностей
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

    async def _get_activities_large_period(
        self, 
        start_date: datetime, 
        end_date: datetime, 
        user_ids: List[str], 
        activity_types: List[str] = None
    ) -> List[Dict]:
        """Обработка больших периодов - разбивает на части"""
        all_activities = []
        current_start = start_date
        
        while current_start <= end_date:
            # Вычисляем конец текущего чанка
            current_end = min(
                current_start + timedelta(days=self.max_days_per_request - 1), 
                end_date
            )
            
            logger.info(f"📅 Processing chunk: {current_start.strftime('%Y-%m-%d')} to {current_end.strftime('%Y-%m-%d')}")
            
            # Получаем данные для текущего чанка
            chunk_activities = await self._get_activities_for_period(
                current_start, current_end, user_ids, activity_types
            )
            
            if chunk_activities:
                all_activities.extend(chunk_activities)
                logger.info(f"📅 Chunk completed: {len(chunk_activities)} activities")
            
            # Переходим к следующему чанку
            current_start = current_end + timedelta(days=1)
            
            # 🔥 Небольшая пауза между запросами чтобы не перегружать API
            await asyncio.sleep(1)
        
        logger.info(f"📅 Large period completed: {len(all_activities)} total activities")
        return all_activities

    async def _get_activities_for_period(
        self,
        start_date: datetime,
        end_date: datetime,
        user_ids: List[str],
        activity_types: List[str] = None
    ) -> List[Dict]:
        """Получение активностей для конкретного периода"""
        start_date_str = start_date.strftime("%Y-%m-%dT%H:%M:%S")
        end_date_str = end_date.strftime("%Y-%m-%dT%H:%M:%S")
        
        all_activities = []
        
        if user_ids:
            tasks = []
            for user_id in user_ids:
                task = self._get_activities_for_single_user(
                    user_id, start_date_str, end_date_str, activity_types
                )
                tasks.append(task)
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for i, user_activities in enumerate(results):
                if isinstance(user_activities, Exception):
                    logger.error(f"Error getting activities for user {user_ids[i]}: {user_activities}")
                elif user_activities:
                    all_activities.extend(user_activities)
        
        return await self._filter_completed_activities(all_activities)

    async def _get_activities_for_single_user(
        self, 
        user_id: str, 
        start_date_str: str, 
        end_date_str: str, 
        activity_types: List[str] = None
    ) -> List[Dict]:
        """Получение активностей для одного пользователя с ОГРАНИЧЕНИЕМ количества"""
        user_activities = []
        start = 0
        request_count = 0
        max_requests = 20  # 🔥 УМЕНЬШАЕМ максимальное количество запросов (1000 активностей)

        while request_count < max_requests:
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

            # 🔥 ПРОВЕРКА: не превысили ли максимальное количество активностей
            if len(user_activities) >= self.max_activities_per_user:
                logger.warning(f"⚠️ User {user_id} reached activity limit ({self.max_activities_per_user}), stopping")
                break

            if len(activities) < 50:
                logger.info(f"🔍 User {user_id} - Last batch had {len(activities)} items, stopping pagination.")
                break

            start += 50
            request_count += 1
            await asyncio.sleep(0.1)  # 🔥 Увеличиваем задержку

        return user_activities

    async def _filter_completed_activities(self, activities: List[Dict]) -> List[Dict]:
        """Фильтрует активности - УПРОЩЕННАЯ ВЕРСИЯ БЕЗ ПРОВЕРКИ ЗАДАЧ"""
        if not activities:
            return []

        completed_activities = []
        
        for activity in activities:
            type_id = str(activity.get('TYPE_ID'))
            
            # Для задач временно считаем ВСЕ активными
            if type_id == '4':  # Задача
                completed_activities.append(activity)
            else:
                # Для звонков, комментариев и встреч считаем все завершенными
                completed_activities.append(activity)
        
        logger.info(f"📊 Simplified filter: {len(activities)} -> {len(completed_activities)} activities")
        return completed_activities

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
    
    async def get_activity_statistics_from_data(self, activities: List[Dict]) -> Dict[str, Any]:
        """Получение статистики из готового списка активностей (без запросов к Bitrix)"""
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
    
    async def get_cached_activities_for_selected_users(self, selected_user_ids: List[str], start_date: str, end_date: str, activity_types: List[str] = None) -> Dict:
        """
        Проверяет полноту кэша ТОЛЬКО для выбранных пользователей
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                placeholders = ','.join('?' for _ in selected_user_ids)
                
                # Базовый запрос для выбранных пользователей
                query = f'''
                    SELECT raw_data, data_date FROM activities_cache 
                    WHERE user_id IN ({placeholders}) 
                    AND data_date BETWEEN ? AND ?
                '''
                params = selected_user_ids + [start_date, end_date]
                
                # Фильтр по типу активности
                if activity_types and activity_types != ['all']:
                    type_placeholders = ','.join('?' for _ in activity_types)
                    query += f' AND type_id IN ({type_placeholders})'
                    params.extend(activity_types)
                
                query += ' ORDER BY created DESC'
                
                cursor = await db.execute(query, params)
                rows = await cursor.fetchall()
                
                if not rows:
                    return {"activities": [], "missing_days": [], "completeness": 0, "selected_users": selected_user_ids}
                
                # Анализируем данные ТОЛЬКО для выбранных пользователей
                cached_dates = set()
                activities = []
                
                for row in rows:
                    try:
                        activity_data = json.loads(row[0])
                        # 🔥 ВАЖНО: фильтруем по выбранным пользователям на случай если в кэше есть данные других пользователей
                        if str(activity_data.get('AUTHOR_ID')) in selected_user_ids:
                            activities.append(activity_data)
                            cached_dates.add(row[1])
                    except Exception as e:
                        continue
                
                # Определяем недостающие дни
                start = datetime.fromisoformat(start_date)
                end = datetime.fromisoformat(end_date)
                total_days = (end - start).days + 1
                
                missing_days = []
                current = start
                while current <= end:
                    date_str = current.strftime("%Y-%m-%d")
                    if date_str not in cached_dates:
                        missing_days.append(date_str)
                    current += timedelta(days=1)
                
                completeness = ((total_days - len(missing_days)) / total_days) * 100
                
                logger.info(f"📊 Cache analysis for {len(selected_user_ids)} selected users: {len(activities)} activities, {completeness:.1f}% complete")
                
                return {
                    "activities": activities,
                    "missing_days": missing_days,
                    "completeness": completeness,
                    "cached_days_count": len(cached_dates),
                    "total_days": total_days,
                    "selected_users": selected_user_ids
                }
                    
        except Exception as e:
            logger.error(f"Error analyzing cache for selected users: {e}")
            return {"activities": [], "missing_days": [], "completeness": 0, "selected_users": selected_user_ids}

    def clear_cache(self):
        """Очищает кэш"""
        self._cache.clear()
        logger.info("Cache cleared")