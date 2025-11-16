class NavigationAssistant {
    constructor() {
        this.video = document.getElementById('webcam');
        this.mainBtn = document.getElementById('mainBtn');
        this.status = document.getElementById('status');
        this.warning = document.getElementById('warning');
        
        this.isRunning = false;
        this.model = null;
        this.lastVoiceTime = 0;
        this.speechSynthesizer = null;
        
        this.init();
    }

    async init() {
        console.log('🚀 Инициализация навигационного помощника...');
        
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.expand();
        }
        
        await this.initSpeechSynthesizer();
        this.mainBtn.addEventListener('click', () => this.toggleNavigation());
        await this.loadModel();
    }

    async initSpeechSynthesizer() {
        try {
            if (window.speechSynthesizer) {
                this.speechSynthesizer = window.speechSynthesizer;
                console.log('✅ Система озвучки подключена');
            } else {
                console.warn('⚠️ Глобальная система озвучки не найдена, используем встроенную');
                this.speechSynthesizer = {
                    speakDetectionResults: (detections) => {
                        const text = this.generateSpeechFromDetections(detections);
                        this.speak(text);
                    },
                    speakEmergency: (message) => {
                        this.speak("Внимание! " + message);
                    }
                };
            }
        } catch (error) {
            console.error('Ошибка инициализации синтезатора:', error);
        }
    }

    async loadModel() {
        try {
            this.updateStatus('ЗАГРУЗКА НЕЙРОСЕТИ...');
            this.model = await cocoSsd.load();
            this.mainBtn.disabled = false;
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
            this.updateStatus('✅ СИСТЕМА ГОТОВА');
            
            setTimeout(() => {
                this.speak('Система навигации готова к работе');
            }, 1000);
            
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
            this.speak('Сканирование окружения активировано');
            
            this.startDetection();
            
        } catch (error) {
            console.error('Ошибка камеры:', error);
            this.updateStatus('❌ ОШИБКА КАМЕРЫ');
            this.speak('Ошибка доступа к камере');
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
            'person', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
            'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train',
            'chair', 'couch', 'potted plant', 'bed',
            'traffic light', 'stop sign', 'bench', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase'
        ];
        
        return predictions
            .filter(pred => pred.score > 0.5 && targetClasses.includes(pred.class))
            .sort((a, b) => b.score - a.score);
    }

    processObjects(objects) {
        if (objects.length === 0) {
            this.updateStatus('ОБЪЕКТЫ НЕ ОБНАРУЖЕНЫ');
            if (Date.now() - this.lastVoiceTime > 8000) {
                this.speak('Объекты не обнаружены, продолжайте движение');
                this.lastVoiceTime = Date.now();
            }
            return;
        }
        
        const mainObject = objects[0];
        const now = Date.now();
        
        if (now - this.lastVoiceTime < 4000) return;
        
        const direction = this.getDirection(mainObject.bbox);
        const distance = this.getDistance(mainObject.bbox);
        const name = this.getRussianName(mainObject.class);
        const dangerous = this.isDangerous(mainObject.class, distance);
        
        if (this.speechSynthesizer && this.speechSynthesizer.speakDetectionResults) {
            this.speechSynthesizer.speakDetectionResults(objects);
        } else {
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
        }
        
        this.lastVoiceTime = now;
    }

    generateSpeechFromDetections(detections) {
        if (!detections || detections.length === 0) {
            return "Объекты не обнаружены";
        }

        const mainObject = detections[0];
        const direction = this.getDirection(mainObject.bbox);
        const distance = this.getDistance(mainObject.bbox);
        const name = this.getRussianName(mainObject.class);
        const dangerous = this.isDangerous(mainObject.class, distance);

        if (dangerous) {
            return ВНИМАНИЕ! ${name} ${direction} ${distance} МЕТРОВ;
        } else {
            return ${name} ${direction} ${distance} МЕТРОВ;
        }
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
            'stop sign': 'знак остановки', 'bench': 'скамейка',
            'backpack': 'рюкзак', 'umbrella': 'зонт', 'handbag': 'сумка',
            'tie': 'галстук', 'suitcase': 'чемодан'
        };
        return names[englishName] || englishName;
    }

    isDangerous(className, distance) {
        const dangerous = ['car', 'truck', 'bus', 'motorcycle', 'train'];
        const close = distance.includes('1-2') || distance.includes('3-4');
        return dangerous.includes(className) && close;
    }

    speak(text) {
        if (this.speechSynthesizer && this.speechSynthesizer.synthesizeAndPlay) {
            this.speechSynthesizer.synthesizeAndPlay(text).catch(error => {
                console.warn('Yandex SpeechKit недоступен, используем стандартный синтез');
                this.fallbackSpeak(text);
            });
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
            utterance.pitch = 1.0;
            speechSynthesis.speak(utterance);
        }
    }

    async stopNavigation() {
        this.isRunning = false;
        
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        
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

    emergencyAlert(message) {
        if (this.speechSynthesizer && this.speechSynthesizer.speakEmergency) {
            this.speechSynthesizer.speakEmergency(message);
        } else {
            this.speak("ВНИМАНИЕ! " + message);
        }
        
        this.warning.textContent = 🚨 ${message};
        this.warning.style.display = 'block';
        this.updateStatus(🚨 ${message});
    }
}

window.addEventListener('load', () => {
    console.log('🎯 Запуск навигационного помощника...');
    new NavigationAssistant();
});

window.navigationAssistant = null;
setTimeout(() => {
    window.navigationAssistant = new NavigationAssistant();
}, 100);
