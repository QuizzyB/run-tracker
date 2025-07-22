import React, { useState, useEffect } from 'react';
import { MapPin, Clock, Activity, TrendingUp, Eye } from 'lucide-react';

const RunTracker = () => {
    const API_BASE_URL = 'https://run-tracker-wll5.onrender.com';

    // Состояние для аутентификации
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loginData, setLoginData] = useState({ email: '', password: '' });
    const [authToken, setAuthToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Состояние для пробежек
    const [runs, setRuns] = useState([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [selectedRun, setSelectedRun] = useState(null);
    const [showMap, setShowMap] = useState(false);
    const [showPhoto, setShowPhoto] = useState(null);
    const [map, setMap] = useState(null);

    // Состояние для формы добавления пробежки
    const [newRun, setNewRun] = useState({
        distance: '',
        time: '',
        location: '',
        photo: null
    });

    // Состояние для статистики
    const [stats, setStats] = useState({
        totalRuns: 0,
        totalDistance: 0,
        averagePace: 0
    });

    // Загружаем Leaflet CSS и JS
    useEffect(() => {
        // Добавляем CSS для Leaflet
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
        document.head.appendChild(link);

        // Добавляем JS для Leaflet
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
        script.onload = () => {
            console.log('Leaflet загружен');
        };
        document.head.appendChild(script);

        return () => {
            document.head.removeChild(link);
            document.head.removeChild(script);
        };
    }, []);

    // Проверяем аутентификацию при загрузке
    useEffect(() => {
        const token = localStorage.getItem('runTracker_token');
        if (token) {
            setAuthToken(token);
            setIsAuthenticated(true);
            loadRuns(token);
            loadStats(token);
        }
    }, []);

    // Функция для геокодирования (получение координат по адресу)
    const geocodeLocation = async (location) => {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`);
            const data = await response.json();

            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon),
                    display_name: data[0].display_name
                };
            }
            return null;
        } catch (error) {
            console.error('Ошибка геокодирования:', error);
            return null;
        }
    };

    // Инициализация карты
    const initializeMap = async (run) => {
        if (!window.L) {
            console.error('Leaflet не загружен');
            return;
        }

        // Удаляем предыдущую карту если есть
        if (map) {
            map.remove();
        }

        // Получаем координаты для локации
        const coordinates = await geocodeLocation(run.location);

        let lat = 55.7558; // Москва по умолчанию
        let lng = 37.6176;
        // let locationName = run.location;

        if (coordinates) {
            lat = coordinates.lat;
            lng = coordinates.lng;
            // locationName = coordinates.display_name;
        }

        // Создаем карту
        const newMap = window.L.map('map-container').setView([lat, lng], 13);

        // Добавляем тайлы OpenStreetMap
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(newMap);

        // Создаем кастомную иконку для маркера
        const runIcon = window.L.divIcon({
            className: 'custom-run-marker',
            html: `
        <div style="
          background-color: #3B82F6;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 12px;
          font-weight: bold;
        ">
          🏃
        </div>
      `,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        // Добавляем маркер
        const marker = window.L.marker([lat, lng], { icon: runIcon }).addTo(newMap);

        // Добавляем попап с информацией о пробежке
        marker.bindPopup(`
      <div style="min-width: 200px;">
        <h3 style="margin: 0 0 8px 0; color: #1F2937; font-size: 16px; font-weight: bold;">
          🏃 Пробежка
        </h3>
        <div style="font-size: 14px; line-height: 1.5;">
          <p style="margin: 4px 0;"><strong>📅 Дата:</strong> ${run.date}</p>
          <p style="margin: 4px 0;"><strong>📏 Дистанция:</strong> ${run.distance} км</p>
          <p style="margin: 4px 0;"><strong>⏱️ Время:</strong> ${run.time} мин</p>
          <p style="margin: 4px 0;"><strong>⚡ Темп:</strong> ${run.pace} мин/км</p>
          <p style="margin: 4px 0;"><strong>📍 Место:</strong> ${run.location}</p>
        </div>
      </div>
    `).openPopup();

        setMap(newMap);
    };

    // API функции
    const apiCall = async (endpoint, options = {}) => {
        const url = `${API_BASE_URL}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
                ...options.headers
            },
            ...options
        };

        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Произошла ошибка');
        }

        return data;
    };

    // Загружаем пробежки с сервера
    const loadRuns = async (token = authToken) => {
        try {
            setLoading(true);
            const response = await apiCall('/runs', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setRuns(response.runs || []);
            setError('');
        } catch (err) {
            setError(err.message);
            console.error('Ошибка загрузки пробежек:', err);
        } finally {
            setLoading(false);
        }
    };

    // Загружаем статистику с сервера
    const loadStats = async (token = authToken) => {
        try {
            const response = await apiCall('/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setStats(response.stats || { totalRuns: 0, totalDistance: 0, averagePace: 0 });
        } catch (err) {
            console.error('Ошибка загрузки статистики:', err);
        }
    };

    // Обработка входа
    const handleLogin = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await apiCall('/auth/login', {
                method: 'POST',
                body: JSON.stringify(loginData)
            });

            setAuthToken(response.token);
            setIsAuthenticated(true);
            localStorage.setItem('runTracker_token', response.token);

            // Загружаем данные после авторизации
            await loadRuns(response.token);
            await loadStats(response.token);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Выход
    const handleLogout = () => {
        if (map) {
            map.remove();
            setMap(null);
        }
        setIsAuthenticated(false);
        setAuthToken('');
        localStorage.removeItem('runTracker_token');
        setLoginData({ email: '', password: '' });
        setRuns([]);
        setStats({ totalRuns: 0, totalDistance: 0, averagePace: 0 });
    };

    // Добавление пробежки
    const handleAddRun = async () => {
        if (!newRun.distance || !newRun.time || !newRun.location) {
            setError('Пожалуйста, заполните все обязательные поля');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Создаем FormData для отправки файла
            const formData = new FormData();
            formData.append('distance', newRun.distance);
            formData.append('time', newRun.time);
            formData.append('location', newRun.location);

            if (newRun.photo) {
                formData.append('photo', newRun.photo);
            }

            const response = await fetch(`${API_BASE_URL}/runs`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                },
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ошибка добавления пробежки');
            }

            // Обновляем данные
            await loadRuns();
            await loadStats();

            // Очищаем форму
            setNewRun({ distance: '', time: '', location: '', photo: null });
            setShowAddForm(false);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Обработка загрузки фото
    const handlePhotoUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setNewRun({ ...newRun, photo: file });
        }
    };

    // Показать карту
    const showRunOnMap = async (run) => {
        setSelectedRun(run);
        setShowMap(true);
        // Ждем немного, чтобы модал отобразился
        setTimeout(() => {
            initializeMap(run);
        }, 100);
    };

    // Закрыть карту
    const closeMap = () => {
        if (map) {
            map.remove();
            setMap(null);
        }
        setShowMap(false);
        setSelectedRun(null);
    };

    // Страница входа
    if (!isAuthenticated) {
        return (
            <div className="w-screen bg-gray-100 flex items-center justify-center">
                <div className="bg-white p-8 rounded-lg shadow-md w-96">
                    <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
                        <Activity className="inline mr-2" />
                        Run Tracker
                    </h1>

                    {error && (
                        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                            {error}
                        </div>
                    )}

                    <div>
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2">
                                Email
                            </label>
                            <input
                                type="email"
                                value={loginData.email}
                                onChange={(e) => setLoginData({...loginData, email: e.target.value})}
                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
                                required
                                disabled={loading}
                            />
                        </div>
                        <div className="mb-6">
                            <label className="block text-gray-700 text-sm font-bold mb-2">
                                Пароль
                            </label>
                            <input
                                type="password"
                                value={loginData.password}
                                onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
                                required
                                disabled={loading}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleLogin}
                            disabled={loading}
                            className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-blue-300"
                        >
                            {loading ? 'Вход...' : 'Войти'}
                        </button>
                    </div>
                    <div className="mt-4 text-sm text-gray-600 text-center">
                        <p>Тестовые данные для входа:</p>
                        <p><strong>Email:</strong> test@example.com</p>
                        <p><strong>Пароль:</strong> password123</p>
                    </div>
                </div>
            </div>
        );
    }

    // Главная страница
    return (
        <div className="min-h-screen w-full bg-gray-100">
            {/* Заголовок */}
            <header className="bg-white shadow-sm">
                <div className="w-full mx-auto px-4 py-4 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-800">
                        <Activity className="inline mr-2" />
                        Run Tracker
                    </h1>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowAddForm(true)}
                            disabled={loading}
                            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors disabled:bg-green-300"
                        >
                            Добавить пробежку
                        </button>
                        <button
                            onClick={handleLogout}
                            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                        >
                            Выйти
                        </button>
                    </div>
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-4 py-6">
                {error && (
                    <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                        {error}
                    </div>
                )}

                {/* Статистика */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div className="bg-white p-6 rounded-lg shadow">
                        <div className="flex items-center">
                            <Activity className="h-8 w-8 text-blue-500 mr-3" />
                            <div>
                                <p className="text-sm text-gray-600">Всего пробежек</p>
                                <p className="text-2xl font-bold">{stats.totalRuns}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow">
                        <div className="flex items-center">
                            <TrendingUp className="h-8 w-8 text-green-500 mr-3" />
                            <div>
                                <p className="text-sm text-gray-600">Общая дистанция</p>
                                <p className="text-2xl font-bold">{stats.totalDistance} км</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow">
                        <div className="flex items-center">
                            <Clock className="h-8 w-8 text-purple-500 mr-3" />
                            <div>
                                <p className="text-sm text-gray-600">Средний темп</p>
                                <p className="text-2xl font-bold">{stats.averagePace} мин/км</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Список пробежек */}
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b">
                        <h2 className="text-xl font-bold">История пробежек</h2>
                        {loading && <p className="text-sm text-gray-500">Загрузка...</p>}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Место</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дистанция</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Время</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Темп</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Фото</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Карта</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                            {runs.map((run) => (
                                <tr key={run.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">{run.date}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{run.location}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{run.distance} км</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{run.time} мин</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{run.pace} мин/км</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {run.photo ? (
                                            <button
                                                onClick={() => setShowPhoto(`${API_BASE_URL.replace('/api', '')}${run.photo}`)}
                                                className="text-blue-500 hover:text-blue-700"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button
                                            onClick={() => showRunOnMap(run)}
                                            className="text-blue-500 hover:text-blue-700"
                                            title="Показать на карте"
                                        >
                                            <MapPin className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                        {runs.length === 0 && !loading && (
                            <div className="px-6 py-12 text-center text-gray-500">
                                Пока нет пробежек. Добавьте первую!
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Форма добавления пробежки */}
            {showAddForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-96 max-h-96 overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">Добавить пробежку</h2>

                        {error && (
                            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
                                {error}
                            </div>
                        )}

                        <div>
                            <div className="mb-4">
                                <label className="block text-gray-700 text-sm font-bold mb-2">
                                    Дистанция (км) *
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={newRun.distance}
                                    onChange={(e) => setNewRun({...newRun, distance: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
                                    required
                                    disabled={loading}
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-gray-700 text-sm font-bold mb-2">
                                    Время (минуты) *
                                </label>
                                <input
                                    type="number"
                                    value={newRun.time}
                                    onChange={(e) => setNewRun({...newRun, time: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
                                    required
                                    disabled={loading}
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-gray-700 text-sm font-bold mb-2">
                                    Место *
                                </label>
                                <input
                                    type="text"
                                    value={newRun.location}
                                    onChange={(e) => setNewRun({...newRun, location: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
                                    placeholder="Например: Центральный парк, Москва"
                                    required
                                    disabled={loading}
                                />
                            </div>
                            <div className="mb-6">
                                <label className="block text-gray-700 text-sm font-bold mb-2">
                                    Фото (опционально)
                                </label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handlePhotoUpload}
                                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
                                    disabled={loading}
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAddForm(false);
                                        setError('');
                                    }}
                                    disabled={loading}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:text-gray-400"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAddRun}
                                    disabled={loading}
                                    className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-blue-300"
                                >
                                    {loading ? 'Сохранение...' : 'Сохранить'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Модал с картой */}
            {showMap && selectedRun && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Карта пробежки</h2>
                            <button
                                onClick={closeMap}
                                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                            >
                                ×
                            </button>
                        </div>

                        <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <p className="font-semibold text-gray-600">Место:</p>
                                <p>{selectedRun.location}</p>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-600">Дата:</p>
                                <p>{selectedRun.date}</p>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-600">Дистанция:</p>
                                <p>{selectedRun.distance} км</p>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-600">Время:</p>
                                <p>{selectedRun.time} мин</p>
                            </div>
                        </div>

                        {/* Контейнер для карты */}
                        <div
                            id="map-container"
                            className="w-full h-96 bg-gray-200 rounded-lg"
                            style={{ minHeight: '400px' }}
                        ></div>

                        <div className="mt-4 text-xs text-gray-500 text-center">
                            Powered by OpenStreetMap & Leaflet
                        </div>
                    </div>
                </div>
            )}

            {/* Модал с фото */}
            {showPhoto && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-lg">
                        <h2 className="text-xl font-bold mb-4">Фото пробежки</h2>
                        <img
                            src={showPhoto}
                            alt="Фото пробежки"
                            className="w-full h-auto rounded-lg mb-4 max-h-96 object-contain"
                            onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'block';
                            }}
                        />
                        <div style={{display: 'none'}} className="text-center text-gray-500 py-8">
                            Ошибка загрузки изображения
                        </div>
                        <button
                            onClick={() => setShowPhoto(null)}
                            className="w-full bg-gray-500 text-white py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors"
                        >
                            Закрыть
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RunTracker;