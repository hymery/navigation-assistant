class NavigationAssistant {
    constructor() {
        this.video = document.getElementById('webcam');
        this.mainBtn = document.getElementById('mainBtn');
        this.status = document.getElementById('status');
        this.warning = document.getElementById('warning');
        
        this.isRunning = false;
        this.model = null;
        this.lastVoiceTime = 0;
        this.audioContext = null;
        this.detectionInterval = null;
        this.isSpeaking = false;
        this.pendingDetection = false;
        
        this.init();
    }

    async init() {
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.expand();
        }
        
        this.mainBtn.addEventListener('click', () => this.toggleNavigation());
        this.setupAudio();
        await this.loadModel();
    }

    setupAudio() {
        document.addEventListener('click', () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
        }, { once: true });
    }

    async loadModel() {
        try {
            this.updateStatus('ЗАГРУЗКА НЕЙРОСЕТИ...');
            this.model = await cocoSsd.load();
            this.mainBtn.disabled = false;
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
            this.updateStatus('✅ СИСТЕМА ГОТОВА');
        } catch (error) {
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
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
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
        
        const detect = async () => {
            if (!this.isRunning || this.isSpeaking || this.pendingDetection) return;
            
            this.pendingDetection = true;
            
            try {
                const predictions = await this.model.detect(this.video);
                const filtered = this.filterObjects(predictions);
                await this.processObjects(filtered);
            } catch (error) {
                console.error('Ошибка обнаружения:', error);
            }
            
            this.pendingDetection = false;
        };
        
        // Увеличиваем интервал до 800ms для гарантии завершения озвучки
        this.detectionInterval = setInterval(detect, 800);
    }

    filterObjects(predictions) {
        const targetClasses = [
            'person', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
            'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train',
            'chair', 'couch', 'potted plant', 'bed',
            'traffic light', 'stop sign', 'bench'
        ];
        
        return predictions
            .filter(pred => pred.score > 0.5 && targetClasses.includes(pred.class))
            .sort((a, b) => b.score - a.score)
            .slice(0, 2);
    }

    async processObjects(objects) {
        if (objects.length === 0) {
            this.updateStatus('ОБЪЕКТЫ НЕ ОБНАРУЖЕНЫ');
            return;
        }
        
        const mainObject = objects[0];
        const now = Date.now();
        
        if (now - this.lastVoiceTime < 1000) return;
        
        const direction = this.getDirection(mainObject.bbox);
        const distance = this.getDistance(mainObject.bbox);
        const name = this.getRussianName(mainObject.class);
        const dangerous = this.isDangerous(mainObject.class, distance);
        
        // Формируем текст без дефисов
        const statusText = dangerous ? 
            `ВНИМАНИЕ ${name} ${direction} ${distance}` : 
            `${name} ${direction} ${distance}`;
            
        const speechText = dangerous ?
            `Внимание ${name} ${direction} ${distance} метров` :
            `${name} ${direction} ${distance} метров`;
        
        if (dangerous) {
            this.warning.textContent = `⚠️ ${name} ${direction} ${distance}`;
            this.warning.style.display = 'block';
            this.updateStatus(`⚠️ ${name} ${direction} ${distance}`);
        } else {
            this.warning.style.display = 'none';
            this.updateStatus(`${name} ${direction} ${distance}`);
        }
        
        await this.speak(speechText);
        this.lastVoiceTime = now;
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
        const [,, width, height] = bbox;
        const size = width * height;
        
        if (!this.video.videoWidth || !this.video.videoHeight) return '7 8';
        
        const maxSize = this.video.videoWidth * this.video.videoHeight;
        const percent = size / maxSize;
        
        if (percent > 0.35) return '1 2';
        if (percent > 0.20) return '3 4';
        if (percent > 0.12) return '5 6';
        if (percent > 0.07) return '7 8';
        if (percent > 0.04) return '9 10';
        return '11 12';
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
        const close = distance.includes('1 2') || distance.includes('3 4') || distance.includes('5 6');
        return dangerous.includes(className) && close;
    }

    async speak(text) {
        if (this.isSpeaking) return;
        
        this.isSpeaking = true;
        
        const ttsSuccess = await this.speakWithBrowserTTS(text);
        
        if (!ttsSuccess) {
            await this.playFallbackSound(text);
        }
        
        this.isSpeaking = false;
    }

    async speakWithBrowserTTS(text) {
        return new Promise((resolve) => {
            if (!'speechSynthesis' in window) {
                resolve(false);
                return;
            }
            
            speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ru-RU';
            utterance.rate = 1.0; // Максимальная скорость
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            let completed = false;
            
            const complete = () => {
                if (!completed) {
                    completed = true;
                    resolve(true);
                }
            };
            
            utterance.onend = complete;
            utterance.onerror = complete;
            
            // Таймаут на случай зависания
            setTimeout(complete, 3000);
            
            speechSynthesis.speak(utterance);
        });
    }

    async playFallbackSound(text) {
        return new Promise((resolve) => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            try {
                const oscillator = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                
                if (text.includes('Внимание')) {
                    oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
                } else {
                    oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
                }
                
                gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
                
                oscillator.start(this.audioContext.currentTime);
                oscillator.stop(this.audioContext.currentTime + 0.5);
                
                setTimeout(resolve, 500);
                
            } catch (error) {
                resolve();
            }
        });
    }

    async stopNavigation() {
        this.isRunning = false;
        this.isSpeaking = false;
        this.pendingDetection = false;
        
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }
        
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
}

window.addEventListener('load', () => {
    new NavigationAssistant();
});
