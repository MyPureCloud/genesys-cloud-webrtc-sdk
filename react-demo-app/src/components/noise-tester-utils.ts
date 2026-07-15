export const FLOOR_WINDOW = 180;
export const CALIBRATE_MS = 4000;
export const CHALLENGE_MS = 6000;

export function dbFromRms(rms: number): number {
  if (!rms || rms <= 1e-8) return -100;
  return 20 * Math.log10(rms);
}

export function formatDb(db: number): string {
  if (!Number.isFinite(db)) return '— dBFS';
  return `${db.toFixed(1)} dBFS`;
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return -100;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

export function analyseFrame(analyser: AnalyserNode, history: number[]) {
  const time = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(time);

  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < time.length; i++) {
    const v = time[i];
    sumSq += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }

  const rms = Math.sqrt(sumSq / time.length);
  const rmsDb = dbFromRms(rms);
  const peakDb = dbFromRms(peak);

  history.push(rmsDb);
  if (history.length > FLOOR_WINDOW) history.shift();
  const floorDb = percentile([...history].sort((a, b) => a - b), 0.1);

  return { rmsDb, peakDb, floorDb, time };
}

export function drawMeter(canvas: HTMLCanvasElement, rmsDb: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const clamped = Math.max(-60, Math.min(0, rmsDb));
  const ratio = (clamped + 60) / 60;

  ctx.fillStyle = '#0b141a';
  ctx.fillRect(0, 0, width, height);

  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, '#0f766e');
  grad.addColorStop(0.7, '#ca8a04');
  grad.addColorStop(1, '#c2410c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width * ratio, height);

  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let db = -60; db <= 0; db += 10) {
    const x = ((db + 60) / 60) * width;
    ctx.fillRect(x, 0, 1, height);
  }
}

export function drawWave(canvas: HTMLCanvasElement, timeData: Float32Array) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0b141a';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#5eead4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const mid = height / 2;
  for (let i = 0; i < timeData.length; i++) {
    const x = (i / (timeData.length - 1)) * width;
    const y = mid + timeData[i] * mid * 0.9;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export async function waitIceComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise<void>((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export async function createLoopback(stream: MediaStream) {
  const pcLocal = new RTCPeerConnection({ iceServers: [] });
  const pcRemote = new RTCPeerConnection({ iceServers: [] });

  stream.getTracks().forEach((track) => pcLocal.addTrack(track, stream));

  const remoteStream = new MediaStream();
  pcRemote.ontrack = (event) => {
    event.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
    if (!event.streams[0]) remoteStream.addTrack(event.track);
  };

  pcLocal.onicecandidate = (event) => {
    if (event.candidate) pcRemote.addIceCandidate(event.candidate).catch(() => {});
  };
  pcRemote.onicecandidate = (event) => {
    if (event.candidate) pcLocal.addIceCandidate(event.candidate).catch(() => {});
  };

  const offer = await pcLocal.createOffer({ offerToReceiveAudio: false });
  await pcLocal.setLocalDescription(offer);
  await waitIceComplete(pcLocal);
  await pcRemote.setRemoteDescription(pcLocal.localDescription!);
  const answer = await pcRemote.createAnswer();
  await pcRemote.setLocalDescription(answer);
  await waitIceComplete(pcRemote);
  await pcLocal.setRemoteDescription(pcRemote.localDescription!);

  await new Promise<void>((resolve) => {
    if (remoteStream.getAudioTracks().length) {
      resolve();
      return;
    }
    const started = performance.now();
    const timer = setInterval(() => {
      if (remoteStream.getAudioTracks().length || performance.now() - started > 2000) {
        clearInterval(timer);
        resolve();
      }
    }, 50);
  });

  return { pcLocal, pcRemote, remoteStream };
}

export function createNoiseBuffer(ctx: AudioContext, type: string, seconds = 2): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let last = 0;

  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    let sample = white;

    if (type === 'pink') {
      b0 = b0 * 0.99886 + white * 0.0555179;
      b1 = b1 * 0.99332 + white * 0.0750759;
      b2 = b2 * 0.969 + white * 0.153852;
      b3 = b3 * 0.8665 + white * 0.3104856;
      b4 = b4 * 0.55 + white * 0.5329522;
      b5 = b5 * -0.7616 - white * 0.016898;
      sample = b0 + b1 + b2 + b3 + b4 + b5 + b6 * 0.5362;
      b6 = white * 0.115926;
      sample *= 0.11;
    } else if (type === 'hvac') {
      const t = i / sampleRate;
      sample =
        0.35 * Math.sin(2 * Math.PI * 60 * t) +
        0.18 * Math.sin(2 * Math.PI * 120 * t) +
        0.08 * Math.sin(2 * Math.PI * 180 * t) +
        white * 0.04;
    } else if (type === 'keyboard') {
      const clickEvery = Math.floor(sampleRate * 0.11);
      const pos = i % clickEvery;
      if (pos < sampleRate * 0.006) {
        sample = white * Math.exp(-pos / (sampleRate * 0.0025));
      } else {
        sample = white * 0.008;
      }
    } else if (type === 'babble') {
      const t = i / sampleRate;
      const formant =
        Math.sin(2 * Math.PI * (180 + 40 * Math.sin(2 * Math.PI * 2.1 * t)) * t) *
        Math.sin(2 * Math.PI * (900 + 120 * Math.sin(2 * Math.PI * 0.7 * t)) * t);
      sample = formant * 0.25 + white * 0.08;
    } else if (type === 'traffic') {
      last = (last + 0.02 * white) / 1.02;
      const t = i / sampleRate;
      sample = last * 0.9 + 0.12 * Math.sin(2 * Math.PI * 35 * t);
    }

    data[i] = Math.max(-1, Math.min(1, sample));
  }

  return buffer;
}

export function averageHistory(history: number[], ms: number): number {
  const frames = Math.max(1, Math.floor(ms / 16.7));
  const slice = history.slice(-frames);
  if (!slice.length) return -100;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}
