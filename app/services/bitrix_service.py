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
        
    async def ensure_session(self):
        """Создает сессию если её нет"""
        if self.session is None or self.session.closed:
            timeout = aiohttp.ClientTimeout(total=120)  # 🔥 Увеличиваем таймаут до 2 минут
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
        """ОСНОВНОЙ МЕТОД - получение активностей БЕЗ ОГРАНИЧЕНИЙ"""
        try:
            # Определяем диапазон дат
            if start_date and end_date:
                start_date_obj = datetime.fromisoformat(start_date)
                end_date_obj = datetime.fromisoformat(end_date)
                start_date_obj = start_date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = end_date_obj.replace(hour=23, minute=59, second=59, microsecond=999999)
                
                # 🔥 УБРАЛИ ПРОВЕРКУ НА БОЛЬШИЕ ПЕРИОДЫ - ЗАГРУЖАЕМ ВСЕ
                total_days = (end_date_obj - start_date_obj).days + 1
                logger.info(f"📅 Loading activities for {total_days} days")
                        
            elif days:
                end_date_obj = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
                start_date_obj = (end_date_obj - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
                logger.info(f"📅 Loading activities for {days} days")
            else:
                end_date_obj = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
                start_date_obj = (end_date_obj - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
                logger.info(f"📅 Loading activities for 30 days (default)")

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

    async def _get_activities_for_single_user(
        self, 
        user_id: str, 
        start_date_str: str, 
        end_date_str: str, 
        activity_types: List[str] = None
    ) -> List[Dict]:
        """Получение активностей для одного пользователя С ОГРАНИЧЕНИЯМИ"""
        user_activities = []
        start = 0
        request_count = 0
        max_requests = 20  # 🔥 ОГРАНИЧИВАЕМ КОЛИЧЕСТВО ЗАПРОСОВ
        max_activities_per_user = 500  # 🔥 МАКСИМУМ АКТИВНОСТЕЙ НА ПОЛЬЗОВАТЕЛЯ

        while request_count < max_requests and len(user_activities) < max_activities_per_user:
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

            # 🔥 ПРОВЕРКА ЛИМИТА
            if len(user_activities) >= max_activities_per_user:
                logger.warning(f"⚠️ User {user_id} reached activity limit ({max_activities_per_user}), stopping")
                user_activities = user_activities[:max_activities_per_user]  # Обрезаем до лимита
                break

            if len(activities) < 50:
                logger.info(f"🔍 User {user_id} - Last batch had {len(activities)} items, stopping pagination.")
                break

            start += 50
            request_count += 1
            await asyncio.sleep(0.2)  # 🔥 Увеличиваем задержку для API

        logger.info(f"🔍 User {user_id} - COMPLETED: {len(user_activities)} total activities")
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

    async def get_activity_statistics_from_activities(self, activities: List[Dict], start_date: str, end_date: str) -> Dict[str, Any]:
        """Генерирует статистику из готового списка активностей (для кэша)"""
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
                'start': sorted_daily[0]['date'] if sorted_daily else start_date,
                'end': sorted_daily[-1]['date'] if sorted_daily else end_date
            }
        }

    async def get_deals(
        self,
        start_date: str = None,
        end_date: str = None,
        user_ids: List[str] = None,
        limit: int = None
    ) -> Optional[List[Dict]]:
        """Получение списка сделок - БЕЗ ЖЕСТКИХ ОГРАНИЧЕНИЙ"""
        try:
            all_deals = []
            start = 0
            batch_size = 50
            total_loaded = 0
            
            logger.info(f"📊 Starting deals loading: start_date={start_date}, end_date={end_date}, users={user_ids}")
            
            while True:
                params = {
                    'select[]': ['ID', 'TITLE', 'STAGE_ID', 'ASSIGNED_BY_ID', 'DATE_CREATE', 'DATE_MODIFY', 'OPPORTUNITY', 'CURRENCY_ID', 'TYPE_ID', 'STATUS_ID'],
                    'start': start
                }

                # Фильтрация по дате
                if start_date and end_date:
                    try:
                        start_date_obj = datetime.fromisoformat(start_date)
                        end_date_obj = datetime.fromisoformat(end_date)
                        params['filter[>=DATE_CREATE]'] = start_date_obj.strftime("%Y-%m-%d")
                        params['filter[<=DATE_CREATE]'] = end_date_obj.strftime("%Y-%m-%d")
                    except Exception as e:
                        logger.error(f"Error parsing dates: {e}")

                # Фильтрация по пользователям
                if user_ids:
                    params['filter[ASSIGNED_BY_ID]'] = user_ids

                logger.info(f"📊 Making Bitrix request for deals, start={start}")
                deals = await self.make_bitrix_request("crm.deal.list", params)
                
                if not deals:
                    logger.info("📊 No more deals found")
                    break

                all_deals.extend(deals)
                total_loaded += len(deals)
                
                batch_number = start // 50 + 1
                logger.info(f"📊 Batch {batch_number}: got {len(deals)} deals, total: {total_loaded}")

                # 🔥 ПРОГРЕСС ДЛЯ БОЛЬШИХ НАБОРОВ ДАННЫХ
                if total_loaded % 500 == 0:
                    logger.info(f"📊 Progress: {total_loaded} deals loaded...")

                # 🔥 МЯГКИЙ ЛИМИТ ТОЛЬКО ДЛЯ ОЧЕНЬ БОЛЬШИХ НАБОРОВ (можно убрать совсем)
                if total_loaded >= 5000:
                    logger.warning(f"⚠️ Reached large dataset limit ({total_loaded} deals). Consider filtering by date.")
                    break

                # 🔥 ЕСЛИ ПЕРЕДАЛИ ЛИМИТ - ОСТАНАВЛИВАЕМСЯ
                if limit and total_loaded >= limit:
                    logger.info(f"📊 Reached user limit of {limit} deals")
                    all_deals = all_deals[:limit]
                    break

                # Если в ответе меньше 50 элементов - значит это последняя страница
                if len(deals) < 50:
                    logger.info("📊 Last batch (less than 50 items)")
                    break

                start += 50
                await asyncio.sleep(0.1)  # 🔥 Небольшая пауза между запросами

            logger.info(f"📊 Deal loading COMPLETED: {len(all_deals)} total deals")

            if not all_deals:
                return []

            # 🔥 ОБРАБОТКА СТАДИЙ (остается без изменений)
            all_stages = await self.get_deal_stages()
            stage_map = {}
            for stage in all_stages:
                stage_id = stage.get('STATUS_ID')
                stage_map[stage_id] = stage
            
            enriched_deals = []
            for deal in all_deals:
                stage_id = deal.get('STAGE_ID')
                type_id = deal.get('TYPE_ID')
                status_id = deal.get('STATUS_ID')
                
                # Пробуем найти стадию в порядке приоритета
                stage_info = None
                for potential_id in [stage_id, type_id, status_id]:
                    if potential_id and potential_id in stage_map:
                        stage_info = stage_map[potential_id]
                        break
                
                # Если не нашли, создаем базовую информацию
                if not stage_info:
                    stage_info = {
                        'NAME': stage_id or 'Неизвестно',
                        'COLOR': '#cccccc',
                        'ENTITY_ID': 'UNKNOWN'
                    }
                
                enriched_deals.append({
                    'ID': deal.get('ID'),
                    'TITLE': deal.get('TITLE'),
                    'STAGE_ID': stage_id,
                    'TYPE_ID': type_id,
                    'STATUS_ID': status_id,
                    'STAGE_NAME': stage_info.get('NAME', 'Неизвестно'),
                    'STAGE_COLOR': stage_info.get('COLOR', '#cccccc'),
                    'ENTITY_ID': stage_info.get('ENTITY_ID', 'UNKNOWN'),
                    'ASSIGNED_BY_ID': deal.get('ASSIGNED_BY_ID'),
                    'DATE_CREATE': deal.get('DATE_CREATE'),
                    'DATE_MODIFY': deal.get('DATE_MODIFY'),
                    'OPPORTUNITY': deal.get('OPPORTUNITY'),
                    'CURRENCY_ID': deal.get('CURRENCY_ID')
                })

            # Логируем распределение по стадиям
            stage_distribution = {}
            for deal in enriched_deals:
                stage_name = deal['STAGE_NAME']
                stage_distribution[stage_name] = stage_distribution.get(stage_name, 0) + 1
            
            logger.info(f"📊 Final stage distribution: {stage_distribution}")

            return enriched_deals

        except Exception as e:
            logger.error(f"❌ Error getting deals: {str(e)}", exc_info=True)
            return None

    async def get_deals_statistics_enhanced(
        self,
        start_date: str = None,
        end_date: str = None,
        user_ids: List[str] = None
    ) -> Dict[str, Any]:
        """Улучшенная статистика по сделкам с правильной группировкой"""
        try:
            deals = await self.get_deals(start_date, end_date, user_ids)
            if not deals:
                return {
                    'total_deals': 0,
                    'total_value': 0,
                    'deals_by_stage': [],
                    'deals_by_type': []
                }

            # Статистика по стадиям
            stage_stats = {}
            type_stats = {}
            total_value = 0

            for deal in deals:
                stage_id = deal['STAGE_ID']
                stage_name = deal['STAGE_NAME']
                stage_color = deal['STAGE_COLOR']
                type_id = deal['TYPE_ID']
                value = float(deal.get('OPPORTUNITY', 0) or 0)

                # Статистика по стадиям
                if stage_name not in stage_stats:
                    stage_stats[stage_name] = {
                        'count': 0,
                        'value': 0,
                        'color': stage_color
                    }
                stage_stats[stage_name]['count'] += 1
                stage_stats[stage_name]['value'] += value

                # Статистика по типам
                if type_id not in type_stats:
                    type_stats[type_id] = {
                        'count': 0,
                        'value': 0
                    }
                type_stats[type_id]['count'] += 1
                type_stats[type_id]['value'] += value

                total_value += value

            # Преобразуем в список для фронтенда
            deals_by_stage = [
                {
                    'stage_name': stage_name,
                    'stage_color': stats['color'],
                    'count': stats['count'],
                    'value': stats['value']
                }
                for stage_name, stats in stage_stats.items()
            ]

            # Сортируем по количеству сделок
            deals_by_stage.sort(key=lambda x: x['count'], reverse=True)

            return {
                'total_deals': len(deals),
                'total_value': total_value,
                'deals_by_stage': deals_by_stage,
                'deals_by_type': type_stats
            }

        except Exception as e:
            logger.error(f"Error getting enhanced deals statistics: {str(e)}")
            return {
                'total_deals': 0,
                'total_value': 0,
                'deals_by_stage': [],
                'deals_by_type': []
            }

    async def get_deal_stage_history(self, deal_id: str) -> Optional[List[Dict]]:
        """Получение истории изменения стадий сделки"""
        try:
            # Используем метод timeline для получения истории
            timeline = await self.make_bitrix_request("crm.timeline.list", {
                'filter[ENTITY_ID]': deal_id,
                'filter[ENTITY_TYPE]': 'deal',
                'filter[TYPE_CATEGORY_ID]': '1'  # Изменения
            })
            
            if not timeline:
                return None
                
            stage_history = []
            for event in timeline:
                if event.get('TYPE_ID') == '1':  # Изменение полей
                    data = event.get('DATA', {})
                    if 'STAGE_ID' in data:
                        stage_history.append({
                            'date': event.get('CREATED'),
                            'stage_id': data['STAGE_ID'],
                            'stage_name': data.get('STAGE_NAME', 'Неизвестно'),
                            'event_id': event.get('ID')
                        })
            
            return sorted(stage_history, key=lambda x: x['date'])
            
        except Exception as e:
            logger.error(f"Error getting deal stage history: {str(e)}")
            return None

    async def get_deal_stages(self) -> List[Dict]:
        """Получение списка ВСЕХ стадий и статусов сделок"""
        try:
            all_stages = []
            
            # Основные стадии воронки
            stages = await self.make_bitrix_request("crm.status.list", {
                'filter[ENTITY_ID]': 'DEAL_STAGE'
            })
            if stages:
                all_stages.extend(stages)
                logger.info(f"📊 Loaded {len(stages)} DEAL_STAGE stages")
            
            # Типы сделок
            deal_types = await self.make_bitrix_request("crm.status.list", {
                'filter[ENTITY_ID]': 'DEAL_TYPE'
            })
            if deal_types:
                all_stages.extend(deal_types)
                logger.info(f"📊 Loaded {len(deal_types)} DEAL_TYPE stages")
            
            # Общие статусы
            statuses = await self.make_bitrix_request("crm.status.list", {
                'filter[ENTITY_ID]': 'STATUS'
            })
            if statuses:
                all_stages.extend(statuses)
                logger.info(f"📊 Loaded {len(statuses)} STATUS stages")
            
            logger.info(f"📊 Total stages loaded: {len(all_stages)}")
            return all_stages
            
        except Exception as e:
            logger.error(f"Error getting deal stages: {str(e)}")
            return []

    async def get_deals_statistics(
        self,
        start_date: str = None,
        end_date: str = None,
        user_ids: List[str] = None
    ) -> Dict[str, Any]:
        """Статистика по сделкам - УПРОЩЕННАЯ ВЕРСИЯ"""
        try:
            deals = await self.get_deals(start_date, end_date, user_ids)
            if not deals:
                return {
                    'total_deals': 0,
                    'total_value': 0,
                    'deals_by_stage': []
                }

            # Статистика по стадиям
            stage_stats = {}
            total_value = 0

            for deal in deals:
                stage_id = deal['STAGE_ID']
                value = float(deal.get('OPPORTUNITY', 0) or 0)

                # Статистика по стадиям
                if stage_id not in stage_stats:
                    stage_stats[stage_id] = {
                        'count': 0,
                        'value': 0,
                        'name': deal['STAGE_NAME'],
                        'color': deal['STAGE_COLOR']
                    }
                stage_stats[stage_id]['count'] += 1
                stage_stats[stage_id]['value'] += value
                total_value += value

            # Преобразуем в список для фронтенда
            deals_by_stage = [
                {
                    'stage_id': stage_id,
                    'stage_name': stats['name'],
                    'stage_color': stats['color'],
                    'count': stats['count'],
                    'value': stats['value']
                }
                for stage_id, stats in stage_stats.items()
            ]

            return {
                'total_deals': len(deals),
                'total_value': total_value,
                'deals_by_stage': deals_by_stage
            }

        except Exception as e:
            logger.error(f"Error getting deals statistics: {str(e)}")
            return {
                'total_deals': 0,
                'total_value': 0,
                'deals_by_stage': []
            }

    async def get_user_deals(self, user_id: str) -> Optional[List[Dict]]:
        """Получение сделок конкретного пользователя"""
        return await self.get_deals(user_ids=[user_id])
    
    async def get_all_users(self) -> Optional[List[Dict]]:
        """Получает список всех пользователей Bitrix24"""
        try:
            cache_key = "all_users"
            if cache_key in self._cache:
                cache_time, cached_data = self._cache[cache_key]
                if (datetime.now() - cache_time).total_seconds() < self._cache_ttl:
                    return cached_data

            all_users = []
            start = 0
            
            while True:
                params = {
                    'start': start
                }
                
                users = await self.make_bitrix_request("user.get", params)
                if not users:
                    break
                    
                all_users.extend(users)
                
                if len(users) < 50:
                    break
                    
                start += 50
                await asyncio.sleep(0.1)

            self._cache[cache_key] = (datetime.now(), all_users)
            logger.info(f"✅ Loaded {len(all_users)} users from Bitrix24")
            return all_users
            
        except Exception as e:
            logger.error(f"Error getting all users: {str(e)}")
            return None

    async def get_activities_optimized(
        self,
        start_date: str,
        end_date: str,
        user_ids: List[str] = None,
        activity_types: List[str] = None,
        chunk_size_days: int = 7  # 🔥 Разбиваем на недельные chunks
    ) -> Optional[List[Dict]]:
        """Оптимизированное получение активностей для больших периодов"""
        try:
            start_date_obj = datetime.fromisoformat(start_date)
            end_date_obj = datetime.fromisoformat(end_date)
            total_days = (end_date_obj - start_date_obj).days + 1
            
            logger.info(f"📅 OPTIMIZED Loading: {total_days} days, chunk size: {chunk_size_days} days")
            
            # 🔥 Для больших периодов разбиваем на части
            if total_days > 14:  # Если больше 2 недель - разбиваем
                return await self._get_activities_chunked(
                    start_date_obj, end_date_obj, user_ids, activity_types, chunk_size_days
                )
            else:
                # Для небольших периодов используем обычный метод
                return await self.get_activities(
                    start_date=start_date,
                    end_date=end_date,
                    user_ids=user_ids,
                    activity_types=activity_types
                )
                
        except Exception as e:
            logger.error(f"Error in get_activities_optimized: {str(e)}")
            return None

    async def _get_activities_chunked(
            self,
            start_date: datetime,
            end_date: datetime,
            user_ids: List[str],
            activity_types: List[str],
            chunk_size_days: int
        ) -> List[Dict]:
            """Получение активностей по частям"""
            all_activities = []
            current_start = start_date
            chunk_number = 1
            
            while current_start <= end_date:
                current_end = min(current_start + timedelta(days=chunk_size_days - 1), end_date)
                
                chunk_start_str = current_start.strftime("%Y-%m-%d")
                chunk_end_str = current_end.strftime("%Y-%m-%d")
                
                logger.info(f"📅 Chunk {chunk_number}: {chunk_start_str} to {chunk_end_str}")
                
                # Получаем данные для текущего chunk
                chunk_activities = await self.get_activities(
                    start_date=chunk_start_str,
                    end_date=chunk_end_str,
                    user_ids=user_ids,
                    activity_types=activity_types
                )
                
                if chunk_activities:
                    all_activities.extend(chunk_activities)
                    logger.info(f"📅 Chunk {chunk_number} completed: {len(chunk_activities)} activities")
                
                # Переходим к следующему chunk
                current_start = current_end + timedelta(days=1)
                chunk_number += 1
                
                # 🔥 Пауза между chunks чтобы не перегружать API
                await asyncio.sleep(1)
            
            logger.info(f"📅 All chunks completed: {len(all_activities)} total activities")
            return all_activities

    async def get_deals_with_timing(self, user_ids: List[str] = None, limit: int = 100) -> Optional[List[Dict]]:
        """Получение сделок с информацией о времени взятия в работу"""
        try:
            logger.info(f"⏱️ Getting deals with timing info for users: {user_ids}")
            
            # Сначала получаем сделки
            deals = await self.get_deals(user_ids=user_ids, limit=limit)
            if not deals:
                return []
            
            enriched_deals = []
            
            for deal in deals:
                deal_id = deal.get('ID')
                stage_id = deal.get('STAGE_ID')
                created_date = deal.get('DATE_CREATE')
                
                # 🔥 АНАЛИЗИРУЕМ ВРЕМЯ ВЗЯТИЯ В РАБОТУ
                # "Взятие в работу" - это когда сделка ушла из серой/начальной стадии
                taken_to_work_date = await self._get_taken_to_work_date(deal_id, created_date)
                
                enriched_deal = {
                    **deal,
                    'taken_to_work_date': taken_to_work_date,
                    'is_in_work': taken_to_work_date is not None,
                    'days_in_work': self._calculate_days_in_work(taken_to_work_date) if taken_to_work_date else 0
                }
                
                enriched_deals.append(enriched_deal)
            
            logger.info(f"⏱️ Enriched {len(enriched_deals)} deals with timing info")
            return enriched_deals
            
        except Exception as e:
            logger.error(f"Error getting deals with timing: {str(e)}")
            return None

    async def _get_taken_to_work_date(self, deal_id: str, created_date: str) -> Optional[str]:
        """Определяет дату взятия сделки в работу"""
        try:
            # 🔥 ОПРЕДЕЛЯЕМ СЕРЫЕ/НАЧАЛЬНЫЕ СТАДИИ
            initial_stages = ['NEW', 'PREPARATION', '1', 'C1', 'C1:NEW']  # Примеры ID начальных стадий
            
            # Получаем историю сделки
            history = await self.get_deal_stage_history(deal_id)
            if not history:
                return created_date  # Если истории нет, считаем что взяли сразу
                
            # Ищем первое изменение с серой на не-серую стадию
            for i, event in enumerate(history):
                current_stage = event.get('stage_id', '')
                stage_name = event.get('stage_name', '').lower()
                
                # 🔥 СЧИТАЕМ ЧТО СДЕЛКА ВЗЯТА В РАБОТУ КОГДА:
                # 1. Ушла из серой/начальной стадии
                # 2. Или когда попала на оранжевую стадию
                is_initial_stage = (
                    current_stage in initial_stages or
                    'нов' in stage_name or
                    'первич' in stage_name or
                    'подготов' in stage_name
                )
                
                is_in_work_stage = (
                    'обработ' in stage_name or
                    'в работе' in stage_name or
                    'кп' in stage_name or
                    'коммерч' in stage_name
                )
                
                if not is_initial_stage or is_in_work_stage:
                    return event.get('date', created_date)
                    
            return created_date  # Если не нашли, считаем что взяли сразу
            
        except Exception as e:
            logger.error(f"Error getting taken to work date: {e}")
            return created_date

    def _calculate_days_in_work(self, taken_to_work_date: str) -> int:
        """Рассчитывает количество дней в работе"""
        try:
            if not taken_to_work_date:
                return 0
                
            work_date = datetime.fromisoformat(taken_to_work_date.replace('Z', '+00:00'))
            today = datetime.now()
            
            days = (today - work_date).days
            return max(0, days)
            
        except Exception as e:
            logger.error(f"Error calculating days in work: {e}")
            return 0

    def clear_cache(self):
        """Очищает кэш"""
        self._cache.clear()
        logger.info("Cache cleared")