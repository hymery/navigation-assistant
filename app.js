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
        this.audioContext = null;
        this.isAudioUnlocked = false;
        
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
        
        // Разблокируем аудио при первом клике
        this.unlockAudio();
        
        // Загружаем нейросеть при старте
        await this.loadNeuralNetwork();
        
        this.updateStatus('Нейросеть загружена ✅');
        this.loading.style.display = 'none';
    }

    // Разблокировка аудио системы
    unlockAudio() {
        const unlock = () => {
            if (!this.isAudioUnlocked) {
                // Создаем и сразу останавливаем аудио контекст
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // Создаем короткий беззвучный сигнал для разблокировки
                const oscillator = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();
                gainNode.gain.value = 0; // Беззвучно!
                
                oscillator.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                
                oscillator.start();
                oscillator.stop(this.audioContext.currentTime + 0.001);
                
                this.isAudioUnlocked = true;
                console.log('✅ Аудио система разблокирована');
            }
        };

        // Разблокируем при любом клике
        document.addEventListener('click', unlock);
        this.mainBtn.addEventListener('click', unlock);
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
            
            // Запускаем приветственное сообщение с задержкой
            setTimeout(() => {
                this.speak('Навигационный помощник активирован');
            }, 1000);
            
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
        if (now - this.lastVoiceTime < 4000) return;
        
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

    // УЛУЧШЕННАЯ СИСТЕМА ГОЛОСОВЫХ ОПОВЕЩЕНИЙ
    speak(text) {
        // Метод 1: Web Speech API с улучшенными настройками
        if ('speechSynthesis' in window && this.isAudioUnlocked) {
            this.speakWithImprovedTTS(text);
        } else {
            // Метод 2: Аудио сигналы как запасной вариант
            this.playFallbackSound(text);
        }
    }

    // Улучшенный TTS с разными голосами
    speakWithImprovedTTS(text) {
        try {
            // Останавливаем предыдущее сообщение
            speechSynthesis.cancel();
            
            // Создаем новое сообщение с улучшенными настройками
            const utterance = new SpeechSynthesisUtterance(text);
            
            // ОПТИМАЛЬНЫЕ НАСТРОЙКИ ДЛЯ ЕСТЕСТВЕННОСТИ
            utterance.lang = 'ru-RU';
            utterance.rate = 0.85;    // Немного медленнее для естественности
            utterance.pitch = 1.1;    // Чуть выше для лучшей разборчивости
            utterance.volume = 1.0;
            
            // Пытаемся найти лучший голос
            const voices = speechSynthesis.getVoices();
            const russianVoice = voices.find(voice => 
                voice.lang.includes('ru') || voice.lang.includes('RU')
            );
            
            if (russianVoice) {
                utterance.voice = russianVoice;
                console.log('✅ Используем русский голос:', russianVoice.name);
            }
            
            // Обработчики событий для отладки
            utterance.onstart = () => {
                console.log('🔊 Начало речи:', text);
            };
            
            utterance.onend = () => {
                console.log('🔊 Конец речи');
            };
            
            utterance.onerror = (event) => {
                console.error('❌ Ошибка речи:', event.error);
                // Пробуем запасной метод
                this.playFallbackSound(text);
            };
            
            // Произносим с небольшой задержкой
            setTimeout(() => {
                speechSynthesis.speak(utterance);
            }, 100);
            
        } catch (error) {
            console.error('❌ Ошибка TTS:', error);
            this.playFallbackSound(text);
        }
    }

    // Запасная система звуковых сигналов
    playFallbackSound(text) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Разные тона для разных типов сообщений
            if (text.includes('Внимание')) {
                // Высокие прерывистые сигналы для опасности
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
                oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.2);
            } else {
                // Плавный тон для обычных сообщений
                oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
            }
            
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.5);
            
            console.log('🔊 Аудио сигнал для:', text);
            
        } catch (error) {
            console.error('❌ Ошибка аудио сигнала:', error);
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
document.addEventListener('DOMContentLoaded', () => {
    // Ждем загрузки голосов
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => {
            new NavigationAssistant();
        };
    } else {
        new NavigationAssistant();
    }
});

// Глобальная функция для тестирования голоса
window.testVoice = function() {
    const test = new NavigationAssistant();
    setTimeout(() => {
        test.speak('Тестовое сообщение для проверки голоса');
    }, 1000);
};
