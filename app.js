class NavigationAssistant {
    constructor() {
        this.video = document.getElementById('webcam');
        this.mainBtn = document.getElementById('mainBtn');
        this.status = document.getElementById('status');
        this.warning = document.getElementById('warning');
        this.debug = document.getElementById('debug');
        
        this.isRunning = false;
        this.model = null;
        this.lastVoiceTime = 0;
        this.speechSynthesizer = null;
        this.detectionInterval = null;
        
        this.init();
    }

    async init() {
        console.log('🚀 Инициализация навигационного помощника...');
        this.updateDebug('Начало инициализации');
        
        // Инициализация Telegram Web App
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.expand();
        }
        
        // Инициализация системы озвучки
        await this.initSpeechSynthesizer();
        
        // Назначаем обработчик кнопки
        this.mainBtn.addEventListener('click', () => this.toggleNavigation());
        
        // Загружаем модель
        await this.loadModel();
    }

    async initSpeechSynthesizer() {
        try {
            if (window.speechSynthesizer) {
                this.speechSynthesizer = window.speechSynthesizer;
                console.log('✅ Система озвучки подключена');
                this.updateDebug('Озвучка: Yandex SpeechKit');
            } else {
                this.speechSynthesizer = {
                    speakText: (text) => {
                        this.fallbackSpeak(text);
                    },
                    quickSpeak: (text) => {
                        this.fallbackSpeak(text);
                    }
                };
                this.updateDebug('Озвучка: стандартный синтез');
            }
        } catch (error) {
            console.error('Ошибка инициализации синтезатора:', error);
            this.updateDebug('Озвучка: ошибка');
        }
    }

    async loadModel() {
        try {
            this.updateStatus('🔄 ЗАГРУЗКА НЕЙРОСЕТИ...');
            this.updateDebug('Проверка TensorFlow...');
            
            // Ждем полной загрузки TensorFlow
            if (typeof tf === 'undefined') {
                this.updateDebug('Ожидание TensorFlow...');
                await this.waitForTensorFlow();
            }
            
            if (typeof cocoSsd === 'undefined') {
                throw new Error('COCO-SSD не загружен');
            }
            
            this.updateDebug('Начинаем загрузку модели...');
            
            // ПРОСТАЯ ЗАГРУЗКА БЕЗ ТАЙМАУТОВ
            this.model = await cocoSsd.load();
            
            console.log('✅ Модель загружена!', this.model);
            this.updateDebug('Модель успешно загружена');
            
            this.mainBtn.disabled = false;
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
            this.updateStatus('✅ СИСТЕМА ГОТОВА');
            
            // Тестовое сообщение
            setTimeout(() => {
                this.speak('Система навигации готова к работе');
            }, 500);
            
        } catch (error) {
            console.error('❌ Ошибка загрузки модели:', error);
            this.updateStatus('❌ ОШИБКА ЗАГРУЗКИ');
            this.updateDebug('Ошибка: ' + error.message);
            
            // СОЗДАЕМ ЗАГЛУШКУ ДЛЯ ТЕСТИРОВАНИЯ
            this.createMockModel();
            
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ (ТЕСТ РЕЖИМ)';
            this.mainBtn.disabled = false;
        }
    }

    // Ожидание загрузки TensorFlow
    waitForTensorFlow() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const checkTF = () => {
                attempts++;

if (typeof tf !== 'undefined') {
                    resolve();
                } else if (attempts > 50) { // 10 секунд
                    reject(new Error('TensorFlow не загрузился'));
                } else {
                    setTimeout(checkTF, 200);
                }
            };
            checkTF();
        });
    }

    // Заглушка модели для тестирования
    createMockModel() {
        console.log('🔄 Создаем тестовую модель...');
        this.model = {
            detect: async (video) => {
                // Имитация обнаружения объектов
                const mockDetections = [
                    {
                        bbox: [100, 100, 200, 300],
                        class: 'person',
                        score: 0.95
                    },
                    {
                        bbox: [300, 150, 100, 150],
                        class: 'chair',
                        score: 0.87
                    }
                ];
                
                // Случайно возвращаем объекты или пустой массив
                return Math.random() > 0.3 ? mockDetections : [];
            }
        };
        this.updateDebug('✅ Тестовая модель создана');
        this.speak('Включен тестовый режим');
    }

    async toggleNavigation() {
        if (this.isRunning) {
            await this.stopNavigation();
        } else {
            await this.startNavigation();
        }
    }

    async startNavigation() {
        try {
            this.updateStatus('📷 АКТИВАЦИЯ КАМЕРЫ...');
            this.updateDebug('Запрос доступа к камере...');
            
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
            
            this.video.srcObject = stream;
            
            // Ждем загрузки видео
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play().then(resolve).catch(resolve);
                };
            });
            
            this.isRunning = true;
            this.mainBtn.textContent = '⏹ ОСТАНОВИТЬ СКАНИРОВАНИЕ';
            this.updateStatus('🔍 СКАНИРОВАНИЕ АКТИВНО');
            this.updateDebug('Камера активирована, начинаем обнаружение');
            
            this.speak('Сканирование окружения активировано');
            
            // Запускаем обнаружение
            this.startDetection();
            
        } catch (error) {
            console.error('Ошибка камеры:', error);
            this.updateStatus('❌ ОШИБКА КАМЕРЫ');
            this.updateDebug('Ошибка камеры: ' + error.message);
            this.speak('Ошибка доступа к камере');
        }
    }

    async startDetection() {
        if (!this.isRunning || !this.model) return;
        
        try {
            const predictions = await this.model.detect(this.video);
            const filtered = this.filterObjects(predictions);
            this.processObjects(filtered);
            
        } catch (error) {
            console.error('Ошибка обнаружения:', error);
            this.updateDebug('Ошибка обнаружения: ' + error.message);
        }

        // Продолжаем обнаружение
        if (this.isRunning) {
            this.detectionInterval = setTimeout(() => this.startDetection(), 1500);
        }
    }

    filterObjects(predictions) {
        const targetClasses = [
            'person', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
            'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train',
            'chair', 'couch', 'potted plant', 'bed',
            'traffic light', 'stop sign', 'bench'
        ];
        
        return predictions
            .filter(pred => pred.score > 0.4 && targetClasses.includes(pred.class))
            .sort((a, b) => b.score - a.score);
    }

processObjects(objects) {
        if (objects.length === 0) {
            this.updateStatus('👁️ ОБЪЕКТЫ НЕ ОБНАРУЖЕНЫ');
            
            // Озвучиваем только если долго нет объектов
            if (Date.now() - this.lastVoiceTime > 10000) {
                this.speak('Объекты не обнаружены, продолжайте движение');
                this.lastVoiceTime = Date.now();
            }
            return;
        }
        
        const mainObject = objects[0];
        const now = Date.now();
        
        // Ограничиваем частоту озвучки
        if (now - this.lastVoiceTime < 5000) return;
        
        const direction = this.getDirection(mainObject.bbox);
        const distance = this.getDistance(mainObject.bbox);
        const name = this.getRussianName(mainObject.class);
        const dangerous = this.isDangerous(mainObject.class, distance);
        
        // Обновляем интерфейс
        if (dangerous) {
            this.warning.textContent = ⚠️ ${name} ${direction} ${distance}М;
            this.warning.style.display = 'block';
            this.speak(ВНИМАНИЕ! ${name} ${direction} ${distance} МЕТРОВ);
            this.updateStatus(⚠️ ${name} ${direction});
        } else {
            this.warning.style.display = 'none';
            this.speak(${name} ${direction} ${distance} МЕТРОВ);
            this.updateStatus(${name} ${direction} ${distance}М);
        }
        
        this.lastVoiceTime = now;
        this.updateDebug(Обнаружено: ${objects.length} объектов);
    }

    getDirection(bbox) {
        const [x, , width] = bbox;
        const centerX = x + width / 2;
        
        if (!this.video.videoWidth) return 'впереди';
        
        const third = this.video.videoWidth / 3;
        if (centerX < third) return 'слева';
        if (centerX > 2 * third) return 'справа';
        return 'впереди';
    }

    getDistance(bbox) {
        const [, , width, height] = bbox;
        const size = width * height;
        
        if (!this.video.videoWidth || !this.video.videoHeight) return '5-7';
        
        const maxSize = this.video.videoWidth * this.video.videoHeight;
        const percent = size / maxSize;
        
        if (percent > 0.3) return '1-2';
        if (percent > 0.15) return '3-4';
        if (percent > 0.05) return '5-7';
        return '8-10';
    }

    getRussianName(englishName) {
        const names = {
            'person': 'человек',
            'bird': 'птица', 'cat': 'кошка', 'dog': 'собака',
            'horse': 'лошадь', 'sheep': 'овца', 'cow': 'корова',
            'car': 'автомобиль', 'truck': 'грузовик', 'bus': 'автобус',
            'motorcycle': 'мотоцикл', 'bicycle': 'велосипед', 'train': 'поезд',
            'chair': 'стул', 'couch': 'диван', 'potted plant': 'растение',
            'bed': 'кровать', 'traffic light': 'светофор',
            'stop sign': 'знак остановки', 'bench': 'скамейка'
        };
        return names[englishName] || englishName;
    }

    isDangerous(className, distance) {
        const dangerous = ['car', 'truck', 'bus', 'motorcycle', 'train'];
        const close = distance.includes('1-2') || distance.includes('3-4');
        return dangerous.includes(className) && close;
    }

    speak(text) {
        console.log('🔊 Озвучка:', text);
        
        if (this.speechSynthesizer && this.speechSynthesizer.quickSpeak) {
            this.speechSynthesizer.quickSpeak(text);
        } else {
            this.fallbackSpeak(text);
        }
    }

    fallbackSpeak(text) {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ru-RU';
            utterance.rate = 0.9;
            utterance.pitch = 0.8;
            speechSynthesis.speak(utterance);
        }
    }
async stopNavigation() {
        this.isRunning = false;
        
        // Останавливаем обнаружение
        if (this.detectionInterval) {
            clearTimeout(this.detectionInterval);
            this.detectionInterval = null;
        }
        
        // Останавливаем речь
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        
        // Останавливаем камеру
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
        
        this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
        this.updateStatus('✅ СКАНИРОВАНИЕ ОСТАНОВЛЕНО');
        this.warning.style.display = 'none';
        this.updateDebug('Сканирование остановлено');
        
        this.speak('Сканирование остановлено');
    }

    updateStatus(message) {
        this.status.textContent = message;
    }

    updateDebug(message) {
        this.debug.textContent = message;
        console.log('DEBUG:', message);
    }
}

// Запуск приложения
window.addEventListener('load', () => {
    console.log('🎯 Запуск навигационного помощника...');
    window.navigationAssistant = new NavigationAssistant();
});

// Глобальные функции для отладки
window.testModel = async function() {
    if (window.navigationAssistant && window.navigationAssistant.model) {
        console.log('✅ Модель доступна:', window.navigationAssistant.model);
        return true;
    } else {
        console.log('❌ Модель не загружена');
        return false;
    }
};
