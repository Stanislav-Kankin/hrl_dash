import aiohttp
import os
from typing import Dict, List, Optional
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class BitrixService:
    def __init__(self):
        self.webhook_url = os.getenv("BITRIX_WEBHOOK_URL", "")
        
    async def _make_request(self, method: str, params: Dict = None) -> Optional[Dict]:
        """Базовый метод для запросов к Bitrix24 API"""
        try:
            url = f"{self.webhook_url}/{method}"
            logger.info(f"🔄 Запрос к: {method}")
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=params or {}, timeout=60) as response:
                    data = await response.json()
                    
                    if 'error' in data:
                        logger.error(f"Bitrix API Error: {data['error']}")
                        return None
                        
                    return data.get('result', {})
                    
        except Exception as e:
            logger.error(f"Request failed: {e}")
            return None

    async def get_users(self, only_active: bool = True) -> List[Dict]:
        """Получить список пользователей с фильтрацией"""
        params = {
            "filter": {"ACTIVE": True} if only_active else {}
        }
        users = await self._make_request("user.get", params) or []
        
        # Фильтруем только сотрудников (не внешних пользователей)
        employees = [user for user in users if user.get('USER_TYPE') == 'employee']
        return employees

    async def get_calls(self, days: int = 7) -> List[Dict]:
        """Получить данные о звонках через телефонию"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        params = {
            "filter": {
                ">=DATE_CREATE": start_date.strftime("%Y-%m-%dT%H:%M:%S"),
            },
            "select": ["ID", "CALL_TYPE", "DURATION", "CALL_START_DATE", "PORTAL_USER_ID"]
        }
        return await self._make_request("voximplant.statistic.get", params) or []

    async def get_tasks(self, days: int = 7) -> List[Dict]:
        """Получить задачи за период"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        params = {
            "filter": {
                ">=CREATED_DATE": start_date.strftime("%Y-%m-%dT%H:%M:%S"),
            },
            "select": ["ID", "TITLE", "CREATED_DATE", "RESPONSIBLE_ID", "STATUS"]
        }
        return await self._make_request("tasks.task.list", params) or []

    async def get_timeline_comments(self, days: int = 7) -> List[Dict]:
        """Получить комментарии из ленты (более надежный метод)"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        params = {
            "filter": {
                ">=CREATED": start_date.strftime("%Y-%m-%dT%H:%M:%S"),
            },
            "select": ["ID", "CREATED", "TITLE", "DESCRIPTION", "AUTHOR_ID"]
        }
        return await self._make_request("crm.timeline.comment.list", params) or []

    async def test_connection(self) -> bool:
        """Проверить подключение к Bitrix24"""
        result = await self._make_request("profile")
        return result is not None