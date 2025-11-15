class NavigationAssistant {
    constructor() {
        this.video = document.getElementById('webcam');
        this.mainBtn = document.getElementById('mainBtn');
        this.status = document.getElementById('status');
        this.loading = document.getElementById('loading');
        this.progress = document.getElementById('progress');
        this.progressText = document.getElementById('progressText');
        this.warning = document.getElementById('warning');
        this.objectsList = document.getElementById('objectsList');
        
        this.isRunning = false;
        this.lastVoiceTime = 0;
        this.audioContext = null;
        this.isAudioEnabled = false;
        
        // МОДЕЛИ
        this.cocoModel = null;
        this.bodyPixModel = null;
        this.poseModel = null;
        
        this.ttsServer = 'https://your-tts-server.herokuapp.com';
        
        this.tg = window.Telegram.WebApp;
        
        this.init();
    }

    async init() {
        console.log('🚀 Инициализация AI систем...');
        
        this.tg.expand();
        this.tg.enableClosingConfirmation();
        
        this.mainBtn.addEventListener('click', () => this.toggleNavigation());
        this.unlockAudio();
        
        // ЗАГРУЗКА ВСЕХ МОДЕЛЕЙ
        await this.loadAllModels();
    }

    async loadAllModels() {
        try {
            // Прогресс загрузки
            this.updateProgress(10, 'Загрузка TensorFlow.js...');
            await this.wait(500);
            
            // МОДЕЛЬ 1: COCO-SSD для объектов
            this.updateProgress(30, 'Загрузка детектора объектов...');
            this.cocoModel = await cocoSsd.load({
                base: 'lite_mobilenet_v2' // Легкая версия для телефонов
            });
            console.log('✅ COCO-SSD загружена');
            
            // МОДЕЛЬ 2: BodyPix для людей
            this.updateProgress(60, 'Загрузка детектора людей...');
            this.bodyPixModel = await bodyPix.load({
                architecture: 'MobileNetV1',
                outputStride: 16,
                multiplier: 0.75,
                quantBytes: 2
            });
            console.log('✅ BodyPix загружена');
            
            // МОДЕЛЬ 3: Pose Detection для поз
            this.updateProgress(80, 'Загрузка детектора поз...');
            const detectorConfig = {
                modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
            };
            this.poseModel = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet, 
                detectorConfig
            );
            console.log('✅ Pose Detection загружена');
            
            // Завершение загрузки
            this.updateProgress(100, 'AI системы готовы!');
            await this.wait(1000);
            
            this.systemReady();
            
        } catch (error) {
            console.error('❌ Ошибка загрузки моделей:', error);
            this.systemReadyWithError(error);
        }
    }

    updateProgress(percent, text) {
        this.progress.style.width = percent + '%';
        this.progressText.textContent = text;
        this.status.textContent = text;
    }

    systemReady() {
        this.loading.style.display = 'none';
        this.mainBtn.disabled = false;
        this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ AI-СКАНИРОВАНИЕ';
        this.updateStatus('✅ Все AI модели загружены');
        this.speak('Системы искусственного интеллекта готовы к работе');
    }

    systemReadyWithError(error) {
        this.loading.style.display = 'none';
        this.mainBtn.disabled = false;
        this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ СКАНИРОВАНИЕ';
        this.updateStatus('⚠️ Часть моделей не загрузилась');
        console.error('Ошибка загрузки:', error);
    }

    unlockAudio() {
        const unlock = () => {
            if (!this.isAudioEnabled) {
                try {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const oscillator = this.audioContext.createOscillator();
                    const gainNode = this.audioContext.createGain();
                    gainNode.gain.value = 0;
                    oscillator.connect(gainNode);
                    gainNode.connect(this.audioContext.destination);
                    oscillator.start();
                    oscillator.stop(this.audioContext.currentTime + 0.001);
                    this.isAudioEnabled = true;
                } catch (error) {
                    console.log('⚠️ Аудио не разблокировано');
                }
            }
        };

        document.addEventListener('click', unlock);
        this.mainBtn.addEventListener('click', unlock);
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
            this.updateStatus('🎯 Активация AI-сканирования...');
            
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
            this.mainBtn.textContent = '⏹ ОСТАНОВИТЬ AI-СКАНИРОВАНИЕ';
            this.mainBtn.classList.add('stop');
            
            this.updateStatus('🤖 AI анализирует окружение...');
            this.speak('Системы искусственного интеллекта активированы');
            
            this.startAIAnalysis();
            
        } catch (error) {
            this.updateStatus('❌ Ошибка доступа к камере');
            this.speak('Не удалось активировать камеру');
        }
    }

    async startAIAnalysis() {
        if (!this.isRunning) return;
        
        try {
            // ПАРАЛЛЕЛЬНЫЙ АНАЛИЗ ВСЕМИ МОДЕЛЯМИ
            const [objectDetections, personSegmentation, poseEstimations] = await Promise.all([
                this.detectObjects(),
                this.detectPeople(),
                this.detectPoses()
            ]);
            
            // ОБЪЕДИНЕНИЕ РЕЗУЛЬТАТОВ
            const allDetections = this.combineDetections(
                objectDetections, 
                personSegmentation, 
                poseEstimations
            );
            
            this.processAIDetections(allDetections);
            
        } catch (error) {
            console.error('❌ Ошибка AI анализа:', error);
            this.updateStatus('⚠️ Ошибка анализа');
        }

        if (this.isRunning) {
            setTimeout(() => this.startAIAnalysis(), 2000);
        }
    }

    // МОДЕЛЬ 1: Детекция объектов
    async detectObjects() {
        if (!this.cocoModel) return [];
        
        try {
            const predictions = await this.cocoModel.detect(this.video);
            return predictions.filter(pred => pred.score > 0.5).map(pred => ({
                type: 'object',
                class: pred.class,
                score: pred.score,
                bbox: pred.bbox,
                distance: this.calculateDistance(pred.bbox)
            }));
        } catch (error) {
            console.log('❌ Ошибка детекции объектов:', error);
            return [];
        }
    }

    // МОДЕЛЬ 2: Сегментация людей
    async detectPeople() {
        if (!this.bodyPixModel) return [];
        
        try {
            const segmentation = await this.bodyPixModel.segmentPerson(this.video);
            if (segmentation && segmentation.width > 0) {
                const personCount = this.countPeople(segmentation);
                if (personCount > 0) {
                    return [{
                        type: 'person',
                        class: 'person',
                        score: 0.8,
                        bbox: [100, 100, 100, 200], // Примерные координаты
                        distance: '3-5',
                        count: personCount
                    }];
                }
            }
            return [];
        } catch (error) {
            console.log('❌ Ошибка сегментации людей:', error);
            return [];
        }
    }

    // МОДЕЛЬ 3: Детекция поз
    async detectPoses() {
        if (!this.poseModel) return [];
        
        try {
            const poses = await this.poseModel.estimatePoses(this.video);
            return poses.map(pose => ({
                type: 'pose',
                class: 'person_pose',
                score: 0.7,
                bbox: this.getPoseBoundingBox(pose),
                distance: '2-4',
                keypoints: pose.keypoints
            }));
        } catch (error) {
            console.log('❌ Ошибка детекции поз:', error);
            return [];
        }
    }

    countPeople(segmentation) {
        // Простой подсчет людей по маске сегментации
        const data = segmentation.data;
        let personPixels = 0;
        for (let i = 0; i < data.length; i++) {
            if (data[i] === 1) personPixels++;
        }
        return Math.min(3, Math.floor(personPixels / 1000)); // Ограничиваем 3 людьми
    }

    getPoseBoundingBox(pose) {
        const keypoints = pose.keypoints.filter(kp => kp.score > 0.3);
        if (keypoints.length === 0) return [100, 100, 100, 200];
        
        const xCoords = keypoints.map(kp => kp.x);
        const yCoords = keypoints.map(kp => kp.y);
        
        const minX = Math.min(...xCoords);
        const minY = Math.min(...yCoords);
        const maxX = Math.max(...xCoords);
        const maxY = Math.max(...yCoords);
        
        return [minX, minY, maxX - minX, maxY - minY];
    }

    calculateDistance(bbox) {
        const [x, y, width, height] = bbox;
        const size = width * height;
        
        if (size > 50000) return '1-2';
        if (size > 20000) return '3-4';
        if (size > 8000) return '5-7';
        if (size > 3000) return '8-10';
        return '10+';
    }

    combineDetections(objects, people, poses) {
        const allDetections = [...objects, ...people, ...poses];
        
        // Убираем дубликаты (например, person из object detection и person из segmentation)
        const uniqueDetections = [];
        const seenClasses = new Set();
        
        allDetections.forEach(detection => {
            const key = `${detection.class}_${Math.round(detection.bbox[0])}`;
            if (!seenClasses.has(key)) {
                seenClasses.add(key);
                uniqueDetections.push(detection);
            }
        });
        
        return uniqueDetections.sort((a, b) => b.score - a.score);
    }

    processAIDetections(detections) {
        // Обновляем список объектов для отладки
        this.updateObjectsList(detections);
        
        if (detections.length === 0) {
            this.updateStatus('🔍 AI: Объекты не обнаружены');
            return;
        }
        
        // Выбираем 2 самых уверенных обнаружения
        const mainDetections = detections.slice(0, 2);
        this.processMainDetections(mainDetections);
    }

    updateObjectsList(detections) {
        if (detections.length === 0) {
            this.objectsList.innerHTML = 'Нет обнаружений';
            return;
        }
        
        const html = detections.map(det => 
            `<div>${det.class} (${Math.round(det.score * 100)}%) - ${det.distance}м</div>`
        ).join('');
        
        this.objectsList.innerHTML = html;
    }

    processMainDetections(detections) {
        const now = Date.now();
        if (now - this.lastVoiceTime < 4000) return;
        
        const mainDetection = detections[0];
        const direction = this.getObjectDirection(mainDetection.bbox);
        
        let message = '';
        if (mainDetection.class === 'person' && mainDetection.count > 1) {
            message = `Обнаружено ${mainDetection.count} человек ${direction}`;
        } else {
            message = `${this.getRussianName(mainDetection.class)} ${direction} в ${mainDetection.distance} метрах`;
        }
        
        if (this.isDangerousObject(mainDetection)) {
            this.showWarning(mainDetection, direction);
            this.speak(`Внимание! ${message}`);
            this.updateStatus(`⚠️ AI: ${mainDetection.class} ${direction}`);
        } else {
            this.hideWarning();
            this.speak(message);
            this.updateStatus(`🤖 AI: ${mainDetection.class} ${direction} • ${mainDetection.distance}м`);
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

    getRussianName(englishName) {
        const dictionary = {
            'person': 'человек',
            'car': 'автомобиль', 
            'truck': 'грузовик',
            'bus': 'автобус',
            'bicycle': 'велосипед',
            'motorcycle': 'мотоцикл',
            'chair': 'стул',
            'dining table': 'стол',
            'potted plant': 'растение',
            'tv': 'телевизор',
            'laptop': 'ноутбук',
            'cell phone': 'телефон',
            'book': 'книга',
            'bottle': 'бутылка',
            'bench': 'скамейка',
            'backpack': 'рюкзак',
            'umbrella': 'зонт',
            'handbag': 'сумка',
            'person_pose': 'человек'
        };
        return dictionary[englishName] || englishName;
    }

    isDangerousObject(detection) {
        const dangerousObjects = ['car', 'truck', 'bus', 'motorcycle'];
        const isClose = detection.distance.includes('1-2') || detection.distance.includes('3-4');
        return dangerousObjects.includes(detection.class) && isClose;
    }

    showWarning(detection, direction) {
        this.warning.textContent = `🚨 ${this.getRussianName(detection.class).toUpperCase()} ${direction.toUpperCase()}!`;
        this.warning.style.display = 'block';
    }

    hideWarning() {
        this.warning.style.display = 'none';
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async speak(text) {
        console.log('🔊 AI Озвучка:', text);
        
        try {
            const encodedText = encodeURIComponent(text);
            const audioUrl = `${this.ttsServer}/speak/${encodedText}`;
            const audio = new Audio();
            audio.src = audioUrl;
            
            await new Promise((resolve, reject) => {
                audio.onloadeddata = () => audio.play().then(resolve).catch(reject);
                audio.onerror = reject;
                setTimeout(() => reject(new Error('Timeout')), 6000);
            });
            
        } catch (error) {
            console.log('❌ gTTS ошибка:', error);
            this.speakWithTTS(text);
        }
    }

    speakWithTTS(text) {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ru-RU';
            utterance.rate = 0.85;
            speechSynthesis.speak(utterance);
        }
    }

    async stopNavigation() {
        console.log('🛑 Остановка AI-сканирования...');
        
        this.isRunning = false;
        speechSynthesis.cancel();
        
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
        
        this.mainBtn.textContent = '🚀 АКТИВИРОВАТЬ AI-СКАНИРОВАНИЕ';
        this.mainBtn.classList.remove('stop');
        this.updateStatus('✅ AI-сканирование остановлено');
        this.hideWarning();
        this.objectsList.innerHTML = '';
        
        this.speak('Системы искусственного интеллекта остановлены');
    }

    updateStatus(message) {
        this.status.textContent = message;
    }
}

// Инициализация
window.addEventListener('load', () => {
    new NavigationAssistant();
});
