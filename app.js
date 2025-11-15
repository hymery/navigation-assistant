class NavigationAssistant {
    constructor() {
        this.video = document.getElementById('webcam');
        this.mainBtn = document.getElementById('mainBtn');
        this.status = document.getElementById('status');
        this.loading = document.getElementById('loading');
        this.progress = document.getElementById('progress');
        this.progressText = document.getElementById('progressText');
        this.warning = document.getElementById('warning');
        
        this.isRunning = false;
        this.model = null;
        this.lastVoiceTime = 0;
        this.ttsServer = 'https://your-tts-server.herokuapp.com'; // ЗАМЕНИ НА СВОЙ URL
        
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
        
        // Загружаем систему с прогресс-баром
        await this.loadSystemWithProgress();
    }

    async loadSystemWithProgress() {
        try {
            // Этап 1: Загрузка TensorFlow.js
            this.updateProgress(10, 'Загрузка ядра AI...');
            await this.wait(1000);
            
            // Этап 2: Инициализация бэкенда
            this.updateProgress(30, 'Инициализация графики...');
            await tf.setBackend('webgl');
            await this.wait(500);
            
            // Этап 3: Загрузка модели
            this.updateProgress(50, 'Загрузка нейросети...');
            this.model = await cocoSsd.load({
                base: 'mobilenet_v2'
            });
            
            // Этап 4: Финальная настройка
            this.updateProgress(80, 'Оптимизация системы...');
            await this.wait(1000);
            
            // Этап 5: Готово
            this.updateProgress(100, 'Система готова!');
            await this.wait(500);
            
            this.systemReady();
            
        } catch (error) {
            console.error('❌ Ошибка загрузки:', error);
            this.systemReadyWithError();
        }
    }

    updateProgress(percent, text) {
        this.progress.style.width = percent + '%';
        this.progressText.textContent = text;
        this.status.textContent = text;
        console.log(`📊 Прогресс: ${percent}% - ${text}`);
    }

    systemReady() {
        this.loading.style.display = 'none';
        this.mainBtn.disabled = false;
        this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ НАВИГАЦИЮ';
        this.updateStatus('✅ Система готова к работе');
        this.speak('Система навигации готова');
    }

    systemReadyWithError() {
        this.loading.style.display = 'none';
        this.mainBtn.disabled = false;
        this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ НАВИГАЦИЮ';
        this.updateStatus('⚠️ Режим ограниченной навигации');
        this.speak('Система готова в ограниченном режиме');
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async toggleNavigation() {
        if (this.isRunning) {
            this.stopNavigation();
        } else {
            await this.startNavigation();
        }
    }

    async startNavigation() {
        try {
            this.updateStatus('Запуск камеры...');
            
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
            
            this.video.srcObject = stream;
            
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
                };
            });
            
            this.isRunning = true;
            this.mainBtn.textContent = '⏹ ОСТАНОВИТЬ НАВИГАЦИЮ';
            this.mainBtn.style.background = '#ff4444';
            
            this.updateStatus('Навигация активна');
            this.speak('Навигационный помощник активирован');
            
            this.startObjectDetection();
            
        } catch (error) {
            console.error('❌ Ошибка камеры:', error);
            this.updateStatus('❌ Ошибка доступа к камере');
            this.speak('Не удалось запустить камеру');
        }
    }

    async startObjectDetection() {
        if (!this.isRunning) return;
        
        try {
            const predictions = await this.model.detect(this.video);
            this.processPredictions(predictions);
            
        } catch (error) {
            console.error('❌ Ошибка обнаружения:', error);
            this.updateStatus('Ошибка анализа');
        }
        
        if (this.isRunning) {
            setTimeout(() => this.startObjectDetection(), 2000);
        }
    }

    processPredictions(predictions) {
        const confidentPredictions = predictions.filter(pred => pred.score > 0.6);
        
        if (confidentPredictions.length === 0) {
            this.updateStatus('Объекты не обнаружены');
            return;
        }
        
        confidentPredictions.sort((a, b) => b.score - a.score);
        const mainObjects = confidentPredictions.slice(0, 2);
        const mainObject = mainObjects[0];
        
        this.processMainObject(mainObject);
    }

    processMainObject(prediction) {
        const now = Date.now();
        if (now - this.lastVoiceTime < 4000) return;
        
        const direction = this.getObjectDirection(prediction.bbox);
        const distance = this.estimateDistance(prediction.bbox);
        const objectName = this.getRussianName(prediction.class);
        const isDangerous = this.isObjectDangerous(prediction.class, distance);
        
        if (isDangerous) {
            this.warning.textContent = `⚠️ ${objectName} ${direction} в ${distance}м`;
            this.warning.style.display = 'block';
            this.speak(`Внимание! ${objectName} ${direction} в ${distance} метрах`);
            this.updateStatus(`⚠️ ${objectName} ${direction} • ${distance}м`);
        } else {
            this.warning.style.display = 'none';
            this.speak(`${objectName} ${direction} в ${distance} метрах`);
            this.updateStatus(`${objectName} ${direction} • ${distance}м`);
        }
        
        this.lastVoiceTime = now;
    }

    getObjectDirection(bbox) {
        const [x, y, width, height] = bbox;
        const centerX = x + width / 2;
        const screenThird = this.video.videoWidth / 3;
        
        if (centerX < screenThird) return 'слева';
        if (centerX > 2 * screenThird) return 'справа';
        return 'впереди';
    }

    estimateDistance(bbox) {
        const [x, y, width, height] = bbox;
        const objectSize = width * height;
        const maxSize = this.video.videoWidth * this.video.videoHeight;
        const relativeSize = objectSize / maxSize;
        
        if (relativeSize > 0.3) return '1-2';
        if (relativeSize > 0.15) return '3-4';
        if (relativeSize > 0.05) return '5-7';
        return '8-10';
    }

    getRussianName(englishName) {
        const dictionary = {
            'person': 'человек', 'car': 'автомобиль', 'truck': 'грузовик', 'bus': 'автобус',
            'bicycle': 'велосипед', 'motorcycle': 'мотоцикл', 'cat': 'кошка', 'dog': 'собака',
            'chair': 'стул', 'dining table': 'стол', 'potted plant': 'растение', 'tv': 'телевизор',
            'laptop': 'ноутбук', 'cell phone': 'телефон', 'book': 'книга', 'bottle': 'бутылка',
            'bench': 'скамейка', 'backpack': 'рюкзак', 'umbrella': 'зонт', 'handbag': 'сумка',
            'teddy bear': 'игрушка', 'vase': 'ваза', 'scissors': 'ножницы', 'toothbrush': 'зубная щетка'
        };
        return dictionary[englishName] || englishName;
    }

    isObjectDangerous(className, distance) {
        const dangerousObjects = ['car', 'truck', 'bus', 'motorcycle'];
        const closeDistance = distance.includes('1-2') || distance.includes('3-4');
        return dangerousObjects.includes(className) && closeDistance;
    }

    async speak(text) {
        try {
            console.log('🔊 gTTS:', text);
            
            const encodedText = encodeURIComponent(text);
            const audioUrl = `${this.ttsServer}/speak/${encodedText}`;
            
            const audio = new Audio();
            audio.src = audioUrl;
            
            await new Promise((resolve, reject) => {
                audio.onloadeddata = () => {
                    audio.play().then(resolve).catch(reject);
                };
                audio.onerror = reject;
                setTimeout(() => reject(new Error('Audio timeout')), 5000);
            });
            
        } catch (error) {
            console.error('❌ Ошибка gTTS:', error);
            this.speakFallback(text);
        }
    }

    speakFallback(text) {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ru-RU';
            utterance.rate = 0.9;
            speechSynthesis.speak(utterance);
        }
    }

    stopNavigation() {
        this.isRunning = false;
        speechSynthesis.cancel();
        
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
        
        this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ НАВИГАЦИЮ';
        this.mainBtn.style.background = '#00ff00';
        this.updateStatus('Навигация остановлена');
        this.warning.style.display = 'none';
    }

    updateStatus(message) {
        this.status.textContent = message;
    }
}

// Инициализация при загрузке страницы
window.addEventListener('load', () => {
    new NavigationAssistant();
});
