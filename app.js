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
        
        // Telegram Web App
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.expand();
        }
        
        this.mainBtn.addEventListener('click', () => this.toggleNavigation());
        await this.loadModel();
    }

    async loadModel() {
        try {
            this.updateStatus('ЗАГРУЗКА НЕЙРОСЕТИ...');
            this.model = await cocoSsd.load();
            this.mainBtn.disabled = false;
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
            this.updateStatus('✅ СИСТЕМА ГОТОВА');
        } catch (error) {
            console.error('Ошибка загрузки модели:', error);
            this.updateStatus('❌ ОШИБКА ЗАГРУЗКИ');
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ (БЕЗ AI)';
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
            this.updateStatus('АКТИВАЦИЯ КАМЕРЫ...');
            
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
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
            this.updateStatus('🔍 СКАНИРОВАНИЕ АКТИВНО');
            this.speak('Сканирование активировано');
            
            this.startDetection();
            
        } catch (error) {
            this.updateStatus('❌ ОШИБКА КАМЕРЫ');
            this.speak('Ошибка камеры');
        }
    }

    async startDetection() {
        if (!this.isRunning) return;
        
        try {
            const predictions = await this.model.detect(this.video);
            const filtered = this.filterObjects(predictions);
            this.processObjects(filtered);
        } catch (error) {
            console.error('Ошибка обнаружения:', error);
        }

        if (this.isRunning) {
            setTimeout(() => this.startDetection(), 2000);
        }
    }

    filterObjects(predictions) {
        const targetClasses = [
            'person', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', // Люди и животные
            'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train', // Транспорт
            'chair', 'couch', 'potted plant', 'bed', // Препятствия
            'traffic light', 'stop sign', 'bench' // Инфраструктура
        ];
        
        return predictions
            .filter(pred => pred.score > 0.5 && targetClasses.includes(pred.class))
            .sort((a, b) => b.score - a.score);
    }

    processObjects(objects) {
        if (objects.length === 0) {
            this.updateStatus('ОБЪЕКТЫ НЕ ОБНАРУЖЕНЫ');
            return;
        }
        
        const mainObject = objects[0];
        const now = Date.now();
        
        if (now - this.lastVoiceTime < 4000) return;
        
        const direction = this.getDirection(mainObject.bbox);
        const distance = this.getDistance(mainObject.bbox);
        const name = this.getRussianName(mainObject.class);
        const dangerous = this.isDangerous(mainObject.class, distance);
        
        if (dangerous) {
            this.warning.textContent = `⚠️ ${name} ${direction} ${distance}М`;
            this.warning.style.display = 'block';
            this.speak(`ВНИМАНИЕ! ${name} ${direction} ${distance} МЕТРОВ`);
            this.updateStatus(`⚠️ ${name} ${direction}`);
        } else {
            this.warning.style.display = 'none';
            this.speak(`${name} ${direction} ${distance} МЕТРОВ`);
            this.updateStatus(`${name} ${direction} ${distance}М`);
        }
        
        this.lastVoiceTime = now;
    }

    getDirection(bbox) {
        const [x, width] = bbox;
        const centerX = x + width / 2;
        
        if (!this.video.videoWidth) return 'впереди';
        
        const third = this.video.videoWidth / 3;
        if (centerX < third) return 'слева';
        if (centerX > 2 * third) return 'справа';
        return 'впереди';
    }

    getDistance(bbox) {
        const [,, width, height] = bbox;
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
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ru-RU';
            utterance.rate = 0.9;
            speechSynthesis.speak(utterance);
        }
    }

    async stopNavigation() {
        this.isRunning = false;
        speechSynthesis.cancel();
        
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
        
        this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
        this.updateStatus('✅ СКАНИРОВАНИЕ ОСТАНОВЛЕНО');
        this.warning.style.display = 'none';
        
        this.speak('Сканирование остановлено');
    }

    updateStatus(message) {
        this.status.textContent = message;
    }
}

// Запуск
window.addEventListener('load', () => {
    new NavigationAssistant();
});
