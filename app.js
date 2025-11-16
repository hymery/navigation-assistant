class NavigationAssistant {
    constructor() {
        this.video = document.getElementById('webcam');
        this.mainBtn = document.getElementById('mainBtn');
        this.status = document.getElementById('status');
        this.warning = document.getElementById('warning');
        this.audioInfo = document.getElementById('audioInfo');
        this.debug = document.getElementById('debug');
        this.videoOverlay = document.getElementById('videoOverlay');
        
        this.isRunning = false;
        this.model = null;
        this.lastVoiceTime = 0;
        this.audioContext = null;
        this.audioEnabled = false;
        this.debugMode = true;
        this.isTelegram = !!(window.Telegram && Telegram.WebApp);
        
        this.init();
    }

    async init() {
        this.log('Инициализация навигационного помощника...');
        
        if (this.isTelegram) {
            await this.initTelegram();
        }
        
        this.mainBtn.addEventListener('click', () => this.toggleNavigation());
        await this.setupAudio();
        await this.loadModel();
        
        if (!this.isTelegram) {
            this.audioInfo.style.display = 'block';
        }
    }

    async initTelegram() {
        Telegram.WebApp.ready();
        Telegram.WebApp.expand();
        Telegram.WebApp.enableClosingConfirmation();
        this.log('Telegram Web App инициализирован');
    }

    async setupAudio() {
        if (this.isTelegram) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            this.audioEnabled = true;
        } else {
            const unlockAudio = () => {
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume().then(() => {
                        this.audioEnabled = true;
                        this.audioInfo.style.display = 'none';
                    });
                }
                this.testTTS();
            };
            document.addEventListener('click', unlockAudio, { once: true });
            this.mainBtn.addEventListener('click', unlockAudio, { once: true });
        }
        this.checkTTSSupport();
    }

    checkTTSSupport() {
        if (!'speechSynthesis' in window) {
            this.log('TTS не поддерживается браузером');
            return false;
        }
        const voices = speechSynthesis.getVoices();
        const russianVoices = voices.filter(voice => voice.lang.includes('ru'));
        this.log(`TTS доступен, русских голосов: ${russianVoices.length}`);
        return russianVoices.length > 0;
    }

    async testTTS() {
        return new Promise((resolve) => {
            if (!'speechSynthesis' in window) {
                resolve(false);
                return;
            }
            const testUtterance = new SpeechSynthesisUtterance();
            testUtterance.text = ' ';
            testUtterance.volume = 0.1;
            testUtterance.onend = () => resolve(true);
            testUtterance.onerror = () => resolve(false);
            speechSynthesis.speak(testUtterance);
        });
    }

    async loadModel() {
        try {
            this.updateStatus('ЗАГРУЗКА НЕЙРОСЕТИ...');
            this.model = await cocoSsd.load();
            this.mainBtn.disabled = false;
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
            this.updateStatus('✅ СИСТЕМА ГОТОВА');
            this.log('Модель загружена успешно');
        } catch (error) {
            this.updateStatus('❌ ОШИБКА ЗАГРУЗКИ AI');
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ (БЕЗ AI)';
            this.mainBtn.disabled = false;
            this.log('Ошибка загрузки модели: ' + error.message);
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
            
            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: { min: 640, ideal: 1280 },
                    height: { min: 480, ideal: 720 }
                }
            };
            
            if (this.isTelegram) {
                constraints.video = { facingMode: 'environment' };
            }
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = stream;
            this.videoOverlay.textContent = 'Камера активна';
            
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
                };
            });
            
            this.isRunning = true;
            this.mainBtn.textContent = '⏹ ОСТАНОВИТЬ СКАНИРОВАНИЕ';
            this.updateStatus('🔍 СКАНИРОВАНИЕ АКТИВНО');
            
            setTimeout(() => {
                this.speak('Сканирование активировано');
            }, 500);
            
            this.startDetection();
            
        } catch (error) {
            this.handleCameraError(error);
        }
    }

    handleCameraError(error) {
        let errorMessage = '❌ ОШИБКА КАМЕРЫ';
        if (this.isTelegram) {
            errorMessage += ' (РАЗРЕШИТЕ ДОСТУП К КАМЕРЕ В ТЕЛЕГРАМ)';
        }
        this.updateStatus(errorMessage);
        this.speak('Ошибка камеры');
        this.log('Ошибка камеры: ' + error.message);
    }

    async startDetection() {
        if (!this.isRunning) return;
        
        try {
            const predictions = await this.model.detect(this.video);
            const filtered = this.filterObjects(predictions);
            this.processObjects(filtered);
        } catch (error) {
            this.log('Ошибка обнаружения: ' + error.message);
        }

        if (this.isRunning) {
            setTimeout(() => this.startDetection(), 1500);
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
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
    }

    processObjects(objects) {
        if (objects.length === 0) {
            this.updateStatus('🔍 ОБЪЕКТЫ НЕ ОБНАРУЖЕНЫ...');
            this.videoOverlay.textContent = 'Объекты не найдены';
            return;
        }
        
        const mainObject = objects[0];
        const now = Date.now();
        if (now - this.lastVoiceTime < 3000) return;
        
        const direction = this.getDirection(mainObject.bbox);
        const distance = this.getDistance(mainObject.bbox);
        const name = this.getRussianName(mainObject.class);
        const dangerous = this.isDangerous(mainObject.class, distance);
        
        const displayDistance = distance.replace(' ', '-');
        this.videoOverlay.textContent = `${name} ${direction} ${displayDistance}`;
        
        if (dangerous) {
            this.warning.textContent = `⚠️ ОПАСНОСТЬ! ${name} ${direction} ${displayDistance}`;
            this.warning.style.display = 'block';
            this.speak(`Внимание ${name} ${direction} ${distance} метров`);
            this.updateStatus(`⚠️ ${name} ${direction} ${displayDistance}`);
        } else {
            this.warning.style.display = 'none';
            this.speak(`${name} ${direction} ${distance} метров`);
            this.updateStatus(`${name} ${direction} ${displayDistance}`);
        }
        
        this.lastVoiceTime = now;
        this.log(`Обнаружен: ${name} ${direction} ${displayDistance}`);
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
        if (percent > 0.3) return '1 2';
        if (percent > 0.15) return '3 4';
        if (percent > 0.05) return '5 6';
        return '7 8';
    }

    getRussianName(englishName) {
        const names = {
            'person': 'человек', 'bird': 'птица', 'cat': 'кошка', 'dog': 'собака',
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
        const close = distance.includes('1 2') || distance.includes('3 4');
        return dangerous.includes(className) && close;
    }

    async speak(text) {
        const ttsSuccess = await this.speakWithBrowserTTS(text);
        if (!ttsSuccess) {
            await this.playFallbackSound(text);
        }
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
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            utterance.onend = () => resolve(true);
            utterance.onerror = () => resolve(false);
            speechSynthesis.speak(utterance);
        });
    }

    async playFallbackSound(text) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
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
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.6);
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.6);
        } catch (error) {
            this.log('Ошибка звукового сигнала');
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
        this.videoOverlay.textContent = 'Камера не активна';
        this.speak('Сканирование остановлено');
    }

    updateStatus(message) {
        this.status.textContent = message;
    }

    log(message) {
        console.log(message);
        if (this.debugMode) {
            const timestamp = new Date().toLocaleTimeString();
            this.debug.innerHTML = `[${timestamp}] ${message}<br>` + this.debug.innerHTML;
            this.debug.style.display = 'block';
        }
    }
}

window.addEventListener('load', () => {
    new NavigationAssistant();
});
