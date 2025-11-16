class NavigationAssistant {
    constructor() {
        this.video = document.getElementById('webcam');
        this.mainBtn = document.getElementById('mainBtn');
        this.status = document.getElementById('status');
        this.warning = document.getElementById('warning');
        this.audioInfo = document.getElementById('audioInfo');
        this.videoOverlay = document.getElementById('videoOverlay');
        
        this.isRunning = false;
        this.model = null;
        this.lastVoiceTime = 0;
        this.audioContext = null;
        this.audioEnabled = false;
        
        this.init();
    }

    async init() {
        console.log('🚀 Инициализация навигационного помощника...');
        
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.expand();
        }
        
        this.mainBtn.addEventListener('click', () => this.toggleNavigation());
        
        // Активация аудио при первом клике
        document.addEventListener('click', () => this.activateAudio(), { once: true });
        
        await this.loadModel();
        this.audioInfo.style.display = 'block';
    }

    async activateAudio() {
        console.log('🎵 Активация аудиосистемы...');
        
        // Создаем AudioContext
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('✅ AudioContext создан');
        } catch (error) {
            console.log('❌ AudioContext не доступен:', error);
        }
        
        // Тестируем SpeechSynthesis
        await this.testSpeechSynthesis();
        
        this.audioEnabled = true;
        this.audioInfo.style.display = 'none';
        this.updateStatus('✅ СИСТЕМА ГОТОВА');
    }

    async testSpeechSynthesis() {
        return new Promise((resolve) => {
            if (!'speechSynthesis' in window) {
                console.log('❌ SpeechSynthesis не поддерживается');
                resolve(false);
                return;
            }
            
            // Получаем доступные голоса
            const voices = speechSynthesis.getVoices();
            const russianVoices = voices.filter(voice => voice.lang.includes('ru'));
            console.log(`🎙 Доступно русских голосов: ${russianVoices.length}`);
            
            // Тестовое воспроизведение
            const testUtterance = new SpeechSynthesisUtterance(' ');
            testUtterance.volume = 0.1;
            
            testUtterance.onend = () => {
                console.log('✅ SpeechSynthesis работает');
                resolve(true);
            };
            
            testUtterance.onerror = () => {
                console.log('❌ SpeechSynthesis ошибка');
                resolve(false);
            };
            
            speechSynthesis.speak(testUtterance);
        });
    }

    async loadModel() {
        try {
            this.updateStatus('ЗАГРУЗКА НЕЙРОСЕТИ...');
            console.log('📦 Загрузка модели COCO-SSD...');
            
            this.model = await cocoSsd.load();
            this.mainBtn.disabled = false;
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
            this.updateStatus('✅ МОДЕЛЬ ЗАГРУЖЕНА');
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
                video: { facingMode: 'environment' }
            });
            
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
            
            // Озвучка старта
            this.speak('Сканирование активировано');
            
            this.startDetection();
            
        } catch (error) {
            console.error('Ошибка камеры:', error);
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
            this.videoOverlay.textContent = 'Объекты не найдены';
            return;
        }
        
        const mainObject = objects[0];
        const now = Date.now();
        
        // Ограничение частоты озвучки
        if (now - this.lastVoiceTime < 4000) return;
        
        const direction = this.getDirection(mainObject.bbox);
        const distance = this.getDistance(mainObject.bbox);
        const name = this.getRussianName(mainObject.class);
        const dangerous = this.isDangerous(mainObject.class, distance);
        
        this.videoOverlay.textContent = `${name} ${direction} ${distance}`;
        
        if (dangerous) {
            this.warning.textContent = `⚠️ ${name} ${direction} ${distance}`;
            this.warning.style.display = 'block';
            this.speak(`Внимание! ${name} ${direction} в ${distance} метрах`);
            this.updateStatus(`⚠️ ${name} ${direction}`);
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
        console.log('🔊 Озвучка:', text);
        
        // Пробуем SpeechSynthesis
        const ttsSuccess = await this.speakWithTTS(text);
        
        if (!ttsSuccess) {
            // Если не сработало - используем Web Audio API
            this.playAudioSignal(text);
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
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
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
            
            speechSynthesis.speak(utterance);
        });
    }

    playAudioSignal(text) {
        if (!this.audioContext) {
            console.log('❌ AudioContext не доступен');
            return;
        }
        
        try {
            // Активируем AudioContext если нужно
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Разные сигналы для разных типов сообщений
            if (text.includes('Внимание')) {
                // Опасность - прерывистый сигнал
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
                setTimeout(() => {
                    oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.1);
                }, 100);
                setTimeout(() => {
                    oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.2);
                }, 200);
            } else {
                // Обычное сообщение - плавный тон
                oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
            }
            
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.8);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.8);
            
            console.log('🔊 Воспроизведен звуковой сигнал');
            
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

// Запуск приложения
window.addEventListener('load', () => {
    new NavigationAssistant();
});
