// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'your-secret-key-change-in-production';

// Middleware
app.use(cors({
    origin: 'https://run-tracker-front.onrender.com',
    credentials: true,
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Создаем папку для загрузок если не существует
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Проверяем что это изображение
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Только изображения разрешены!'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

// Имитация базы данных в памяти
let users = [
    {
        id: 1,
        email: 'test@example.com',
        password: '$2b$10$BcLGNFsmZozwByubDlFdYOxthVZkaGbpcAX/RB5anoMEjYaWzOX32' // password123
    }
];

let runs = [
    {
        id: 1,
        userId: 1,
        date: '15.07.2024',
        distance: 5.2,
        time: 28,
        location: 'Шымкент',
        pace: '5.38',
        photo: null,
        createdAt: new Date('2024-07-15')
    },
    {
        id: 2,
        userId: 1,
        date: '18.07.2024',
        distance: 3.5,
        time: 20,
        location: 'Астана',
        pace: '5.71',
        photo: null,
        createdAt: new Date('2024-07-18')
    }
];

// Middleware для проверки токена
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Токен доступа не предоставлен' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Недействительный токен' });
        }
        req.user = user;
        next();
    });
};

// ROUTES

// Авторизация
app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email и пароль обязательны' });
        }

        // Находим пользователя
        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }

        // Проверяем пароль
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Неверные учетные пароль' });
        }

        // Создаем токен
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Ошибка авторизации:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получить все пробежки пользователя
app.get('/runs', authenticateToken, (req, res) => {
    try {
        const userRuns = runs
            .filter(run => run.userId === req.user.userId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({
            success: true,
            runs: userRuns
        });
    } catch (error) {
        console.error('Ошибка получения пробежек:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Добавить новую пробежку
app.post('/runs', authenticateToken, upload.single('photo'), (req, res) => {
    try {
        const { distance, time, location } = req.body;

        // Валидация
        if (!distance || !time || !location) {
            return res.status(400).json({
                error: 'Дистанция, время и место обязательны'
            });
        }

        const distanceNum = parseFloat(distance);
        const timeNum = parseInt(time);

        if (isNaN(distanceNum) || isNaN(timeNum) || distanceNum <= 0 || timeNum <= 0) {
            return res.status(400).json({
                error: 'Дистанция и время должны быть положительными числами'
            });
        }

        // Создаем новую пробежку
        const newRun = {
            id: Math.max(...runs.map(r => r.id), 0) + 1,
            userId: req.user.userId,
            date: new Date().toLocaleDateString('ru-RU'),
            distance: distanceNum,
            time: timeNum,
            location: location.trim(),
            pace: (timeNum / distanceNum).toFixed(2),
            photo: req.file ? `/uploads/${req.file.filename}` : null,
            createdAt: new Date()
        };

        runs.push(newRun);

        res.status(201).json({
            success: true,
            run: newRun
        });

    } catch (error) {
        console.error('Ошибка добавления пробежки:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получить статистику пользователя
app.get('/stats', authenticateToken, (req, res) => {
    try {
        const userRuns = runs.filter(run => run.userId === req.user.userId);

        if (userRuns.length === 0) {
            return res.json({
                success: true,
                stats: {
                    totalRuns: 0,
                    totalDistance: 0,
                    averagePace: 0
                }
            });
        }

        const totalDistance = userRuns.reduce((sum, run) => sum + run.distance, 0);
        const averagePace = userRuns.reduce((sum, run) => sum + parseFloat(run.pace), 0) / userRuns.length;

        res.json({
            success: true,
            stats: {
                totalRuns: userRuns.length,
                totalDistance: parseFloat(totalDistance.toFixed(1)),
                averagePace: parseFloat(averagePace.toFixed(2))
            }
        });

    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получить конкретную пробежку
app.get('/runs/:id', authenticateToken, (req, res) => {
    try {
        const runId = parseInt(req.params.id);
        const run = runs.find(r => r.id === runId && r.userId === req.user.userId);

        if (!run) {
            return res.status(404).json({ error: 'Пробежка не найдена' });
        }

        res.json({
            success: true,
            run
        });

    } catch (error) {
        console.error('Ошибка получения пробежки:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Удалить пробежку
app.delete('/runs/:id', authenticateToken, (req, res) => {
    try {
        const runId = parseInt(req.params.id);
        const runIndex = runs.findIndex(r => r.id === runId && r.userId === req.user.userId);

        if (runIndex === -1) {
            return res.status(404).json({ error: 'Пробежка не найдена' });
        }

        const deletedRun = runs[runIndex];

        // Удаляем фото если есть
        if (deletedRun.photo) {
            const photoPath = path.join(__dirname, deletedRun.photo);
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
        }

        runs.splice(runIndex, 1);

        res.json({
            success: true,
            message: 'Пробежка удалена'
        });

    } catch (error) {
        console.error('Ошибка удаления пробежки:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Обработка ошибок
app.use((error, req, res, next) => {
    console.error(error);

    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Файл слишком большой (максимум 5MB)' });
        }
    }

    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// 404 для неизвестных роутов
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Эндпоинт не найден' });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`API доступно по адресу: http://localhost:${PORT}/api`);
    console.log('\nДоступные эндпоинты:');
    console.log('POST /auth/login - Авторизация');
    console.log('GET  /runs - Получить все пробежки');
    console.log('POST /runs - Добавить пробежку');
    console.log('GET  /stats - Получить статистику');
    console.log('GET  /runs/:id - Получить пробежку по ID');
    console.log('DELETE /runs/:id - Удалить пробежку');
    console.log('\nТестовые данные для входа:');
    console.log('Email: test@example.com');
    console.log('Пароль: password123');
});

module.exports = app;