
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
        
        this.init();
    }

    async init() {
        console.log('🚀 Инициализация навигационного помощника...');
        
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.expand();
        }
        
        this.mainBtn.addEventListener('click', () => this.toggleNavigation());
        this.setupAudio();
        await this.loadModel();
    }

    setupAudio() {
        // Разблокируем аудио при первом клике
        document.addEventListener('click', () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext  window.webkitAudioContext)();
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
            this.mainBtn.textContent = '⏹️ ОСТАНОВИТЬ СКАНИРОВАНИЕ';
            this.updateStatus('🔍 СКАНИРОВАНИЕ АКТИВНО');
            
            // Озвучка с задержкой для телефона
            setTimeout(() => {
                this.speak('Сканирование активировано');
            }, 1000);
            
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
            'person', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
            'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train',
            'chair', 'couch', 'potted plant', 'bed',
            'traffic light', 'stop sign', 'bench'
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
            this.speak(`Внимание! ${name} ${direction} в ${distance} метрах`);
            this.updateStatus(`⚠️ ${name} ${direction}`);
        } else {
            this.warning.style.display = 'none';
            this.speak(`${name} ${direction} в ${distance} метрах`);
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
        
        if (!this.video.videoWidth  !this.video.videoHeight) return '5-7';
        
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
        return names[englishName]  englishName;
    }

    isDangerous(className, distance) {
        const dangerous = ['car', 'truck', 'bus', 'motorcycle', 'train'];
        const close = distance.includes('1-2')  distance.includes('3-4');
        return dangerous.includes(className) && close;
    }

    // 🔥 УЛУЧШЕННАЯ ОЗВУЧКА ДЛЯ ТЕЛЕФОНА
    async speak(text) {
        console.log('🔊 Озвучка:', text);
        
        // Сначала пробуем браузерный TTS
        const ttsSuccess = await this.speakWithBrowserTTS(text);
        
        if (!ttsSuccess) {
            // Если не сработало - звуковые сигналы
            this.playFallbackSound(text);
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
            utterance.rate = 0.85;
            utterance.pitch = 1.1;
            utterance.volume = 1.0;
            
            utterance.onstart = () => {
                console.log('✅ TTS начал говорить');
            };
            
            utterance.onend = () => {
                console.log('✅ TTS завершил');
                resolve(true);
            };
            
            utterance.onerror = (event) => {
                console.log('❌ TTS ошибка:', event.error);
                resolve(false);
            };
            
            // Для телефонов добавляем задержку
            setTimeout(() => {
                speechSynthesis.speak(utterance);
            }, 100);
        });
    }


playFallbackSound(text) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Разные сигналы для разных сообщений
            if (text.includes('Внимание')) {
                // Прерывистый сигнал для опасности
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
                setTimeout(() => {
                    oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.1);
                }, 100);
                setTimeout(() => {
                    oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.2);
                }, 200);
            } else {
                // Плавный тон для обычных сообщений
                oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
            }
            
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.8);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.8);
            
            console.log('🔊 Звуковой сигнал для:', text);
            
        } catch (error) {
            console.log('❌ Ошибка звукового сигнала:', error);
        }
    }

    async stopNavigation() {
        this.isRunning = false;
        
        // Останавливаем речь
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        
        // Останавливаем камеру
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
        
        // Возвращаем кнопку в исходное состояние
        this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
        this.updateStatus('✅ СКАНИРИОВАНИЕ ОСТАНОВЛЕНО');
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
