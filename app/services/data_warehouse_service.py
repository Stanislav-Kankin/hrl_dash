import asyncio
import aiosqlite
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


class DataWarehouseService:
    def __init__(self, bitrix_service):
        self.bitrix_service = bitrix_service
        self.db_path = "app/data/warehouse.db"
        self.is_syncing = False
        
    async def initialize(self):
        """Инициализация базы данных"""
        import os
        os.makedirs("app/data", exist_ok=True)
        
        async with aiosqlite.connect(self.db_path) as db:
            # Таблица для ежедневных снапшотов активностей
            await db.execute('''
                CREATE TABLE IF NOT EXISTS activity_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    date TEXT NOT NULL,
                    calls INTEGER DEFAULT 0,
                    comments INTEGER DEFAULT 0,
                    tasks INTEGER DEFAULT 0,
                    meetings INTEGER DEFAULT 0,
                    total INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, date)
                )
            ''')
            
            # Таблица для кэша активностей
            await db.execute('''
                CREATE TABLE IF NOT EXISTS activities_cache (
                    id INTEGER PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created TEXT NOT NULL,
                    type_id TEXT NOT NULL,
                    description TEXT,
                    subject TEXT,
                    raw_data TEXT,
                    cached_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    data_date TEXT NOT NULL  -- Дата данных (без времени)
                )
            ''')
            
            # Индексы для быстрого поиска
            await db.execute('CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities_cache(user_id, created)')
            await db.execute('CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON activity_snapshots(user_id, date)')
            await db.execute('CREATE INDEX IF NOT EXISTS idx_activities_data_date ON activities_cache(data_date)')
            
            await db.commit()
        logger.info("✅ Data warehouse initialized")
    
    async def cache_activities(self, activities: List[Dict]):
        """Кэширует активности в БД"""
        if not activities:
            return
            
        try:
            async with aiosqlite.connect(self.db_path) as db:
                for activity in activities:
                    # Извлекаем дату из CREATED для data_date
                    created_str = activity.get('CREATED', '')
                    try:
                        activity_date = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                        data_date = activity_date.strftime("%Y-%m-%d")
                    except:
                        data_date = datetime.now().strftime("%Y-%m-%d")
                    
                    await db.execute(
                        '''INSERT OR REPLACE INTO activities_cache 
                           (id, user_id, created, type_id, description, subject, raw_data, data_date)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                        (
                            activity.get('ID'),
                            activity.get('AUTHOR_ID'),
                            created_str,
                            activity.get('TYPE_ID'),
                            activity.get('DESCRIPTION', ''),
                            activity.get('SUBJECT', ''),
                            json.dumps(activity),
                            data_date
                        )
                    )
                await db.commit()
            logger.info(f"✅ Cached {len(activities)} activities")
        except Exception as e:
            logger.error(f"Error caching activities: {e}")
    
    async def get_cached_activities(self, user_ids: List[str], start_date: str, end_date: str) -> List[Dict]:
        """Получает активности из кэша с проверкой полноты данных за период"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                placeholders = ','.join('?' for _ in user_ids)
                
                # 🔥 ПРОВЕРЯЕМ ПОЛНОТУ ДАННЫХ ЗА ПЕРИОД
                completeness_check = '''
                    SELECT COUNT(DISTINCT data_date) as cached_days
                    FROM activities_cache 
                    WHERE user_id IN ({}) 
                    AND data_date BETWEEN ? AND ?
                '''.format(placeholders)
                
                params = user_ids + [start_date, end_date]
                cursor = await db.execute(completeness_check, params)
                result = await cursor.fetchone()
                
                if not result:
                    return []
                
                cached_days = result[0]
                
                # Вычисляем общее количество дней в периоде
                start = datetime.fromisoformat(start_date)
                end = datetime.fromisoformat(end_date)
                total_days = (end - start).days + 1
                
                # 🔥 Считаем кэш валидным если есть данные за ВСЕ дни периода
                if cached_days < total_days:
                    logger.info(f"🔄 Cache incomplete: {cached_days}/{total_days} days, will refresh")
                    return []
                
                # 🔥 Если данные полные - получаем их (БЕЗ ПРОВЕРКИ ВРЕМЕНИ КЭШИРОВАНИЯ)
                query = f'''
                    SELECT raw_data FROM activities_cache 
                    WHERE user_id IN ({placeholders}) 
                    AND data_date BETWEEN ? AND ?
                    ORDER BY created DESC
                '''
                
                cursor = await db.execute(query, params)
                rows = await cursor.fetchall()
                
                activities = []
                for row in rows:
                    try:
                        activity_data = json.loads(row[0])
                        activities.append(activity_data)
                    except Exception as e:
                        logger.error(f"Error parsing cached activity: {e}")
                        continue
                        
                logger.info(f"📊 Got {len(activities)} activities from cache (complete period: {start_date} to {end_date})")
                return activities
                
        except Exception as e:
            logger.error(f"Error getting cached activities: {e}")
            return []
    
    async def save_daily_snapshot(self, user_stats: List[Dict], date: str):
        """Сохраняет ежедневный снапшот статистики"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                for stat in user_stats:
                    await db.execute(
                        '''INSERT OR REPLACE INTO activity_snapshots 
                           (user_id, date, calls, comments, tasks, meetings, total)
                           VALUES (?, ?, ?, ?, ?, ?, ?)''',
                        (
                            stat['user_id'],
                            date,
                            stat.get('calls', 0),
                            stat.get('comments', 0),
                            stat.get('tasks', 0),
                            stat.get('meetings', 0),
                            stat.get('total', 0)
                        )
                    )
                await db.commit()
            logger.info(f"✅ Saved daily snapshot for {date}")
        except Exception as e:
            logger.error(f"Error saving daily snapshot: {e}")
    
    async def get_fast_stats(self, user_ids: List[str], start_date: str, end_date: str) -> Optional[Dict]:
        """Быстрая статистика из кэша без запросов к Bitrix"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # Получаем снапшоты за период
                query = '''
                    SELECT user_id, date, calls, comments, tasks, meetings, total 
                    FROM activity_snapshots 
                    WHERE user_id IN ({}) AND date BETWEEN ? AND ?
                    ORDER BY date DESC
                '''.format(','.join('?' * len(user_ids)))
                
                params = user_ids + [start_date, end_date]
                cursor = await db.execute(query, params)
                rows = await cursor.fetchall()
                
                if not rows:
                    return None
                
                # Проверяем полноту данных
                unique_dates = set(row[1] for row in rows)
                start = datetime.fromisoformat(start_date)
                end = datetime.fromisoformat(end_date)
                total_days = (end - start).days + 1
                
                if len(unique_dates) < total_days:
                    logger.info(f"📊 Fast stats incomplete: {len(unique_dates)}/{total_days} days")
                    return None
                
                # Агрегируем данные по пользователям
                user_stats = {}
                for row in rows:
                    user_id = row[0]
                    if user_id not in user_stats:
                        user_stats[user_id] = {
                            'user_id': user_id,
                            'calls': 0, 'comments': 0, 'tasks': 0, 
                            'meetings': 0, 'total': 0, 'days_count': set()
                        }
                    
                    user_stats[user_id]['calls'] += row[2]
                    user_stats[user_id]['comments'] += row[3]
                    user_stats[user_id]['tasks'] += row[4]
                    user_stats[user_id]['meetings'] += row[5]
                    user_stats[user_id]['total'] += row[6]
                    user_stats[user_id]['days_count'].add(row[1])
                
                # Преобразуем days_count в количество
                for stat in user_stats.values():
                    stat['days_count'] = len(stat['days_count'])
                
                return {
                    'user_stats': list(user_stats.values()),
                    'total_activities': sum(stat['total'] for stat in user_stats.values()),
                    'from_cache': True,
                    'cache_date': datetime.now().isoformat()
                }
                
        except Exception as e:
            logger.error(f"Error getting fast stats: {e}")
            return None

    async def is_period_cached(self, user_ids: List[str], start_date: str, end_date: str) -> bool:
        """Проверяет, есть ли полные данные за период в кэше"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # Проверяем наличие снапшотов для всех дней периода
                query = '''
                    SELECT COUNT(DISTINCT date) as days_count
                    FROM activity_snapshots 
                    WHERE user_id IN ({}) AND date BETWEEN ? AND ?
                '''.format(','.join('?' * len(user_ids)))
                
                params = user_ids + [start_date, end_date]
                cursor = await db.execute(query, params)
                result = await cursor.fetchone()
                
                if not result:
                    return False
                
                # Вычисляем количество дней в периоде
                start = datetime.fromisoformat(start_date)
                end = datetime.fromisoformat(end_date)
                total_days = (end - start).days + 1
                
                # Считаем кэш полным если есть данные за ВСЕ дни
                return result[0] >= total_days
                
        except Exception as e:
            logger.error(f"Error checking cache completeness: {e}")
            return False

    async def start_background_sync(self):
        """Запуск фоновой синхронизации - ОТКЛЮЧЕНА"""
        logger.info("🔄 Background sync DISABLED - caching only on user requests")
        return
    
    async def sync_recent_data(self):
        """Фоновая синхронизация - ОТКЛЮЧЕНА"""
        return

    async def save_daily_snapshot_from_activities(self, activities: List[Dict], user_ids: List[str], date: str):
        """Сохраняет ежедневный снапшот из списка активностей"""
        if not activities:
            return
            
        try:
            # Группируем активности по пользователям
            user_activities = {}
            for act in activities:
                user_id = str(act.get('AUTHOR_ID', ''))
                if user_id in user_ids:
                    if user_id not in user_activities:
                        user_activities[user_id] = []
                    user_activities[user_id].append(act)
            
            # Создаем статистику для каждого пользователя
            user_stats = []
            for user_id, acts in user_activities.items():
                calls = len([a for a in acts if str(a.get('TYPE_ID')) == '2'])
                comments = len([a for a in acts if str(a.get('TYPE_ID')) == '6'])
                tasks = len([a for a in acts if str(a.get('TYPE_ID')) == '4'])
                meetings = len([a for a in acts if str(a.get('TYPE_ID')) == '1'])
                total = len(acts)
                
                user_stats.append({
                    "user_id": user_id,
                    "calls": calls,
                    "comments": comments,
                    "tasks": tasks,
                    "meetings": meetings,
                    "total": total
                })
            
            # Сохраняем в БД
            await self.save_daily_snapshot(user_stats, date)
            
        except Exception as e:
            logger.error(f"Error saving snapshot from activities: {e}")

    async def clear_old_cache(self, days_to_keep: int = 30):
        """Очищает старый кэш"""
        try:
            cutoff_date = (datetime.now() - timedelta(days=days_to_keep)).strftime("%Y-%m-%d")
            
            async with aiosqlite.connect(self.db_path) as db:
                # Удаляем старые записи из кэша активностей
                await db.execute(
                    "DELETE FROM activities_cache WHERE data_date < ?",
                    (cutoff_date,)
                )
                # Удаляем старые снапшоты
                await db.execute(
                    "DELETE FROM activity_snapshots WHERE date < ?",
                    (cutoff_date,)
                )
                await db.commit()
                
                logger.info(f"🧹 Cleared cache older than {cutoff_date}")
        except Exception as e:
            logger.error(f"Error clearing old cache: {e}")
    
    async def get_cached_activities_optimized(self, user_ids: List[str], start_date: str, end_date: str, activity_types: List[str] = None) -> Dict:
        """
        Умное получение данных из кэша с фильтрацией по типу активности
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                placeholders = ','.join('?' for _ in user_ids)
                
                # Базовый запрос
                query = f'''
                    SELECT raw_data, data_date FROM activities_cache 
                    WHERE user_id IN ({placeholders}) 
                    AND data_date BETWEEN ? AND ?
                '''
                params = user_ids + [start_date, end_date]
                
                # Добавляем фильтр по типу активности если нужно
                if activity_types and activity_types != ['all']:
                    type_placeholders = ','.join('?' for _ in activity_types)
                    query += f' AND type_id IN ({type_placeholders})'
                    params.extend(activity_types)
                
                query += ' ORDER BY created DESC'
                
                cursor = await db.execute(query, params)
                rows = await cursor.fetchall()
                
                if not rows:
                    return {"activities": [], "missing_days": [], "completeness": 0}
                
                # Анализируем данные
                cached_dates = set()
                activities = []
                
                for row in rows:
                    try:
                        activity_data = json.loads(row[0])
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
                
                logger.info(f"📊 Cache analysis: {len(activities)} activities, {completeness:.1f}% complete ({total_days - len(missing_days)}/{total_days} days)")
                
                if missing_days:
                    logger.info(f"🔄 Missing days: {missing_days}")
                
                return {
                    "activities": activities,
                    "missing_days": missing_days,
                    "completeness": completeness,
                    "cached_days_count": len(cached_dates),
                    "total_days": total_days
                }
                    
        except Exception as e:
            logger.error(f"Error analyzing cache: {e}")
            return {"activities": [], "missing_days": [], "completeness": 0}
                    
        except Exception as e:
            logger.error(f"Error analyzing cache: {e}")
            return {"activities": [], "missing_days": [], "completeness": 0}