class BarcodeScanner {
    constructor() {
        this.codeReader = new ZXing.MultiFormatReader();
        this.results = [];
        this.currentImage = null;
        this.barcodeLocations = [];
        this.initializeElements();
        this.setupEventListeners();
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
    }

    setupEventListeners() {
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.dropZone.addEventListener('drop', (e) => this.handleDrop(e));
        this.startCameraBtn.addEventListener('click', () => this.toggleCamera());
        this.exportBtn.addEventListener('click', () => this.exportToXML());
        this.selectButton.addEventListener('click', () => {
            this.fileInput.click();
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
            console.log('没有选择文件');
            return;
        }

        // 清除之前的结果
        this.results = [];
        this.barcodeLocations = [];
        this.updateResultsDisplay();

        for (const file of files) {
            try {
                console.log('正在处理文件:', file.name);
                const image = await this.loadImage(file);
                this.currentImage = image;
                this.updatePreview(image);
                console.log('图片加载完成');
                const results = await this.decodeImage(image);
                if (results && results.length > 0) {
                    console.log('识别到 ' + results.length + ' 个条码');
                    results.forEach(result => {
                        this.addResult(result);
                    });
                    this.drawBarcodeLocations();
                } else {
                    console.log('未能识别到条码');
                }
            } catch (error) {
                console.error('处理图片时出错:', error);
                this.resultsDiv.innerHTML += `
                    <div class="result-item error">
                        <p>处理文件 ${file.name} 时出错: ${error.message}</p>
                    </div>
                `;
            }
        }
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

            // 对每种图像处理方式进行识别
            for (const processing of processings) {
                const processedCanvas = this.processImage(canvas, processing);
                const regions = this.getImageRegions(processedCanvas);
                
                for (const region of regions) {
                    try {
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
                                const result = reader.decode(bitmap, hints);
                                
                                if (result) {
                                    // 为结果添加区域信息
                                    result.region = region;
                                    
                                    // 检查是否已经存在相同的结果
                                    const isDuplicate = results.some(r => 
                                        r.getText() === result.getText() && 
                                        r.getBarcodeFormat() === result.getBarcodeFormat()
                                    );
                                    if (!isDuplicate) {
                                        results.push(result);
                                        console.log('发现新条码:', result.getText(), '位置:', region);
                                    }
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }

            if (results.length === 0) {
                throw new Error('未能识别到任何条码');
            }
            
            return results;
        } catch (error) {
            console.error('解码失败:', error);
            throw error;
        }
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

    drawBarcodeLocations() {
        if (!this.currentImage || this.barcodeLocations.length === 0) return;

        const scale = this.previewCanvas.width / this.currentImage.width;
        this.previewContext.strokeStyle = '#FF0000';
        this.previewContext.lineWidth = 2;
        this.previewContext.font = 'bold 16px Arial';
        this.previewContext.fillStyle = '#FF0000';

        this.barcodeLocations.forEach((location, index) => {
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

    addResult(result) {
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

        this.barcodeLocations.push(newResult.location);
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
    }

    async toggleCamera() {
        if (this.video.style.display === 'none') {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                this.video.srcObject = stream;
                this.video.style.display = 'block';
                this.startCameraBtn.textContent = '关闭摄像头';
                this.startVideoProcessing();
            } catch (error) {
                console.error('无法访问摄像头:', error);
            }
        } else {
            this.stopCamera();
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
}

// 初始化应用并使其全局可访问（用于事件处理）
document.addEventListener('DOMContentLoaded', () => {
    window.barcodeScanner = new BarcodeScanner();
}); 