class BarcodeScanner {
    constructor() {
        this.codeReader = new ZXing.MultiFormatReader();
        this.results = [];
        this.currentImage = null;
        this.barcodeLocations = [];
        this.imageList = []; // 存储所有上传的图片
        this.currentImageIndex = -1; // 当前显示的图片索引
        this.initializeElements();
        this.setupEventListeners();
        this.initializeProgressAndLog();
    }

    initializeElements() {
        this.fileInput = document.getElementById('fileInput');
        this.dropZone = document.getElementById('dropZone');
        this.startCameraBtn = document.getElementById('startCamera');
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.resultsDiv = document.getElementById('results');
        this.exportBtn = document.getElementById('exportXML');
        this.selectButton = document.getElementById('selectButton');
        this.previewCanvas = document.getElementById('previewCanvas');
        this.previewContext = this.previewCanvas.getContext('2d');
        this.progressSection = document.querySelector('.progress-section');
        this.progressBar = document.getElementById('progressBar');
        this.statusText = document.getElementById('statusText');
        this.logContainer = document.getElementById('logContainer');
        this.prevImageBtn = document.getElementById('prevImage');
        this.nextImageBtn = document.getElementById('nextImage');
        this.imageCounter = document.getElementById('imageCounter');
        this.zoomInBtn = document.getElementById('zoomIn');
        this.zoomOutBtn = document.getElementById('zoomOut');
        this.resetZoomBtn = document.getElementById('resetZoom');
        
        // 初始化缩放相关变量
        this.currentScale = 1;
        this.maxScale = 3;
        this.minScale = 0.5;
    }

    setupEventListeners() {
        this.selectButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.fileInput.click();
        });

        this.dropZone.addEventListener('click', (e) => {
            if (e.target !== this.selectButton) {
                this.fileInput.click();
            }
        });

        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.dropZone.addEventListener('drop', (e) => this.handleDrop(e));
        this.startCameraBtn.addEventListener('click', () => this.toggleCamera());
        this.exportBtn.addEventListener('click', () => this.exportToXML());

        this.dropZone.addEventListener('dragenter', () => {
            this.dropZone.style.borderColor = 'var(--primary-color)';
            this.dropZone.style.background = '#f8f9ff';
        });

        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.style.borderColor = '#ccc';
            this.dropZone.style.background = 'white';
        });

        this.prevImageBtn.addEventListener('click', () => this.showPreviousImage());
        this.nextImageBtn.addEventListener('click', () => this.showNextImage());
        
        this.zoomInBtn.addEventListener('click', () => this.zoom(0.1));
        this.zoomOutBtn.addEventListener('click', () => this.zoom(-0.1));
        this.resetZoomBtn.addEventListener('click', () => this.resetZoom());
        
        this.setupDragAndZoom();
    }

    setupDragAndZoom() {
        let isDragging = false;
        let startX, startY, translateX = 0, translateY = 0;
        const container = document.getElementById('previewContainer');

        container.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
            container.style.cursor = 'grabbing';
        });

        container.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            this.updatePreviewTransform();
        });

        container.addEventListener('mouseup', () => {
            isDragging = false;
            container.style.cursor = 'grab';
        });

        container.addEventListener('mouseleave', () => {
            isDragging = false;
            container.style.cursor = 'grab';
        });

        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoom(delta);
        });
    }

    async handleFileSelect(event) {
        const files = event.target.files;
        await this.processFiles(files);
    }

    handleDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
    }

    async handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        const files = event.dataTransfer.files;
        await this.processFiles(files);
    }

    async processFiles(files) {
        if (files.length === 0) {
            this.addLog('没有选择文件', 'warning');
            return;
        }

        // 清除之前的结果
        this.results = [];
        this.barcodeLocations = [];
        this.imageList = []; // 清除之前的图片列表
        this.currentImageIndex = -1;
        this.updateResultsDisplay();
        
        // 显示进度区域
        this.progressSection.style.display = 'block';
        this.totalSteps = files.length;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                this.addLog(`开始处理文件: ${file.name}`, 'info');
                this.updateProgress((i / files.length) * 100, `正在处理文件 ${i + 1}/${files.length}: ${file.name}`);

                const image = await this.loadImage(file);
                // 存储图片信息
                this.imageList.push({
                    image: image,
                    name: file.name,
                    locations: [],
                    results: []
                });
                
                if (this.currentImageIndex === -1) {
                    this.currentImageIndex = 0;
                    this.showImage(0);
                }

                const results = await this.decodeImage(image);
                if (results && results.length > 0) {
                    this.addLog(`识别到 ${results.length} 个条码`, 'success');
                    results.forEach(result => {
                        this.addResult(result, i);
                    });
                } else {
                    this.addLog('未能识别到条码', 'warning');
                }
            } catch (error) {
                this.addLog(`处理文件 ${file.name} 时出错: ${error.message}`, 'error');
            }
        }

        // 更新图片计数器
        this.updateImageCounter();
        this.updateNavigationButtons();
    }

    loadImage(file) {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith('image/')) {
                reject(new Error('文件不是图片格式'));
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('图片加载失败'));
                image.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
        });
    }

    async decodeImage(image) {
        try {
            this.addLog('开始解码图片', 'info');
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(image, 0, 0);

            // 存储所有识别结果
            const results = [];
            
            // 尝试不同的图像处理方式
            const processings = [
                { contrast: 1, brightness: 0 },    // 原图
                { contrast: 1.2, brightness: 20 }, // 增加对比度和亮度
                { contrast: 1.5, brightness: -20 }, // 高对比度
                { contrast: 0.8, brightness: 30 }  // 低对比度高亮度
            ];

            // 设置解码提示
            const hints = new Map();
            hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
                ZXing.BarcodeFormat.QR_CODE,
                ZXing.BarcodeFormat.CODE_128,
                ZXing.BarcodeFormat.EAN_13,
                ZXing.BarcodeFormat.DATA_MATRIX,
                ZXing.BarcodeFormat.CODE_39,
                ZXing.BarcodeFormat.CODE_93,
                ZXing.BarcodeFormat.ITF
            ]);
            hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

            // 计算总步骤数
            const regions = this.getImageRegions(canvas);
            const totalSteps = processings.length * regions.length;
            let currentStep = 0;

            // 使用 Promise.all 并行处理不同的图像处理方式
            const processingPromises = processings.map(async (processing, processingIndex) => {
                const processedCanvas = this.processImage(canvas, processing);
                
                // 对每个区域进行处理
                for (const region of regions) {
                    currentStep++;
                    
                    // 使用 requestAnimationFrame 确保UI更新
                    await new Promise(resolve => {
                        requestAnimationFrame(() => {
                            const progress = (currentStep / totalSteps) * 100;
                            this.updateProgress(
                                progress,
                                `正在分析图片 ${Math.round(progress)}%`
                            );
                            resolve();
                        });
                    });

                    try {
                        const result = await this.processRegion(processedCanvas, region, hints);
                        if (result) {
                            result.region = region;
                            const isDuplicate = results.some(r => 
                                r.getText() === result.getText() && 
                                r.getBarcodeFormat() === result.getBarcodeFormat()
                            );
                            if (!isDuplicate) {
                                results.push(result);
                                this.addLog(`发现新条码: ${result.getText()}`, 'success');
                            }
                        }
                    } catch (e) {
                        // 忽略单个区域的识别错误
                        continue;
                    }
                }
            });

            // 等待所有处理完成
            await Promise.all(processingPromises);

            if (results.length === 0) {
                this.addLog('未能识别到任何条码', 'warning');
                throw new Error('未能识别到任何条码');
            }
            
            return results;
        } catch (error) {
            this.addLog(`解码失败: ${error.message}`, 'error');
            throw error;
        }
    }

    // 新增：处理单个区域的方法
    async processRegion(processedCanvas, region, hints) {
        const regionCanvas = document.createElement('canvas');
        const regionContext = regionCanvas.getContext('2d', { willReadFrequently: true });
        regionCanvas.width = region.width;
        regionCanvas.height = region.height;
        
        regionContext.drawImage(processedCanvas, 
            region.x, region.y, region.width, region.height,
            0, 0, region.width, region.height
        );

        // 尝试两种不同的二值化方式
        const binarizers = [
            new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(regionCanvas)),
            new ZXing.GlobalHistogramBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(regionCanvas))
        ];

        for (const binarizer of binarizers) {
            try {
                const bitmap = new ZXing.BinaryBitmap(binarizer);
                const reader = new ZXing.MultiFormatReader();
                return await reader.decode(bitmap, hints);
            } catch (e) {
                continue;
            }
        }
        return null;
    }

    // 图像处理函数
    processImage(canvas, { contrast, brightness }) {
        const processedCanvas = document.createElement('canvas');
        processedCanvas.width = canvas.width;
        processedCanvas.height = canvas.height;
        const ctx = processedCanvas.getContext('2d', { willReadFrequently: true });
        
        // 应用对比度和亮度调整
        ctx.filter = `contrast(${contrast * 100}%) brightness(${100 + brightness}%)`;
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
        
        return processedCanvas;
    }

    // 优化区域分割策略
    getImageRegions(canvas) {
        const regions = [];
        const width = canvas.width;
        const height = canvas.height;
        
        // 基本区域大小
        const minSize = Math.min(width, height) / 3;
        
        // 垂直分割
        const verticalSlices = Math.ceil(height / minSize);
        const sliceHeight = height / verticalSlices;
        
        for (let i = 0; i < verticalSlices; i++) {
            regions.push({
                x: 0,
                y: i * sliceHeight,
                width: width,
                height: sliceHeight * 1.2 // 添加重叠
            });
        }
        
        // 水平分割
        const horizontalSlices = Math.ceil(width / minSize);
        const sliceWidth = width / horizontalSlices;
        
        for (let i = 0; i < horizontalSlices; i++) {
            regions.push({
                x: i * sliceWidth,
                y: 0,
                width: sliceWidth * 1.2, // 添加重叠
                height: height
            });
        }
        
        // 添加整图
        regions.push({
            x: 0,
            y: 0,
            width: width,
            height: height
        });
        
        // 添加四个角落区域
        const cornerSize = Math.max(width, height) / 2;
        regions.push(
            { x: 0, y: 0, width: cornerSize, height: cornerSize }, // 左上
            { x: width - cornerSize, y: 0, width: cornerSize, height: cornerSize }, // 右上
            { x: 0, y: height - cornerSize, width: cornerSize, height: cornerSize }, // 左下
            { x: width - cornerSize, y: height - cornerSize, width: cornerSize, height: cornerSize } // 右下
        );
        
        return regions;
    }

    updatePreview(image) {
        // 调整canvas大小以适应图片
        const maxWidth = 800; // 最大预览宽度
        const scale = Math.min(1, maxWidth / image.width);
        this.previewCanvas.width = image.width * scale;
        this.previewCanvas.height = image.height * scale;
        
        // 清除画布并绘制图片
        this.previewContext.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
        this.previewContext.drawImage(image, 0, 0, this.previewCanvas.width, this.previewCanvas.height);
    }

    drawBarcodeLocations(locations) {
        if (!this.currentImage || locations.length === 0) return;

        const scale = this.previewCanvas.width / this.currentImage.width;
        this.previewContext.strokeStyle = '#FF0000';
        this.previewContext.lineWidth = 2;
        this.previewContext.font = 'bold 16px Arial';
        this.previewContext.fillStyle = '#FF0000';

        locations.forEach((location, index) => {
            const scaledX = location.x * scale;
            const scaledY = location.y * scale;
            const scaledWidth = location.width * scale;
            const scaledHeight = location.height * scale;

            // 绘制半透明背景
            this.previewContext.fillStyle = 'rgba(255, 0, 0, 0.1)';
            this.previewContext.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);

            // 绘制边框
            this.previewContext.strokeStyle = '#FF0000';
            this.previewContext.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
            
            // 绘制标签背景
            const label = `条码 ${index + 1}`;
            const labelWidth = this.previewContext.measureText(label).width + 10;
            this.previewContext.fillStyle = '#FF0000';
            this.previewContext.fillRect(scaledX, scaledY - 25, labelWidth, 20);
            
            // 绘制标签文字
            this.previewContext.fillStyle = '#FFFFFF';
            this.previewContext.fillText(label, scaledX + 5, scaledY - 10);
        });
    }

    addResult(result, imageIndex) {
        const newResult = {
            type: result.getBarcodeFormat(),
            content: result.getText(),
            timestamp: new Date().toISOString(),
            location: {
                x: result.region.x,
                y: result.region.y,
                width: result.region.width,
                height: result.region.height
            }
        };

        // 将结果添加到对应图片的数据中
        this.imageList[imageIndex].locations.push(newResult.location);
        this.imageList[imageIndex].results.push(newResult);
        
        // 如果是当前显示的图片，更新显示
        if (imageIndex === this.currentImageIndex) {
            this.drawBarcodeLocations(this.imageList[imageIndex].locations);
        }
        
        console.log('添加新结果:', newResult);
        this.results.push(newResult);
        this.updateResultsDisplay();
    }

    updateResultsDisplay() {
        this.resultsDiv.innerHTML = this.results.map((result, index) => `
            <div class="result-item">
                <div class="result-info">
                    <p>类型: ${result.type}</p>
                    <p>内容: ${result.content}</p>
                    <p>时间: ${result.timestamp}</p>
                </div>
                <button class="highlight-btn" onclick="window.barcodeScanner.highlightBarcode(${index})">
                    高亮显示
                </button>
            </div>
        `).join('');
    }

    highlightBarcode(index) {
        if (!this.currentImage || !this.barcodeLocations[index]) return;

        // 重绘预览图
        this.updatePreview(this.currentImage);

        // 高亮选中的条码
        const location = this.barcodeLocations[index];
        const scale = this.previewCanvas.width / this.currentImage.width;
        
        this.previewContext.strokeStyle = '#00FF00';
        this.previewContext.lineWidth = 3;
        this.previewContext.strokeRect(
            location.x * scale,
            location.y * scale,
            location.width * scale,
            location.height * scale
        );

        // 添加动画效果
        setTimeout(() => {
            this.drawBarcodeLocations();
        }, 1000);
    }

    exportToXML() {
        this.addLog('开始导出XML文件', 'info');
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<barcodes>
    ${this.results.map(result => `
    <barcode>
        <type>${result.type}</type>
        <content>${result.content}</content>
        <timestamp>${result.timestamp}</timestamp>
    </barcode>`).join('')}
</barcodes>`;

        const blob = new Blob([xml], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'barcodes.xml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.addLog('XML文件导出完成', 'success');
    }

    async toggleCamera() {
        if (this.video.style.display === 'none') {
            try {
                this.addLog('正在启动摄像头', 'info');
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                this.video.srcObject = stream;
                this.video.style.display = 'block';
                this.startCameraBtn.textContent = '关闭摄像头';
                this.startVideoProcessing();
                this.addLog('摄像头启动成功', 'success');
            } catch (error) {
                this.addLog(`摄像头访问失败: ${error.message}`, 'error');
                console.error('无法访问摄像头:', error);
            }
        } else {
            this.stopCamera();
            this.addLog('摄像头已关闭', 'info');
        }
    }

    stopCamera() {
        const stream = this.video.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        this.video.style.display = 'none';
        this.startCameraBtn.textContent = '开启摄像头';
    }

    startVideoProcessing() {
        const processFrame = async () => {
            if (this.video.style.display !== 'none') {
                try {
                    const result = await this.decodeVideoFrame();
                    if (result) {
                        this.addResult(result);
                    }
                } catch (error) {
                    // 忽略识别失败的帧
                }
                requestAnimationFrame(processFrame);
            }
        };
        requestAnimationFrame(processFrame);
    }

    decodeVideoFrame() {
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        const context = this.canvas.getContext('2d');
        context.drawImage(this.video, 0, 0);
        const imageData = context.getImageData(0, 0, this.canvas.width, this.canvas.height);
        return this.codeReader.decode(imageData);
    }

    // 初始化进度和日志功能
    initializeProgressAndLog() {
        this.currentProgress = 0;
        this.totalSteps = 0;
        this.logs = [];
    }

    // 修改进度更新方法，添加防抖
    updateProgress(progress, message) {
        if (this._updateProgressTimeout) {
            clearTimeout(this._updateProgressTimeout);
        }
        
        this._updateProgressTimeout = setTimeout(() => {
            this.currentProgress = progress;
            this.progressBar.style.width = `${progress}%`;
            if (message) {
                this.statusText.innerHTML = `${message} <div class="loading"></div>`;
            }
        }, 16); // 约60fps的更新频率
    }

    // 添加日志
    addLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        this.logContainer.insertBefore(logEntry, this.logContainer.firstChild);
        
        // 保持日志不超过100条
        if (this.logContainer.children.length > 100) {
            this.logContainer.removeChild(this.logContainer.lastChild);
        }
    }

    showImage(index) {
        if (index < 0 || index >= this.imageList.length) return;
        
        this.currentImageIndex = index;
        const imageData = this.imageList[index];
        this.currentImage = imageData.image;
        
        // 重置缩放和位置
        this.resetZoom();
        
        // 更新预览
        this.updatePreview(imageData.image);
        
        // 绘制该图片的条码位置
        this.drawBarcodeLocations(imageData.locations);
        
        // 更新计数器和按钮状态
        this.updateImageCounter();
        this.updateNavigationButtons();
    }

    showPreviousImage() {
        if (this.currentImageIndex > 0) {
            this.showImage(this.currentImageIndex - 1);
        }
    }

    showNextImage() {
        if (this.currentImageIndex < this.imageList.length - 1) {
            this.showImage(this.currentImageIndex + 1);
        }
    }

    updateImageCounter() {
        if (this.imageList.length > 0) {
            this.imageCounter.textContent = `${this.currentImageIndex + 1}/${this.imageList.length}`;
        } else {
            this.imageCounter.textContent = '0/0';
        }
    }

    updateNavigationButtons() {
        this.prevImageBtn.disabled = this.currentImageIndex <= 0;
        this.nextImageBtn.disabled = this.currentImageIndex >= this.imageList.length - 1;
    }

    zoom(delta) {
        const newScale = this.currentScale + delta;
        if (newScale >= this.minScale && newScale <= this.maxScale) {
            this.currentScale = newScale;
            this.updatePreviewTransform();
        }
    }

    resetZoom() {
        this.currentScale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.updatePreviewTransform();
    }

    updatePreviewTransform() {
        const canvas = this.previewCanvas;
        const context = this.previewContext;
        
        // 清除画布
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // 应用变换
        context.save();
        context.translate(this.translateX, this.translateY);
        context.scale(this.currentScale, this.currentScale);
        
        // 绘制图片
        if (this.currentImage) {
            context.drawImage(this.currentImage, 0, 0, canvas.width / this.currentScale, canvas.height / this.currentScale);
        }
        
        // 绘制条码位置
        if (this.imageList[this.currentImageIndex]) {
            this.drawBarcodeLocations(this.imageList[this.currentImageIndex].locations);
        }
        
        context.restore();
    }
}

// 初始化应用并使其全局可访问（用于事件处理）
document.addEventListener('DOMContentLoaded', () => {
    window.barcodeScanner = new BarcodeScanner();
}); 