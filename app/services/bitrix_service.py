import aiohttp
import os
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

class BitrixService:
    def __init__(self):
        self.webhook_url = os.getenv("BITRIX_WEBHOOK_URL")
        self.session = None

    async def ensure_session(self):
        """Создает сессию если её нет"""
        if self.session is None:
            self.session = aiohttp.ClientSession()

    async def close_session(self):
        """Закрывает сессию"""
        if self.session:
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

    async def get_activities(self, days: int = 30, user_ids: List[str] = None, activity_types: List[str] = None) -> Optional[List[Dict]]:
        """Получить активности с фильтрами и пагинацией"""
        try:
            # Рассчитываем дату начала периода
            start_date = datetime.now() - timedelta(days=days)
            start_date_str = start_date.strftime("%Y-%m-%dT%H:%M:%S")
            
            all_activities = []
            start = 0
            
            while True:
                # Параметры запроса с пагинацией
                params = {
                    'filter[>=CREATED]': start_date_str,
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
                
                logger.info(f"Requesting activities with params: {params}")
                
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
                
                # Добавляем небольшую задержку чтобы не перегружать API
                import asyncio
                await asyncio.sleep(0.1)
            
            logger.info(f"Total activities received: {len(all_activities)}")
            return all_activities
            
        except Exception as e:
            logger.error(f"Error getting activities: {str(e)}")
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

    async def search_users_by_name(self, search_string: str) -> Optional[List[Dict]]:
        """Поиск пользователей по имени"""
        try:
            params = {'FILTER[FIND]': search_string}
            users = await self.make_bitrix_request("user.search", params)
            return users
        except Exception as e:
            logger.error(f"Error searching users by name {search_string}: {str(e)}")
            return None