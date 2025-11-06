import requests
import os
from typing import Dict, List, Optional
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class BitrixService:
    def __init__(self):
        self.webhook_url = os.getenv("BITRIX_WEBHOOK_URL", "")
        self.access_token = os.getenv("BITRIX_ACCESS_TOKEN", "")
        
    def _make_request(self, method: str, params: Dict = None) -> Optional[Dict]:
        """Базовый метод для запросов к Bitrix24 API"""
        try:
            if self.webhook_url:
                # Используем вебхук (проще для начала)
                url = f"{self.webhook_url}/{method}"
            else:
                # Используем OAuth (будем подключать позже)
                url = f"https://your-domain.bitrix24.ru/rest/{method}"
                if self.access_token:
                    params = params or {}
                    params['auth'] = self.access_token
            
            response = requests.post(url, json=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if 'error' in data:
                logger.error(f"Bitrix API Error: {data['error']}")
                return None
                
            return data.get('result', {})

        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return None

    def get_users(self) -> List[Dict]:
        """Получить список пользователей"""
        return self._make_request("user.get") or []

    def get_activities(self, days: int = 7) -> List[Dict]:
        """Получить активности за последние N дней"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        params = {
            "filter": {
                ">=CREATED": start_date.strftime("%Y-%m-%dT%H:%M:%S"),
                "<=CREATED": end_date.strftime("%Y-%m-%dT%H:%M:%S")
            }
        }
        return self._make_request("crm.activity.list", params) or []

    def get_calls(self, days: int = 7) -> List[Dict]:
        """Получить данные о звонках"""
        activities = self.get_activities(days)
        calls = [act for act in activities if act.get('TYPE_ID') == '2']  # TYPE_ID 2 = звонки
        return calls

    def get_comments(self, days: int = 7) -> List[Dict]:
        """Получить комментарии (из новостей/задач)"""
        # Это упрощенный пример - в реальности нужно использовать методы для комментариев
        params = {
            "filter": {
                ">=POST_DATE": (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
            }
        }
        return self._make_request("sonet_group.get", params) or []

    def test_connection(self) -> bool:
        """Проверить подключение к Bitrix24"""
        result = self._make_request("profile")
        return result is not None