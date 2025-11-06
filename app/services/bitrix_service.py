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
        """Получить активности с фильтрами"""
        try:
            # Рассчитываем дату начала периода
            start_date = datetime.now() - timedelta(days=days)
            start_date_str = start_date.strftime("%Y-%m-%d %H:%M:%S")
            
            # Базовые параметры фильтра
            filter_params = {
                '>=CREATED': start_date_str
            }
            
            # Добавляем фильтр по пользователям если указаны
            if user_ids:
                filter_params['AUTHOR_ID'] = user_ids
            
            # Добавляем фильтр по типам активностей если указаны
            if activity_types:
                filter_params['TYPE_ID'] = activity_types
            
            # Параметры запроса
            params = {
                'filter': filter_params,
                'order': {'CREATED': 'DESC'},
                'select': ['ID', 'CREATED', 'AUTHOR_ID', 'DESCRIPTION', 'TYPE_ID', 'SUBJECT']
            }
            
            logger.info(f"Requesting activities with filters: {filter_params}")
            
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

    async def get_presales_users(self) -> Optional[List[Dict]]:
        """Получает список сотрудников пресейла"""
        try:
            # Можно добавить специфичную логику для фильтрации пресейл сотрудников
            # Например, по отделу, должности и т.д.
            all_users = await self.get_users(only_active=True)
            
            if not all_users:
                return None
            
            # Здесь можно добавить фильтрацию по пресейл сотрудникам
            # Например, по DEPARTMENT_ID, WORK_POSITION и т.д.
            presales_users = []
            for user in all_users:
                # Пример фильтрации - нужно адаптировать под вашу структуру
                position = user.get('WORK_POSITION', '').lower()
                if any(keyword in position for keyword in ['presale', 'пресейл', 'sales', 'продаж']):
                    presales_users.append(user)
                # Если нет четких критериев, возвращаем всех активных пользователей
                else:
                    presales_users.append(user)
            
            return presales_users
            
        except Exception as e:
            logger.error(f"Error getting presales users: {str(e)}")
            return None