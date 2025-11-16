class NavigationAssistant {
    constructor() {
        this.video = document.getElementById('webcam');
        this.mainBtn = document.getElementById('mainBtn');
        this.status = document.getElementById('status');
        this.warning = document.getElementById('warning');
        this.audioInfo = document.getElementById('audioInfo');
        this.videoOverlay = document.getElementById('videoOverlay');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.settingsPanel = document.getElementById('settingsPanel');
        
        this.isRunning = false;
        this.model = null;
        this.lastVoiceTime = 0;
        this.audioContext = null;
        this.audioEnabled = false;
        this.ttsAvailable = false;
        
        this.ttsSettings = {
            rate: 0.9,
            pitch: 1.0,
            volume: 1.0
        };
        
        this.init();
    }

    async init() {
        console.log('🚀 Инициализация навигационного помощника...');
        
        this.detectPlatform();
        
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.expand();
            Telegram.WebApp.enableClosingConfirmation();
        }
        
        this.setupEventListeners();
        await this.setupAudio();
        await this.loadModel();
        await this.loadAvailableVoices();
        
        this.audioInfo.style.display = 'block';
    }

    detectPlatform() {
        const ua = navigator.userAgent;
        this.isIOS = /iPhone|iPad|iPod/i.test(ua);
        this.isAndroid = /Android/i.test(ua);
        this.isChrome = /Chrome/i.test(ua);
        this.isSafari = /Safari/i.test(ua) && !this.isChrome;
        
        console.log(`📱 Платформа: ${this.isIOS ? 'iOS' : this.isAndroid ? 'Android' : 'Desktop'} ${this.isSafari ? 'Safari' : this.isChrome ? 'Chrome' : ''}`);
        
        if (this.isIOS) {
            this.ttsSettings.rate = 0.85;
            this.ttsSettings.pitch = 1.1;
        } else if (this.isAndroid) {
            this.ttsSettings.rate = 0.9;
            this.ttsSettings.pitch = 1.0;
        }
        
        this.updateSettingsUI();
    }

    setupEventListeners() {
        this.mainBtn.addEventListener('click', () => this.toggleNavigation());
        this.settingsBtn.addEventListener('click', () => this.toggleSettings());
        
        document.getElementById('ttsRate').addEventListener('input', (e) => {
            this.ttsSettings.rate = parseFloat(e.target.value);
            document.getElementById('rateValue').textContent = e.target.value;
        });
        
        document.getElementById('ttsPitch').addEventListener('input', (e) => {
            this.ttsSettings.pitch = parseFloat(e.target.value);
            document.getElementById('pitchValue').textContent = e.target.value;
        });
        
        document.getElementById('ttsVolume').addEventListener('input', (e) => {
            this.ttsSettings.volume = parseFloat(e.target.value);
            document.getElementById('volumeValue').textContent = e.target.value;
        });
        
        document.getElementById('testTTS').addEventListener('click', () => this.testTTS());
        document.getElementById('testAudio').addEventListener('click', () => this.testAudioSignals());
        
        document.addEventListener('click', () => this.activateAudio(), { once: true });
    }

    updateSettingsUI() {
        document.getElementById('ttsRate').value = this.ttsSettings.rate;
        document.getElementById('ttsPitch').value = this.ttsSettings.pitch;
        document.getElementById('ttsVolume').value = this.ttsSettings.volume;
        document.getElementById('rateValue').textContent = this.ttsSettings.rate;
        document.getElementById('pitchValue').textContent = this.ttsSettings.pitch;
        document.getElementById('volumeValue').textContent = this.ttsSettings.volume;
    }

    toggleSettings() {
        this.settingsPanel.style.display = this.settingsPanel.style.display === 'none' ? 'block' : 'none';
    }

    async activateAudio() {
        console.log('🎵 Активация аудиосистемы...');
        
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        this.audioEnabled = true;
        this.audioInfo.style.display = 'none';
        
        this.ttsAvailable = await this.testTTSCapability();
        
        if (this.ttsAvailable) {
            this.updateStatus('✅ СИСТЕМА ГОТОВА - TTS ДОСТУПЕН');
        } else {
            this.updateStatus('✅ СИСТЕМА ГОТОВА - БУДУТ ЗВУКИ');
        }
    }

    async testTTSCapability() {
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

    async loadAvailableVoices() {
        return new Promise((resolve) => {
            if (!'speechSynthesis' in window) {
                resolve([]);
                return;
            }
            
            let voices = speechSynthesis.getVoices();
            if (voices.length > 0) {
                this.voices = voices.filter(voice => voice.lang.includes('ru'));
                console.log(`🎙 Доступно русских голосов: ${this.voices.length}`);
                resolve(this.voices);
            } else {
                speechSynthesis.addEventListener('voiceschanged', () => {
                    this.voices = speechSynthesis.getVoices().filter(voice => voice.lang.includes('ru'));
                    console.log(`🎙 Доступно русских голосов: ${this.voices.length}`);
                    resolve(this.voices);
                });
            }
        });
    }

    async loadModel() {
        try {
            this.updateStatus('ЗАГРУЗКА НЕЙРОСЕТИ...');
            console.log('📦 Загрузка модели COCO-SSD...');
            
            this.model = await cocoSsd.load();
            this.mainBtn.disabled = false;
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
            this.updateStatus('✅ СИСТЕМА ГОТОВА - НАЖМИТЕ ДЛЯ СТАРТА');
            console.log('✅ Модель загружена успешно');
            
        } catch (error) {
            console.error('Ошибка загрузки модели:', error);
            this.updateStatus('❌ ОШИБКА ЗАГРУЗКИ AI');
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
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            
            this.video.srcObject = stream;
            this.videoOverlay.textContent = 'Камера активна';
            
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    console.log(`✅ Камера: ${this.video.videoWidth}x${this.video.videoHeight}`);
                    resolve();
                };
            });
            
            this.isRunning = true;
            this.mainBtn.textContent = '⏹ ОСТАНОВИТЬ СКАНИРОВАНИЕ';
            this.updateStatus('🔍 СКАНИРОВАНИЕ АКТИВНО - ИЩУ ОБЪЕКТЫ');
            
            setTimeout(() => {
                this.speak('Сканирование активировано');
            }, 500);
            
            this.startDetection();
            
        } catch (error) {
            console.error('Ошибка камеры:', error);
            this.updateStatus('❌ ОШИБКА КАМЕРЫ - ПРОВЕРЬТЕ РАЗРЕШЕНИЯ');
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
        const confidence = Math.round(mainObject.score * 100);
        const dangerous = this.isDangerous(mainObject.class, distance);
        
        this.videoOverlay.textContent = `${name} ${direction} ${distance} (${confidence}%)`;
        
        if (dangerous) {
            this.warning.textContent = `⚠️ ОПАСНОСТЬ! ${name} ${direction} ${distance}`;
            this.warning.style.display = 'block';
            this.speak(`Внимание! ${name} ${direction} в ${distance} метрах`);
            this.updateStatus(`⚠️ ${name} ${direction} ${distance}`);
            this.vibrate([200, 100, 200]);
        } else {
            this.warning.style.display = 'none';
            this.speak(`${name} ${direction} в ${distance} метрах`);
            this.updateStatus(`${name} ${direction} ${distance}`);
        }
        
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

    async speak(text) {
        console.log(`🔊 Озвучка: "${text}"`);
        
        const ttsSuccess = await this.speakWithTTS(text);
        
        if (!ttsSuccess) {
            await this.playAudioSignal(text.includes('Внимание') ? 'danger' : 'normal');
        }
    }

    async speakWithTTS(text) {
        return new Promise((resolve) => {
            if (!'speechSynthesis' in window) {
                resolve(false);
                return;
            }
            
            speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ru-RU';
            utterance.rate = this.ttsSettings.rate;
            utterance.pitch = this.ttsSettings.pitch;
            utterance.volume = this.ttsSettings.volume;
            
            if (this.voices && this.voices.length > 0) {
                utterance.voice = this.voices[0];
            }
            
            utterance.onstart = () => {
                console.log('✅ TTS начал говорить');
            };
            
            utterance.onend = () => {
                console.log('✅ TTS завершил');
                resolve(true);
            };
            
            utterance.onerror = (event) => {
                console.log('❌ TTS ошибка: ' + event.error);
                resolve(false);
            };
            
            setTimeout(() => {
                speechSynthesis.speak(utterance);
            }, 50);
        });
    }

    async playAudioSignal(type) {
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
            
            if (type === 'danger') {
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
                oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.2);
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.4);
            } else if (type === 'warning') {
                oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
                oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime + 0.1);
            } else {
                oscillator.frequency.setValueAtTime(500, this.audioContext.currentTime);
            }
            
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.6);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.6);
            
            console.log('🔊 Воспроизведен звуковой сигнал:', type);
            
        } catch (error) {
            console.log('❌ Ошибка звукового сигнала:', error);
        }
    }

    vibrate(pattern) {
        if (navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }

    async testTTS() {
        const testText = "Тестовое сообщение. Система навигации работает.";
        const success = await this.speakWithTTS(testText);
        
        if (success) {
            this.updateStatus('✅ TTS РАБОТАЕТ КОРРЕКТНО');
        } else {
            this.updateStatus('❌ TTS НЕДОСТУПЕН');
        }
    }

    async testAudioSignals() {
        this.playAudioSignal('normal');
        setTimeout(() => this.playAudioSignal('warning'), 800);
        setTimeout(() => this.playAudioSignal('danger'), 1600);
        this.updateStatus('🔊 ТЕСТ ЗВУКОВЫХ СИГНАЛОВ');
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
}

window.addEventListener('load', () => {
    new NavigationAssistant();
});
