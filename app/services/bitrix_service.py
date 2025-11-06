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
        self._cache_ttl = 300  # 5 минут кэширования

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
                    logger.error(f"HTTP error {response.status}")
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

    async def get_activities(self, days: int = None, start_date: str = None, end_date: str = None, 
                            user_ids: List[str] = None, activity_types: List[str] = None) -> Optional[List[Dict]]:
        """Получить ВСЕ активности с поддержкой диапазона дат и кэшированием"""
        try:
            # Создаем ключ для кэша
            cache_key = f"activities_{days}_{start_date}_{end_date}_{'-'.join(user_ids) if user_ids else 'all'}_{'-'.join(activity_types) if activity_types else 'all'}"
            
            # Проверяем кэш
            if cache_key in self._cache:
                cache_time, cached_data = self._cache[cache_key]
                if (datetime.now() - cache_time).total_seconds() < self._cache_ttl:
                    logger.info(f"Using cached activities: {len(cached_data)}")
                    return cached_data

            # Если не указаны пользователи - используем ТОЛЬКО пресейлов
            if not user_ids:
                presales_users = await self.get_presales_users()
                if presales_users:
                    user_ids = [str(user['ID']) for user in presales_users]
            
            # Определяем даты периода
            if start_date and end_date:
                start_date_obj = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                end_date_obj = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            elif days:
                start_date_obj = datetime.now() - timedelta(days=days)
                end_date_obj = datetime.now()
            else:
                start_date_obj = datetime.now() - timedelta(days=30)
                end_date_obj = datetime.now()
            
            start_date_str = start_date_obj.strftime("%Y-%m-%dT%H:%M:%S")
            end_date_str = end_date_obj.strftime("%Y-%m-%dT%H:%M:%S")
            
            all_activities = []
            start = 0
            
            logger.info(f"Fetching activities from {start_date_str} to {end_date_str}")
            
            while True:
                params = {
                    'filter[>=CREATED]': start_date_str,
                    'filter[<=CREATED]': end_date_str,
                    'start': start
                }
                
                # Добавляем фильтр по пользователям если указаны
                if user_ids:
                    params['filter[AUTHOR_ID]'] = user_ids
                
                # Добавляем фильтр по типам активностей если указаны
                if activity_types:
                    params['filter[TYPE_ID]'] = activity_types
                
                # Дополнительные параметры
                params['order[CREATED]'] = 'DESC'
                params['select[0]'] = 'ID'
                params['select[1]'] = 'CREATED'
                params['select[2]'] = 'AUTHOR_ID'
                params['select[3]'] = 'DESCRIPTION'
                params['select[4]'] = 'TYPE_ID'
                params['select[5]'] = 'SUBJECT'
                params['select[6]'] = 'PROVIDER_ID'
                
                # Делаем запрос к Bitrix24
                activities = await self.make_bitrix_request("crm.activity.list", params)
                
                if activities is None:
                    logger.error("No activities received from Bitrix24")
                    break
                
                if not activities:
                    logger.info("No more activities to fetch")
                    break
                    
                all_activities.extend(activities)
                logger.info(f"Received {len(activities)} activities, total: {len(all_activities)}")
                
                # Bitrix24 возвращает по 50 записей, если получили меньше - значит это конец
                if len(activities) < 50:
                    break
                    
                start += 50
                
                # Небольшая задержка чтобы не перегружать API
                await asyncio.sleep(0.1)
            
            logger.info(f"✅ Total activities received: {len(all_activities)}")
            
            # Сохраняем в кэш
            self._cache[cache_key] = (datetime.now(), all_activities)
            
            return all_activities
            
        except Exception as e:
            logger.error(f"Error getting activities: {str(e)}")
            return None

    async def get_presales_users(self) -> Optional[List[Dict]]:
        """Получает список сотрудников пресейла с кэшированием"""
        try:
            cache_key = "presales_users"
            if cache_key in self._cache:
                cache_time, cached_data = self._cache[cache_key]
                if (datetime.now() - cache_time).total_seconds() < self._cache_ttl:
                    return cached_data

            # Жестко задаем ID всех найденных пресейл сотрудников
            known_presales_ids = [
                '8860', '8988', '17087', '17919', '17395', '18065', '14255'
            ]
            
            presales_users = []
            
            # Получаем информацию о каждом сотруднике по ID
            for user_id in known_presales_ids:
                user = await self.get_user_by_id(user_id)
                if user:
                    presales_users.append(user)
                    logger.info(f"Found presales user: {user.get('NAME')} {user.get('LAST_NAME')} - {user.get('WORK_POSITION', '')} - ID: {user.get('ID')}")
            
            logger.info(f"Final presales users count: {len(presales_users)}")
            
            # Сохраняем в кэш
            self._cache[cache_key] = (datetime.now(), presales_users)
            
            return presales_users
            
        except Exception as e:
            logger.error(f"Error getting presales users: {str(e)}")
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

    async def get_activity_statistics(self, days: int = None, start_date: str = None, end_date: str = None, 
                                    user_ids: List[str] = None) -> Dict[str, Any]:
        """Получить статистику активностей с группировкой по дням и типам"""
        activities = await self.get_activities(days=days, start_date=start_date, end_date=end_date, user_ids=user_ids)
        
        if not activities:
            return {}
        
        # Группировка по дням
        daily_stats = {}
        hourly_stats = {str(i).zfill(2): 0 for i in range(24)}
        type_stats = {}
        
        for activity in activities:
            # Группировка по дате
            activity_date = datetime.fromisoformat(activity['CREATED'].replace('Z', '+00:00'))
            date_key = activity_date.strftime('%Y-%m-%d')
            day_of_week = activity_date.strftime('%A')
            hour_key = activity_date.strftime('%H')
            
            if date_key not in daily_stats:
                daily_stats[date_key] = {
                    'date': date_key,
                    'day_of_week': day_of_week,
                    'total': 0,
                    'by_type': {}
                }
            
            # Общая статистика по дню
            daily_stats[date_key]['total'] += 1
            
            # Статистика по типам
            activity_type = str(activity['TYPE_ID'])
            if activity_type not in daily_stats[date_key]['by_type']:
                daily_stats[date_key]['by_type'][activity_type] = 0
            daily_stats[date_key]['by_type'][activity_type] += 1
            
            # Статистика по типам глобально
            if activity_type not in type_stats:
                type_stats[activity_type] = 0
            type_stats[activity_type] += 1
            
            # Статистика по часам
            hourly_stats[hour_key] += 1
        
        # Сортируем дни по дате
        sorted_daily_stats = sorted(daily_stats.values(), key=lambda x: x['date'])
        
        # Статистика по дням недели
        weekday_stats = {
            'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0,
            'Friday': 0, 'Saturday': 0, 'Sunday': 0
        }
        
        for day_stat in sorted_daily_stats:
            weekday_stats[day_stat['day_of_week']] += day_stat['total']
        
        return {
            'total_activities': len(activities),
            'daily_stats': sorted_daily_stats,
            'hourly_stats': hourly_stats,
            'type_stats': type_stats,
            'weekday_stats': weekday_stats,
            'date_range': {
                'start': sorted_daily_stats[0]['date'] if sorted_daily_stats else '',
                'end': sorted_daily_stats[-1]['date'] if sorted_daily_stats else ''
            }
        }

    def clear_cache(self):
        """Очищает кэш"""
        self._cache.clear()
        logger.info("Cache cleared")