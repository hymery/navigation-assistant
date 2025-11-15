class NavigationAssistant {
    constructor() {
        this.video = document.getElementById('webcam');
        this.mainBtn = document.getElementById('mainBtn');
        this.status = document.getElementById('status');
        this.warning = document.getElementById('warning');
        
        this.isRunning = false;
        this.model = null;
        this.lastVoiceTime = 0;
        
        this.init();
    }

    async init() {
        console.log('🚀 Инициализация навигационного помощника...');
        
        // Инициализация Telegram Web App
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.expand();
        }
        
        this.mainBtn.addEventListener('click', () => this.toggleNavigation());
        
        // Загрузка COCO-SSD модели
        await this.loadModel();
    }

    async loadModel() {
        try {
            this.updateStatus('🔄 Загрузка нейросети...');
            
            // Загружаем COCO-SSD модель
            this.model = await cocoSsd.load({
                base: 'lite_mobilenet_v2' // Легкая версия для телефонов
            });
            
            console.log('✅ COCO-SSD модель загружена');
            this.mainBtn.disabled = false;
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
            this.updateStatus('✅ Система готова к работе');
            
        } catch (error) {
            console.error('❌ Ошибка загрузки модели:', error);
            this.updateStatus('❌ Ошибка загрузки нейросети');
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ (режим без AI)';
            this.mainBtn.disabled = false;
        }
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
            this.updateStatus('🔍 Активация сканирования...');
            
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
            this.mainBtn.textContent = '⏹ ОСТАНОВИТЬ СКАНИРОВАНИЕ';
            this.mainBtn.classList.add('stop');
            
            this.updateStatus('📡 Сканирование окружения...');
            this.speak('Сканирование активировано');
            
            this.startDetection();
            
        } catch (error) {
            console.error('❌ Ошибка камеры:', error);
            this.updateStatus('❌ Ошибка доступа к камере');
            this.speak('Не удалось активировать камеру');
        }
    }

    async startDetection() {
        if (!this.isRunning) return;
        
        try {
            let predictions = [];
            
            if (this.model) {
                // Используем COCO-SSD для обнаружения объектов
                predictions = await this.model.detect(this.video);
                predictions = this.filterRelevantObjects(predictions);
            }
            
            this.processDetections(predictions);
            
        } catch (error) {
            console.error('❌ Ошибка обнаружения:', error);
        }

        // Продолжаем сканирование
        if (this.isRunning) {
            setTimeout(() => this.startDetection(), 2000);
        }
    }

    // ФИЛЬТРАЦИЯ ОБЪЕКТОВ ПО ТЗ
    filterRelevantObjects(predictions) {
        const relevantClasses = [
            // Люди, животные
            'person', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
            
            // Препятствия
            'chair', 'couch', 'potted plant', 'bed', 
            
            // Транспорт
            'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train', 'airplane',
            
            // Инфраструктура
            'traffic light', 'stop sign', 'bench'
        ];
        
        return predictions
            .filter(pred => pred.score > 0.5 && relevantClasses.includes(pred.class))
            .sort((a, b) => b.score - a.score);
    }

    processDetections(predictions) {
        if (predictions.length === 0) {
            this.updateStatus('📍 Объекты не обнаружены');
            return;
        }
        
        // Берем 2 самых уверенных объекта
        const mainObjects = predictions.slice(0, 2);
        this.processMainObjects(mainObjects);
    }

    processMainObjects(objects) {
        const now = Date.now();
        if (now - this.lastVoiceTime < 4000) return;
        
        const mainObject = objects[0];
        const direction = this.getObjectDirection(mainObject.bbox);
        const distance = this.calculateDistance(mainObject.bbox);
        const objectName = this.getRussianName(mainObject.class);
        
        // Проверяем опасность
        const isDangerous = this.isObjectDangerous(mainObject.class, distance);
        
        // Формируем сообщение
        let message = '';
        if (objects.length > 1) {
            const secondObject = objects[1];
            message = `${objectName} ${direction} в ${distance} метрах, также ${this.getRussianName(secondObject.class)}`;
        } else {
            message = `${objectName} ${direction} в ${distance} метрах`;
        }
        
        // Озвучиваем
        if (isDangerous) {
            this.showWarning(objectName, direction, distance);
            this.speak(`Внимание! ${message}`);
            this.updateStatus(`⚠️ ${objectName} ${direction} • ${distance}м`);
        } else {
            this.hideWarning();
            this.speak(message);
            this.updateStatus(`${objectName} ${direction} • ${distance}м`);
        }
        
        this.lastVoiceTime = now;
    }

    getObjectDirection(bbox) {
        const [x, y, width, height] = bbox;
        const centerX = x + width / 2;
        
        if (this.video.videoWidth) {
            const screenThird = this.video.videoWidth / 3;
            if (centerX < screenThird) return 'слева';
            if (centerX > 2 * screenThird) return 'справа';
        }
        
        return 'впереди';
    }

    calculateDistance(bbox) {
        const [x, y, width, height] = bbox;
        const objectSize = width * height;
        
        if (this.video.videoWidth && this.video.videoHeight) {
            const maxSize = this.video.videoWidth * this.video.videoHeight;
            const relativeSize = objectSize / maxSize;
            
            if (relativeSize > 0.3) return '1-2';
            if (relativeSize > 0.15) return '3-4';
            if (relativeSize > 0.05) return '5-7';
        }
        
        return '8-10';
    }

    getRussianName(englishName) {
        const dictionary = {
            // Люди, животные
            'person': 'человек',
            'bird': 'птица', 
            'cat': 'кошка',
            'dog': 'собака',
            'horse': 'лошадь',
            'sheep': 'овца',
            'cow': 'корова',
            
            // Препятствия
            'chair': 'стул',
            'couch': 'диван',
            'potted plant': 'растение',
            'bed': 'кровать',
            
            // Транспорт
            'car': 'автомобиль',
            'truck': 'грузовик',
            'bus': 'автобус',
            'motorcycle': 'мотоцикл',
            'bicycle': 'велосипед',
            'train': 'поезд',
            'airplane': 'самолет',
            
            // Инфраструктура
            'traffic light': 'светофор',
            'stop sign': 'знак остановки',
            'bench': 'скамейка'
        };
        
        return dictionary[englishName] || englishName;
    }

    isObjectDangerous(className, distance) {
        const dangerousObjects = ['car', 'truck', 'bus', 'motorcycle', 'train'];
        const closeDistance = distance.includes('1-2') || distance.includes('3-4');
        return dangerousObjects.includes(className) && closeDistance;
    }

    showWarning(objectName, direction, distance) {
        this.warning.textContent = `🚨 ${objectName.toUpperCase()} ${direction.toUpperCase()} В ${distance.toUpperCase()}М!`;
        this.warning.style.display = 'block';
    }

    hideWarning() {
        this.warning.style.display = 'none';
    }

    speak(text) {
        if ('speechSynthesis' in window) {
            // Останавливаем предыдущее сообщение
            speechSynthesis.cancel();
            
            // Создаем новое сообщение
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ru-RU';
            utterance.rate = 0.85;
            utterance.pitch = 1.0;
            
            // Произносим
            speechSynthesis.speak(utterance);
            
            console.log('🔊 Озвучка:', text);
        }
    }

    async stopNavigation() {
        console.log('🛑 Остановка сканирования...');
        
        this.isRunning = false;
        
        // Останавливаем речь
        speechSynthesis.cancel();
        
        // Останавливаем камеру
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
        
        // Возвращаем кнопку в исходное состояние
        this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
        this.mainBtn.classList.remove('stop');
        this.updateStatus('✅ Сканирование остановлено');
        this.hideWarning();
        
        this.speak('Сканирование остановлено');
    }

    updateStatus(message) {
        this.status.textContent = message;
    }
}

// Инициализация при загрузке страницы
window.addEventListener('load', () => {
    new NavigationAssistant();
});
