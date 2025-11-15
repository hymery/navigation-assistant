// Главный класс навигационного помощника
class NavigationAssistant {
    constructor() {
        // Основные элементы
        this.video = document.getElementById('webcam');
        this.mainBtn = document.getElementById('mainBtn');
        this.status = document.getElementById('status');
        this.loading = document.getElementById('loading');
        
        // Состояние системы
        this.isRunning = false;
        this.model = null;
        this.lastVoiceTime = 0;
        
        // Инициализация Telegram Web App
        this.tg = window.Telegram.WebApp;
        
        this.init();
    }

    async init() {
        console.log('🚀 Инициализация навигационного помощника...');
        
        // Инициализируем Telegram Web App
        this.tg.expand();
        this.tg.enableClosingConfirmation();
        
        // Настраиваем кнопку
        this.mainBtn.addEventListener('click', () => this.toggleNavigation());
        
        // Загружаем нейросеть при старте
        await this.loadNeuralNetwork();
        
        this.updateStatus('Нейросеть загружена ✅');
        this.loading.style.display = 'none';
    }

    // Загрузка нейросети COCO-SSD
    async loadNeuralNetwork() {
        try {
            this.updateStatus('Загрузка нейросети...');
            
            // Загружаем модель COCO-SSD
            this.model = await cocoSsd.load({
                base: 'mobilenet_v2'
            });
            
            console.log('✅ Нейросеть загружена');
            this.updateStatus('Нейросеть готова');
            
        } catch (error) {
            console.error('❌ Ошибка загрузки нейросети:', error);
            this.updateStatus('Ошибка загрузки нейросети');
        }
    }

    // Переключение навигации
    async toggleNavigation() {
        if (this.isRunning) {
            this.stopNavigation();
        } else {
            await this.startNavigation();
        }
    }

    // Запуск навигации
    async startNavigation() {
        try {
            this.updateStatus('Запуск камеры...');
            
            // Запрашиваем доступ к камере
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
            
            // Подключаем поток к видео
            this.video.srcObject = stream;
            
            // Ждем загрузки видео
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
                };
            });
            
            // Обновляем интерфейс
            this.isRunning = true;
            this.mainBtn.textContent = '⏹ ОСТАНОВИТЬ НАВИГАЦИЮ';
            this.mainBtn.style.background = '#ff4444';
            
            this.updateStatus('Навигация активна');
            this.speak('Навигационный помощник активирован');
            
            // Запускаем обнаружение объектов
            this.startObjectDetection();
            
        } catch (error) {
            console.error('❌ Ошибка камеры:', error);
            this.updateStatus('Ошибка доступа к камере');
            this.speak('Не удалось запустить камеру');
        }
    }

    // Основной цикл обнаружения объектов
    async startObjectDetection() {
        if (!this.isRunning || !this.model) return;
        
        try {
            // Обнаружение объектов с помощью нейросети
            const predictions = await this.model.detect(this.video);
            
            // Обрабатываем результаты
            this.processPredictions(predictions);
            
        } catch (error) {
            console.error('❌ Ошибка обнаружения:', error);
        }
        
        // Продолжаем каждые 2 секунды
        if (this.isRunning) {
            setTimeout(() => this.startObjectDetection(), 2000);
        }
    }

    // Обработка обнаруженных объектов
    processPredictions(predictions) {
        // Фильтруем только уверенные предсказания
        const confidentPredictions = predictions.filter(pred => pred.score > 0.6);
        
        if (confidentPredictions.length === 0) {
            this.updateStatus('Объекты не обнаружены');
            return;
        }
        
        // Сортируем по уверенности
        confidentPredictions.sort((a, b) => b.score - a.score);
        
        // Берем 2 самых уверенных объекта
        const mainObjects = confidentPredictions.slice(0, 2);
        
        // Обрабатываем главный объект
        const mainObject = mainObjects[0];
        this.processMainObject(mainObject);
    }

    // Обработка главного объекта
    processMainObject(prediction) {
        const now = Date.now();
        
        // Защита от спама голосовых сообщений
        if (now - this.lastVoiceTime < 3000) return;
        
        // Определяем направление объекта
        const direction = this.getObjectDirection(prediction.bbox);
        
        // Определяем расстояние (приблизительно)
        const distance = this.estimateDistance(prediction.bbox);
        
        // Русское название объекта
        const objectName = this.getRussianName(prediction.class);
        
        // Проверяем опасность объекта
        const isDangerous = this.isObjectDangerous(prediction.class, distance);
        
        // Голосовое оповещение
        if (isDangerous) {
            this.speak(`Внимание! ${objectName} ${direction} в ${distance} метрах`);
            this.updateStatus(`⚠️ ${objectName} ${direction} • ${distance}м`);
        } else {
            this.speak(`${objectName} ${direction} в ${distance} метрах`);
            this.updateStatus(`${objectName} ${direction} • ${distance}м`);
        }
        
        this.lastVoiceTime = now;
    }

    // Определение направления объекта
    getObjectDirection(bbox) {
        const [x, y, width, height] = bbox;
        const centerX = x + width / 2;
        const screenThird = this.video.videoWidth / 3;
        
        if (centerX < screenThird) return 'слева';
        if (centerX > 2 * screenThird) return 'справа';
        return 'впереди';
    }

    // Приблизительная оценка расстояния
    estimateDistance(bbox) {
        const [x, y, width, height] = bbox;
        
        // Чем больше объект на экране - тем он ближе
        const objectSize = width * height;
        const maxSize = this.video.videoWidth * this.video.videoHeight;
        const relativeSize = objectSize / maxSize;
        
        // Преобразуем в метры
        if (relativeSize > 0.3) return '1-2';
        if (relativeSize > 0.15) return '3-4';
        if (relativeSize > 0.05) return '5-7';
        return '8-10';
    }

    // Русские названия объектов
    getRussianName(englishName) {
        const dictionary = {
            'person': 'человек',
            'car': 'автомобиль',
            'truck': 'грузовик',
            'bus': 'автобус',
            'bicycle': 'велосипед',
            'motorcycle': 'мотоцикл',
            'cat': 'кошка',
            'dog': 'собака',
            'chair': 'стул',
            'dining table': 'стол',
            'potted plant': 'растение',
            'tv': 'телевизор',
            'laptop': 'ноутбук',
            'cell phone': 'телефон',
            'book': 'книга',
            'cup': 'чашка',
            'bottle': 'бутылка',
            'bench': 'скамейка',
            'backpack': 'рюкзак',
            'umbrella': 'зонт',
            'handbag': 'сумка'
        };
        
        return dictionary[englishName] || englishName;
    }

    // Проверка опасности объекта
    isObjectDangerous(className, distance) {
        const dangerousObjects = ['car', 'truck', 'bus', 'motorcycle'];
        const closeDistance = distance.includes('1-2') || distance.includes('3-4');
        
        return dangerousObjects.includes(className) && closeDistance;
    }

    // Голосовое оповещение
    speak(text) {
        if ('speechSynthesis' in window) {
            // Останавливаем предыдущее сообщение
            speechSynthesis.cancel();
            
            // Создаем новое сообщение
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ru-RU';
            utterance.rate = 0.8;
            utterance.pitch = 1.0;
            
            // Произносим
            speechSynthesis.speak(utterance);
        }
    }

    // Остановка навигации
    stopNavigation() {
        this.isRunning = false;
        
        // Останавливаем речь
        speechSynthesis.cancel();
        
        // Отключаем камеру
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
        
        // Обновляем интерфейс
        this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ НАВИГАЦИЮ';
        this.mainBtn.style.background = '#00ff00';
        this.updateStatus('Навигация остановлена');
    }

    // Обновление статуса
    updateStatus(message) {
        this.status.textContent = message;
    }
}

// Инициализация при загрузке страницы
window.addEventListener('load', () => {
    new NavigationAssistant();
});
