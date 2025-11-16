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

        this.init();
    }

    async init() {
        this.log('🚀 Инициализация навигационного помощника...');
        console.log('🚀 Инициализация навигационного помощника...');

        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.expand();
        }

        this.mainBtn.addEventListener('click', () => this.toggleNavigation());
        await this.setupAudio();
        this.setupAudio();
        await this.loadModel();
        
        // Показать информацию об аудио
        this.audioInfo.style.display = 'block';
    }

    async setupAudio() {
        this.log('🎵 Настройка аудиосистемы...');
        
    setupAudio() {
        // Разблокируем аудио при первом клике
        const unlockAudio = () => {
            this.log('👆 Клик для разблокировки аудио');
            
        document.addEventListener('click', () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.log('✅ AudioContext создан');
            }
            
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().then(() => {
                    this.log('✅ AudioContext активирован');
                    this.audioEnabled = true;
                    this.audioInfo.style.display = 'none';
                });
            }
            
            // Тестируем TTS
            this.testTTS();
        };
        
        // Вешаем на несколько элементов для надежности
        document.addEventListener('click', unlockAudio, { once: true });
        this.mainBtn.addEventListener('click', unlockAudio, { once: true });
        
        // Проверяем поддержку TTS
        this.checkTTSSupport();
    }

    checkTTSSupport() {
        if (!'speechSynthesis' in window) {
            this.log('❌ TTS не поддерживается браузером');
            return false;
        }
        
        const voices = speechSynthesis.getVoices();
        const russianVoices = voices.filter(voice => voice.lang.includes('ru'));
        this.log(`✅ TTS доступен, русских голосов: ${russianVoices.length}`);
        
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
            testUtterance.onend = () => {
                this.log('✅ TTS тест пройден');
                resolve(true);
            };
            testUtterance.onerror = () => {
                this.log('❌ TTS тест не пройден');
                resolve(false);
            };
            
            speechSynthesis.speak(testUtterance);
        });
        }, { once: true });
    }

    async loadModel() {
        try {
            this.updateStatus('ЗАГРУЗКА НЕЙРОСЕТИ...');
            this.log('📦 Загрузка модели COCO-SSD...');
            
            this.model = await cocoSsd.load();
            this.mainBtn.disabled = false;
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
            this.updateStatus('✅ СИСТЕМА ГОТОВА - НАЖМИТЕ ДЛЯ СТАРТА');
            this.log('✅ Модель загружена успешно');
            
            this.updateStatus('✅ СИСТЕМА ГОТОВА');
        } catch (error) {
            console.error('Ошибка загрузки модели:', error);
            this.updateStatus('❌ ОШИБКА ЗАГРУЗКИ AI');
            this.updateStatus('❌ ОШИБКА ЗАГРУЗКИ');
            this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ (БЕЗ AI)';
            this.mainBtn.disabled = false;
            this.log('❌ Ошибка загрузки модели: ' + error.message);
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
            this.log('📷 Запрос доступа к камере...');

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
                video: { facingMode: 'environment' }
            });

            this.video.srcObject = stream;
            this.videoOverlay.textContent = 'Камера активна';

            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    this.log(`✅ Камера: ${this.video.videoWidth}x${this.video.videoHeight}`);
                    resolve();
                };
            });

            this.isRunning = true;
            this.mainBtn.textContent = '⏹ ОСТАНОВИТЬ СКАНИРОВАНИЕ';
            this.updateStatus('🔍 СКАНИРОВАНИЕ АКТИВНО - ИЩУ ОБЪЕКТЫ');
            this.updateStatus('🔍 СКАНИРОВАНИЕ АКТИВНО');

            // Озвучка с задержкой для телефона
            setTimeout(() => {
                this.speak('Сканирование активировано');
            }, 500);
            }, 1000);

            this.startDetection();

        } catch (error) {
            console.error('Ошибка камеры:', error);
            this.updateStatus('❌ ОШИБКА КАМЕРЫ - ПРОВЕРЬТЕ РАЗРЕШЕНИЯ');
            this.updateStatus('❌ ОШИБКА КАМЕРЫ');
            this.speak('Ошибка камеры');
            this.log('❌ Ошибка камеры: ' + error.message);
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
            this.log('❌ Ошибка обнаружения: ' + error.message);
        }

        if (this.isRunning) {
            setTimeout(() => this.startDetection(), 1500);
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
            .filter(pred => pred.score > 0.4 && targetClasses.includes(pred.class))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3); // Ограничиваем 3 самыми уверенными
            .filter(pred => pred.score > 0.5 && targetClasses.includes(pred.class))
            .sort((a, b) => b.score - a.score);
    }

    processObjects(objects) {
        if (objects.length === 0) {
            this.updateStatus('🔍 ОБЪЕКТЫ НЕ ОБНАРУЖЕНЫ...');
            this.videoOverlay.textContent = 'Объекты не найдены';
            this.updateStatus('ОБЪЕКТЫ НЕ ОБНАРУЖЕНЫ');
            return;
        }

        const mainObject = objects[0];
        const now = Date.now();

        // Ограничиваем частоту озвучки
        if (now - this.lastVoiceTime < 3000) return;
        if (now - this.lastVoiceTime < 4000) return;

        const direction = this.getDirection(mainObject.bbox);
        const distance = this.getDistance(mainObject.bbox);
        const name = this.getRussianName(mainObject.class);
        const confidence = Math.round(mainObject.score * 100);
        const dangerous = this.isDangerous(mainObject.class, distance);

        // Обновляем оверлей
        this.videoOverlay.textContent = `${name} ${direction} ${distance} (${confidence}%)`;
        
        if (dangerous) {
            this.warning.textContent = `⚠️ ОПАСНОСТЬ! ${name} ${direction} ${distance}`;
            this.warning.textContent = `⚠️ ${name} ${direction} ${distance}М`;
            this.warning.style.display = 'block';
            this.speak(`Внимание! ${name} ${direction} в ${distance} метрах`);
            this.updateStatus(`⚠️ ${name} ${direction} ${distance}`);
            this.updateStatus(`⚠️ ${name} ${direction}`);
        } else {
            this.warning.style.display = 'none';
            this.speak(`${name} ${direction} в ${distance} метрах`);
            this.updateStatus(`${name} ${direction} ${distance}`);
            this.updateStatus(`${name} ${direction} ${distance}М`);
        }

        this.lastVoiceTime = now;
        this.log(`🎯 Обнаружен: ${name} ${direction} ${distance} (${confidence}%)`);
    }

    getDirection(bbox) {
        const [x, , width] = bbox;
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

    // 🔥 УЛУЧШЕННАЯ ОЗВУЧКА ДЛЯ ТЕЛЕФОНА
    async speak(text) {
        this.log(`🔊 Озвучка: "${text}"`);
        console.log('🔊 Озвучка:', text);

        // Сначала пробуем браузерный TTS
        const ttsSuccess = await this.speakWithBrowserTTS(text);

        if (!ttsSuccess) {
            // Если не сработало - звуковые сигналы
            await this.playFallbackSound(text);
            this.playFallbackSound(text);
        }
    }

    async speakWithBrowserTTS(text) {
        return new Promise((resolve) => {
            if (!'speechSynthesis' in window) {
                resolve(false);
                return;
            }

            // Отменяем предыдущую речь
            speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ru-RU';
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            utterance.rate = 0.85;
            utterance.pitch = 1.1;
            utterance.volume = 1.0;

            utterance.onstart = () => {
                this.log('✅ TTS начал говорить');
                console.log('✅ TTS начал говорить');
            };

            utterance.onend = () => {
                this.log('✅ TTS завершил');
                console.log('✅ TTS завершил');
                resolve(true);
            };

            utterance.onerror = (event) => {
                this.log('❌ TTS ошибка: ' + event.error);
                console.log('❌ TTS ошибка:', event.error);
                resolve(false);
            };

            // Задержка для стабильности на телефонах
            // Для телефонов добавляем задержку
            setTimeout(() => {
                speechSynthesis.speak(utterance);
            }, 50);
            }, 100);
        });
    }

    async playFallbackSound(text) {
    playFallbackSound(text) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        try {
            // Активируем контекст
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            // Разные сигналы для разных сообщений
            if (text.includes('Внимание')) {
                // Прерывистый сигнал для опасности
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
                oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.2);
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.4);
                setTimeout(() => {
                    oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.1);
                }, 100);
                setTimeout(() => {
                    oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.2);
                }, 200);
            } else {
                // Плавный тон для обычных сообщений
                oscillator.frequency.setValueAtTime(500, this.audioContext.currentTime);
                oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
            }

            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.6);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.8);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.6);
            oscillator.stop(this.audioContext.currentTime + 0.8);

            this.log('🔊 Воспроизведен звуковой сигнал');
            console.log('🔊 Звуковой сигнал для:', text);

        } catch (error) {
            this.log('❌ Ошибка звукового сигнала: ' + error.message);
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
        this.updateStatus('✅ СКАНИРОВАНИЕ ОСТАНОВЛЕНО');
        this.updateStatus('✅ СКАНИРИОВАНИЕ ОСТАНОВЛЕНО');
        this.warning.style.display = 'none';
        this.videoOverlay.textContent = 'Камера не активна';

        this.speak('Сканирование остановлено');
        this.log('⏹ Сканирование остановлено');
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

// Запуск приложения
// Запуск
window.addEventListener('load', () => {
    new NavigationAssistant();
});

// Показать отладочную информацию при долгом нажатии на заголовок
document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.header');
    let pressTimer;
    
    header.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
            document.getElementById('debug').style.display = 'block';
        }, 2000);
    });
    
    header.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
    });
});
