const canvas = document.getElementById('gridCanvas');
const ctx = canvas.getContext('2d');

let animationId = null;
let isAnimating = false;
let isRecording = false;
let currentPhase = 0;
let lastTimestamp = 0;

function updateCanvasSize() {
    const orientation = document.getElementById('canvasOrientation').value;
    if (orientation === 'vertical') {
        canvas.width = 1080;
        canvas.height = 1920;
    } else {
        canvas.width = 1920;
        canvas.height = 1080;
    }
    if (!isAnimating && !isRecording) drawFrameWithPhase(currentPhase);
}

// FUNGSI MENGGAMBAR ANTI-FLICKERING
function drawGrid(shiftX, shiftY) {
    const bgColor = document.getElementById('colorBg').value;
    const lineColor = document.getElementById('colorLine').value;
    const size = parseInt(document.getElementById('gridSize').value);
    const lineWidth = parseInt(document.getElementById('lineWidth').value);
    const showH = document.getElementById('showHorizontal').checked;
    const showV = document.getElementById('showVertical').checked;

    // Bersihkan layar
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    
    // Trik Pixel Snapping: Membulatkan koordinat pergerakan (Mencegah flickering)
    let snapX = Math.round(shiftX);
    let snapY = Math.round(shiftY);
    
    // Trik Garis Tipis (1px, 3px): Canvas menempatkan garis di tengah piksel, 
    // jika ukurannya ganjil, kita harus geser 0.5px agar warnanya tajam pekat.
    const sharpOffset = (lineWidth % 2 === 0) ? 0 : 0.5;
    ctx.translate(snapX + sharpOffset, snapY + sharpOffset); 
    
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    if (showV) {
        for (let x = -size; x <= canvas.width + size * 2; x += size) {
            ctx.moveTo(x, -size);
            ctx.lineTo(x, canvas.height + size * 2);
        }
    }

    if (showH) {
        for (let y = -size; y <= canvas.height + size * 2; y += size) {
            ctx.moveTo(-size, y);
            ctx.lineTo(canvas.width + size * 2, y);
        }
    }

    ctx.stroke();
    ctx.restore();
}

function drawFrameWithPhase(phase) {
    const size = parseInt(document.getElementById('gridSize').value);
    const direction = document.getElementById('animDirection').value;
    
    const distance = phase * size; 
    let dx = 0, dy = 0;

    switch (direction) {
        case 'up': dy = -1; break;
        case 'bottom': dy = 1; break; 
        case 'left': dx = -1; break;
        case 'right': dx = 1; break;
        case 'top-left': dx = -1; dy = -1; break;
        case 'top-right': dx = 1; dy = -1; break;
        case 'bottom-left': dx = -1; dy = 1; break;
        case 'bottom-right': dx = 1; dy = 1; break;
    }

    drawGrid((dx * distance) % size, (dy * distance) % size);
}

function previewLoop(timestamp) {
    if (!isAnimating) return;
    if (!lastTimestamp) lastTimestamp = timestamp;

    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    const speedVal = parseInt(document.getElementById('animSpeed').value);
    const cycleDuration = 10000 / speedVal; 

    currentPhase += delta / cycleDuration;
    currentPhase = currentPhase % 1.0; 

    drawFrameWithPhase(currentPhase);
    animationId = requestAnimationFrame(previewLoop);
}

// Logika Tombol + dan -
document.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetId = e.target.getAttribute('data-target');
        const step = parseInt(e.target.getAttribute('data-step'));
        const input = document.getElementById(targetId);
        
        let newVal = parseInt(input.value) + step;
        const min = parseInt(input.min);
        const max = parseInt(input.max);
        
        if (newVal >= min && newVal <= max) {
            input.value = newVal;
            input.dispatchEvent(new Event('input')); 
        }
    });
});

document.getElementById('togglePreview').addEventListener('change', (e) => {
    isAnimating = e.target.checked;
    if (isAnimating) {
        lastTimestamp = 0; 
        requestAnimationFrame(previewLoop);
    } else {
        cancelAnimationFrame(animationId);
    }
});

const inputs = document.querySelectorAll('input[type="range"], input[type="color"], input[type="checkbox"]:not(#togglePreview), select');
inputs.forEach(input => {
    if (input.id === 'canvasOrientation') {
        input.addEventListener('change', updateCanvasSize);
    } else {
        input.addEventListener('input', () => {
            document.getElementById('sizeVal').innerText = document.getElementById('gridSize').value;
            document.getElementById('widthVal').innerText = document.getElementById('lineWidth').value;
            document.getElementById('speedVal').innerText = document.getElementById('animSpeed').value;
            if (!isAnimating && !isRecording) drawFrameWithPhase(currentPhase);
        });
    }
});

// ENGINE RENDER FRAME-BY-FRAME (WEBCODECS API)
document.getElementById('downloadBtn').addEventListener('click', async () => {
    if (isRecording) return;
    if (typeof Mp4Muxer === 'undefined') {
        alert("Library MP4 Muxer belum dimuat. Pastikan Anda terkoneksi ke internet.");
        return;
    }

    isRecording = true;
    const btn = document.getElementById('downloadBtn');
    btn.innerText = '⏳ Menyusun MP4 (Mohon Tunggu)...';
    btn.style.backgroundColor = '#f39c12';
    btn.disabled = true;

    // Hentikan preview
    const wasAnimating = isAnimating;
    isAnimating = false;
    cancelAnimationFrame(animationId);

    // KALKULASI LOOP
    const fps = 60;
    const speedVal = parseInt(document.getElementById('animSpeed').value);
    const cycleDurationInSeconds = (10000 / speedVal) / 1000;
    
    // Rekam persis sejumlah siklus hingga menyentuh ~3 detik
    const cyclesToRecord = Math.max(1, Math.ceil(3 / cycleDurationInSeconds));
    const exactRecordTimeInSeconds = cyclesToRecord * cycleDurationInSeconds;
    const totalFrames = Math.round(exactRecordTimeInSeconds * fps);

    // SETUP MP4 MUXER & VIDEO ENCODER
    let muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: {
            codec: 'avc', // H.264 MP4
            width: canvas.width,
            height: canvas.height
        },
        fastStart: 'in-memory'
    });

    let videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error("VideoEncoder Error:", e)
    });

    videoEncoder.configure({
        codec: 'avc1.640028', // H.264 High Profile
        width: canvas.width,
        height: canvas.height,
        bitrate: 10_000_000, // 10 Mbps untuk gambar yang sangat jernih
        framerate: fps,
    });

    let frameCount = 0;

    // Fungsi Render Rekursif Asinkron (agar browser tidak hang)
    const encodeNextFrame = async () => {
        // Jika semua frame selesai di-render
        if (frameCount >= totalFrames) {
            await videoEncoder.flush();
            muxer.finalize();
            
            // Unduh file MP4
            let buffer = muxer.target.buffer;
            let blob = new Blob([buffer], { type: 'video/mp4' });
            let url = URL.createObjectURL(blob);
            
            let a = document.createElement('a');
            a.href = url;
            a.download = 'Pro_Grid_Loop.mp4';
            a.click();

            // Reset UI
            btn.innerText = '📥 Render HD MP4';
            btn.style.backgroundColor = '#ff4757';
            btn.disabled = false;
            isRecording = false;

            if (wasAnimating) {
                isAnimating = true;
                lastTimestamp = 0;
                requestAnimationFrame(previewLoop);
            }
            return;
        }

        // Cegah memori penuh jika encoder kewalahan
        if (videoEncoder.encodeQueueSize > 20) {
            setTimeout(encodeNextFrame, 10);
            return;
        }

        // KUNCI LOOP SEMPURNA: Matematika phase Frame per Frame
        // Kita mencetak frame ke-N, dibagi total frame dalam 1 siklus
        const framesPerCycle = Math.round(cycleDurationInSeconds * fps);
        let phase = (frameCount % framesPerCycle) / framesPerCycle;
        
        drawFrameWithPhase(phase);
        
        // Konversi Canvas ke Video Frame dan masukkan ke Encoder
        let timestampMicroseconds = (frameCount * 1000000) / fps;
        let frame = new VideoFrame(canvas, { timestamp: timestampMicroseconds });
        videoEncoder.encode(frame, { keyFrame: frameCount % fps === 0 });
        frame.close(); // Kosongkan memori frame

        frameCount++;
        
        // Render frame berikutnya
        requestAnimationFrame(encodeNextFrame);
    };

    // Mulai proses render
    encodeNextFrame();
});

updateCanvasSize();