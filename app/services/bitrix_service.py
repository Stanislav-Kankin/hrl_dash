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
        """Получить активности с фильтрами - ИСПРАВЛЕННАЯ ВЕРСИЯ"""
        try:
            # Рассчитываем дату начала периода
            start_date = datetime.now() - timedelta(days=days)
            start_date_str = start_date.strftime("%Y-%m-%dT%H:%M:%S")
            
            # Параметры запроса - ПРАВИЛЬНЫЙ ФОРМАТ для Bitrix24
            params = {
                'filter[>=CREATED]': start_date_str
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
                return []
            
            logger.info(f"Received {len(activities)} activities from Bitrix24")
            return activities
            
        except Exception as e:
            logger.error(f"Error getting activities: {str(e)}")
            return None

    async def get_calls(self, days: int = 30, user_ids: List[str] = None) -> Optional[List[Dict]]:
        """Получить данные о звонках"""
        try:
            start_date = datetime.now() - timedelta(days=days)
            start_date_str = start_date.strftime("%Y-%m-%dT%H:%M:%S")
            
            params = {
                'filter[>=CALL_START_DATE]': start_date_str
            }
            
            if user_ids:
                params['filter[PORTAL_USER_ID]'] = user_ids
            
            params['select[0]'] = 'ID'
            params['select[1]'] = 'CALL_TYPE'
            params['select[2]'] = 'CALL_DURATION'
            params['select[3]'] = 'CALL_START_DATE'
            params['select[4]'] = 'PORTAL_USER_ID'
            params['select[5]'] = 'PHONE_NUMBER'
            
            calls = await self.make_bitrix_request("voximplant.statistic.get", params)
            return calls
            
        except Exception as e:
            logger.error(f"Error getting calls: {str(e)}")
            return None

    async def get_presales_users(self) -> Optional[List[Dict]]:
        """Получает список сотрудников пресейла - ОБНОВЛЕННАЯ ВЕРСИЯ"""
        try:
            # Жестко задаем ID всех найденных пресейл сотрудников
            known_presales_ids = [
                '8860', '8988', '17087', '17919', '17395', '18065',  # Из вашего запроса
                '14255',  # Из данных о звонках
            ]
            
            presales_users = []
            
            # Получаем информацию о каждом сотруднике по ID
            for user_id in known_presales_ids:
                user = await self.get_user_by_id(user_id)
                if user:
                    presales_users.append(user)
                    logger.info(f"Found presales user: {user.get('NAME')} {user.get('LAST_NAME')} - {user.get('WORK_POSITION', '')} - ID: {user.get('ID')}")
            
            logger.info(f"Final presales users count: {len(presales_users)}")
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

    async def search_users_by_name(self, search_string: str) -> Optional[List[Dict]]:
        """Поиск пользователей по имени"""
        try:
            params = {'FILTER[FIND]': search_string}
            users = await self.make_bitrix_request("user.search", params)
            return users
        except Exception as e:
            logger.error(f"Error searching users by name {search_string}: {str(e)}")
            return None