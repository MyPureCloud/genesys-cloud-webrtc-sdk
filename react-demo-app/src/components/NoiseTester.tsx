import { useEffect, useRef, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../types/store';
import Card from './Card';
import { GuxButton } from 'genesys-spark-components-react';
import './NoiseTester.css';
import {
  formatDb,
  analyseFrame,
  drawMeter,
  createLoopback,
  createNoiseBuffer,
  averageHistory,
  CALIBRATE_MS,
  CHALLENGE_MS,
} from './noise-tester-utils';

interface SessionState {
  localStream: MediaStream | null;
  pcLocal: RTCPeerConnection | null;
  pcRemote: RTCPeerConnection | null;
  audioCtx: AudioContext | null;
  nearAnalyser: AnalyserNode | null;
  farAnalyser: AnalyserNode | null;
  nearSource: MediaStreamAudioSourceNode | null;
  farSource: MediaStreamAudioSourceNode | null;
  nearHistory: number[];
  farHistory: number[];
  noiseNodes: AudioNode[];
  baselineFarDb: number | null;
}

export default function NoiseTester() {
  const audioProcessor = useSelector((state: RootState) => state.audioProcessor.audioProcessor);
  const [collapsed, setCollapsed] = useState(true);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [browserEc, setBrowserEc] = useState(false);
  const [browserNs, setBrowserNs] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Idle — select your mic (IRIS virtual device if using one).');
  const [challengeStatus, setChallengeStatus] = useState('Start loopback, then calibrate in a quiet room.');
  const [gradeInfo, setGradeInfo] = useState<{ text: string; color: string } | null>(null);

  const [nearRms, setNearRms] = useState('— dBFS');
  const [nearPeak, setNearPeak] = useState('— dBFS');
  const [nearFloor, setNearFloor] = useState('— dBFS');
  const [farRms, setFarRms] = useState('— dBFS');
  const [farPeak, setFarPeak] = useState('— dBFS');
  const [farFloor, setFarFloor] = useState('— dBFS');
  const [noiseCancelled, setNoiseCancelled] = useState('— dB');
  const [cancelledColor, setCancelledColor] = useState('#5eead4');

  const [noiseType, setNoiseType] = useState('keyboard');
  const [noiseGain, setNoiseGain] = useState(0.25);
  const [baselineValue, setBaselineValue] = useState('—');
  const [challengeValue, setChallengeValue] = useState('—');
  const [leakValue, setLeakValue] = useState('—');
  const [suppressionValue, setSuppressionValue] = useState('—');
  const [logs, setLogs] = useState<string[]>([]);

  const nearMeterRef = useRef<HTMLCanvasElement>(null);
  const farMeterRef = useRef<HTMLCanvasElement>(null);
  const cancelledGraphRef = useRef<HTMLCanvasElement>(null);
  const cancelledHistoryRef = useRef<number[]>([]);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number>(0);
  const sessionRef = useRef<SessionState>({
    localStream: null,
    pcLocal: null,
    pcRemote: null,
    audioCtx: null,
    nearAnalyser: null,
    farAnalyser: null,
    nearSource: null,
    farSource: null,
    nearHistory: [],
    farHistory: [],
    noiseNodes: [],
    baselineFarDb: null,
  });

  const pushLog = useCallback((line: string) => {
    const stamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${stamp}] ${line}`, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    listMics();
    navigator.mediaDevices?.addEventListener?.('devicechange', listMics);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', listMics);
    };
  }, []);

  // Live-swap the audio track when audio processor is toggled
  useEffect(() => {
    const s = sessionRef.current;
    if (!running || !s.localStream || !s.pcLocal) return;

    async function swapTrack() {
      const s = sessionRef.current;
      if (!s.localStream || !s.pcLocal) return;

      let streamToSend = s.localStream;
      if (audioProcessor) {
        try {
          await audioProcessor.init();
          streamToSend = await audioProcessor.process(s.localStream);
          pushLog(`Audio processor "${audioProcessor.name}" applied live`);
        } catch (err) {
          console.warn('Audio processor failed during live swap:', err);
          pushLog('Audio processor failed during live swap — using raw stream');
        }
      } else {
        pushLog('Audio processor removed — using raw mic stream');
      }

      // Replace the track on the existing peer connection sender
      const sender = s.pcLocal!.getSenders().find((sn) => sn.track?.kind === 'audio');
      const newTrack = streamToSend.getAudioTracks()[0];
      if (sender && newTrack) {
        await sender.replaceTrack(newTrack);
      }
    }

    swapTrack();
  }, [audioProcessor, running]);

  async function listMics() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      setMics(audioInputs);
      if (audioInputs.length && !selectedMic) {
        setSelectedMic(audioInputs[0].deviceId);
      }
    } catch {
      // Will populate after getUserMedia
    }
  }

  const lastUpdateRef = useRef<number>(0);

  function drawCancelledGraph(canvas: HTMLCanvasElement, history: number[]) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0b141a';
    ctx.fillRect(0, 0, width, height);

    // Grid lines at 0, 10, 20, 30 dB
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    const maxDb = 40;
    for (let db = 0; db <= maxDb; db += 10) {
      const y = height - (db / maxDb) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Label
      ctx.fillStyle = '#555';
      ctx.font = '10px monospace';
      ctx.fillText(`${db}`, 4, y - 2);
    }

    if (history.length < 2) return;

    // Draw the line
    ctx.strokeStyle = '#5eead4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const x = (i / (200 - 1)) * width;
      const clamped = Math.max(0, Math.min(maxDb, history[i]));
      const y = height - (clamped / maxDb) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under the line
    const lastX = ((history.length - 1) / (200 - 1)) * width;
    ctx.lineTo(lastX, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(94, 234, 212, 0.1)';
    ctx.fill();
  }

  function tick() {
    const s = sessionRef.current;
    if (!s.nearAnalyser || !s.farAnalyser) return;

    const near = analyseFrame(s.nearAnalyser, s.nearHistory);
    const far = analyseFrame(s.farAnalyser, s.farHistory);

    // Only update DOM every 250ms to keep values readable
    const now = performance.now();
    if (now - lastUpdateRef.current > 250) {
      lastUpdateRef.current = now;

      setNearRms(formatDb(near.rmsDb));
      setNearPeak(formatDb(near.peakDb));
      setNearFloor(formatDb(near.floorDb));
      setFarRms(formatDb(far.rmsDb));
      setFarPeak(formatDb(far.peakDb));
      setFarFloor(formatDb(far.floorDb));

      // Noise Cancelled = noise floor difference (near floor - far floor)
      // Uses 10th percentile quiet level — more stable than instantaneous RMS
      const cancelled = near.floorDb - far.floorDb;
      if (Number.isFinite(cancelled) && near.floorDb > -90) {
        // Color grade based on suppression level
        let grade = 'Horrible';
        let color = '#dc2626';
        if (cancelled >= 15) { grade = 'Excellent'; color = '#10b981'; }
        else if (cancelled >= 8) { grade = 'Good'; color = '#22c55e'; }
        else if (cancelled >= 3) { grade = 'Bad'; color = '#f59e0b'; }
        setNoiseCancelled(`${cancelled.toFixed(1)} dB — ${grade}`);
        setCancelledColor(color);
      } else {
        setNoiseCancelled('— dB');
        setCancelledColor('#5eead4');
      }
    }

    // Update cancelled graph at every frame for smooth line
    const cancelledNow = near.floorDb - far.floorDb;
    const history = cancelledHistoryRef.current;
    if (Number.isFinite(cancelledNow) && near.floorDb > -90) {
      history.push(cancelledNow);
    } else {
      history.push(0);
    }
    if (history.length > 200) history.shift();
    if (cancelledGraphRef.current) drawCancelledGraph(cancelledGraphRef.current, history);

    // Keep drawing meters at full framerate for smooth visuals
    if (nearMeterRef.current) drawMeter(nearMeterRef.current, near.rmsDb);
    if (farMeterRef.current) drawMeter(farMeterRef.current, far.rmsDb);

    rafRef.current = requestAnimationFrame(tick);
  }

  async function startSession() {
    setStatus('Requesting microphone…');
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedMic ? { exact: selectedMic } : undefined,
          echoCancellation: browserEc,
          noiseSuppression: browserNs,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      };

      const localStream = await navigator.mediaDevices.getUserMedia(constraints);
      await listMics();

      // Process through Iris (audio processor) if active
      let processedStream = localStream;
      if (audioProcessor) {
        try {
          await audioProcessor.init();
          processedStream = await audioProcessor.process(localStream);
          pushLog(`Audio processor "${audioProcessor.name}" applied to mic stream`);
        } catch (err) {
          console.warn('Audio processor failed, using raw stream:', err);
          pushLog('Audio processor failed — using raw mic stream');
        }
      } else {
        pushLog('No audio processor active — using raw mic stream');
      }

      setStatus('Negotiating local WebRTC loopback…');
      const { pcLocal, pcRemote, remoteStream } = await createLoopback(processedStream);

      if (!remoteStream.getAudioTracks().length) {
        throw new Error('Remote audio track never arrived');
      }

      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.muted = true;
      }

      const audioCtx = new AudioContext();
      // Near-side: always raw mic (before Iris)
      const nearSource = audioCtx.createMediaStreamSource(localStream);
      // Far-side: after audio processor + WebRTC encode/decode
      const farSource = audioCtx.createMediaStreamSource(remoteStream);
      const nearAnalyser = audioCtx.createAnalyser();
      const farAnalyser = audioCtx.createAnalyser();
      nearAnalyser.fftSize = 2048;
      farAnalyser.fftSize = 2048;
      nearAnalyser.smoothingTimeConstant = 0.8;
      farAnalyser.smoothingTimeConstant = 0.8;
      nearSource.connect(nearAnalyser);
      farSource.connect(farAnalyser);

      await audioCtx.resume();

      sessionRef.current = {
        localStream,
        pcLocal,
        pcRemote,
        audioCtx,
        nearSource,
        farSource,
        nearAnalyser,
        farAnalyser,
        nearHistory: [],
        farHistory: [],
        noiseNodes: [],
        baselineFarDb: null,
      };

      setRunning(true);
      const micLabel = mics.find((m) => m.deviceId === selectedMic)?.label || 'default mic';
      setStatus(`Live via WebRTC loopback using "${micLabel}". Audio Processor: ${audioProcessor ? 'active' : 'inactive'}.`);
      setChallengeStatus('Loopback is live. Calibrate quiet, then run a noise challenge.');
      pushLog(`Started loopback on ${micLabel}`);
      rafRef.current = requestAnimationFrame(tick);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setStatus(`Failed to start: ${message}`);
      stopSession();
    }
  }

  function stopNoise() {
    const s = sessionRef.current;
    for (const node of s.noiseNodes) {
      try {
        (node as AudioBufferSourceNode).stop?.();
        node.disconnect?.();
      } catch { /* ignore */ }
    }
    s.noiseNodes = [];
  }

  function stopSession() {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    stopNoise();

    const s = sessionRef.current;
    s.localStream?.getTracks().forEach((t) => t.stop());
    s.pcLocal?.close();
    s.pcRemote?.close();
    s.nearSource?.disconnect();
    s.farSource?.disconnect();
    s.audioCtx?.close().catch(() => {});

    sessionRef.current = {
      localStream: null,
      pcLocal: null,
      pcRemote: null,
      audioCtx: null,
      nearAnalyser: null,
      farAnalyser: null,
      nearSource: null,
      farSource: null,
      nearHistory: [],
      farHistory: [],
      noiseNodes: [],
      baselineFarDb: null,
    };

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    setRunning(false);
    setNearRms('— dBFS');
    setNearPeak('— dBFS');
    setNearFloor('— dBFS');
    setFarRms('— dBFS');
    setFarPeak('— dBFS');
    setFarFloor('— dBFS');
    setStatus('Stopped.');
  }

  async function playNoise(durationMs?: number) {
    const s = sessionRef.current;
    if (!s.audioCtx) return;
    await s.audioCtx.resume();
    stopNoise();

    const buffer = createNoiseBuffer(s.audioCtx, noiseType, 2);
    const source = s.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = s.audioCtx.createBiquadFilter();
    if (noiseType === 'hvac' || noiseType === 'traffic') {
      filter.type = 'lowpass';
      filter.frequency.value = noiseType === 'traffic' ? 400 : 800;
    } else if (noiseType === 'keyboard') {
      filter.type = 'highpass';
      filter.frequency.value = 1200;
    } else {
      filter.type = 'peaking';
      filter.frequency.value = 1000;
      filter.gain.value = 0;
    }

    const gain = s.audioCtx.createGain();
    gain.gain.value = noiseGain;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(s.audioCtx.destination);

    source.start();
    s.noiseNodes = [source, filter, gain];

    if (durationMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
      stopNoise();
    }
  }

  async function calibrateQuiet() {
    const s = sessionRef.current;
    if (!s.farAnalyser) return;
    stopNoise();
    setGradeInfo(null);
    setChallengeStatus(`Stay quiet for ${(CALIBRATE_MS / 1000).toFixed(0)}s…`);

    await new Promise((r) => setTimeout(r, CALIBRATE_MS));
    const baseline = averageHistory(s.farHistory, CALIBRATE_MS);
    s.baselineFarDb = baseline;
    setBaselineValue(formatDb(baseline));
    setChallengeValue('—');
    setLeakValue('—');
    setSuppressionValue('—');
    setChallengeStatus(`Quiet baseline locked at ${formatDb(baseline)}. Run the challenge next.`);
    pushLog(`Calibrated quiet baseline (far): ${formatDb(baseline)}`);
  }

  async function runChallenge() {
    const s = sessionRef.current;
    if (!s.farAnalyser) return;
    if (s.baselineFarDb == null) {
      setChallengeStatus('Calibrate a quiet baseline first.');
      return;
    }

    setGradeInfo(null);
    setChallengeStatus(`Playing ${noiseType} for ${(CHALLENGE_MS / 1000).toFixed(0)}s — keep silent.`);

    const nearBefore = averageHistory(s.nearHistory, 500);
    await playNoise(CHALLENGE_MS);
    const farDuring = averageHistory(s.farHistory, CHALLENGE_MS);
    const nearDuring = averageHistory(s.nearHistory, CHALLENGE_MS);

    const leak = farDuring - s.baselineFarDb;
    const nearRise = nearDuring - nearBefore;
    const suppression =
      nearRise > 1 ? Math.max(0, Math.min(100, (1 - Math.max(0, leak) / nearRise) * 100)) : null;

    setChallengeValue(formatDb(farDuring));
    setLeakValue(`${leak >= 0 ? '+' : ''}${leak.toFixed(1)} dB`);
    setSuppressionValue(suppression == null ? 'n/a (weak near rise)' : `${suppression.toFixed(0)}%`);

    let grade = 'Significant leak';
    let gradeColor = '#dc2626'; // red
    if (leak < 3) { grade = 'Excellent suppression'; gradeColor = '#10b981'; } // green
    else if (leak < 8) { grade = 'Good suppression'; gradeColor = '#22c55e'; } // light green
    else if (leak < 15) { grade = 'Partial leak'; gradeColor = '#f59e0b'; } // amber

    setGradeInfo({ text: grade, color: gradeColor });
    setChallengeStatus(`Far residual ${formatDb(farDuring)} (${leak >= 0 ? '+' : ''}${leak.toFixed(1)} dB over baseline).`);
    pushLog(`Challenge ${noiseType}: far ${formatDb(farDuring)}, leak ${leak.toFixed(1)} dB, near rise ${nearRise.toFixed(1)} dB${suppression == null ? '' : `, ~${suppression.toFixed(0)}% suppressed`}`);
  }

  return (
    <Card className="noise-tester">
      <h2 className="gux-heading-lg-semibold collapsible-header" onClick={() => setCollapsed(!collapsed)}>
        <span className={`collapse-arrow ${collapsed ? 'collapsed' : ''}`}>▼</span> Noise Tester
      </h2>
      {!collapsed && (<>
      <p className="status-text">{status}</p>

      <div className="controls-row">
        <label>
          <span>Microphone</span>
          <select value={selectedMic} onChange={(e) => setSelectedMic(e.target.value)} disabled={running}>
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>{m.label || `Mic ${m.deviceId.slice(0, 8)}`}</option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={browserEc} onChange={(e) => setBrowserEc(e.target.checked)} disabled={running} />
          <span> echoCancellation</span>
        </label>
        <label>
          <input type="checkbox" checked={browserNs} onChange={(e) => setBrowserNs(e.target.checked)} disabled={running} />
          <span > micNoiseSuppression</span>
        </label>
        <div className="audio-processor-status">
          <span className={`status-dot ${audioProcessor ? 'active' : 'inactive'}`} />
          <span>{audioProcessor ? 'Audio Processor Active' : 'Audio Processor Inactive'}</span>
        </div>
      </div>

      <div className="actions-row">
        <GuxButton accent="primary" onClick={startSession} disabled={running}>Start loopback</GuxButton>
        <GuxButton accent="secondary" onClick={() => { stopSession(); pushLog('Stopped loopback'); }} disabled={!running}>Stop</GuxButton>
      </div>

      <div className="noise-cancelled-banner">
        <span className="label">Noise Cancelled</span>
        <span className="value" style={{ color: cancelledColor }}>{noiseCancelled}</span>
        <span className="hint">Noise floor difference (near vs far) — ignores speech, shows true suppression</span>
        <canvas ref={cancelledGraphRef} width={640} height={100} className="cancelled-graph" />
      </div>

      <div className="meters-grid">
        <div className="meter-panel">
          <h4>Near-side (raw mic)</h4>
          <p className="hint">Before WebRTC encode — for A/B comparison</p>
          <div className="readout">
            <div><span className="label">RMS</span> {nearRms}</div>
            <div><span className="label">Peak</span> {nearPeak}</div>
            <div><span className="label">Floor</span> {nearFloor}</div>
          </div>
          <canvas ref={nearMeterRef} width={640} height={48} />
        </div>

        <div className="meter-panel">
          <h4>Far-side (after WebRTC)</h4>
          <p className="hint">What the other party hears after encode/decode</p>
          <div className="readout">
            <div><span className="label">RMS</span> {farRms}</div>
            <div><span className="label">Peak</span> {farPeak}</div>
            <div><span className="label">Floor</span> {farFloor}</div>
          </div>
          <canvas ref={farMeterRef} width={640} height={48} />
        </div>
      </div>

      <div className="challenge-section">
        <h2>Noise Challenge</h2>
        <div className="challenge-instructions">
          <p><strong>How to use:</strong></p>
          <ol>
            <li>Start the loopback above and wait for meters to be live</li>
            <li>Choose a noise type and level below</li>
            <li>Click <strong>"Calibrate quiet"</strong> — sit in silence for 4 seconds</li>
            <li>Click <strong>"Run challenge"</strong> — noise plays from your speakers for 6 seconds</li>
            <li>Read the results: lower leak delta = better suppression</li>
          </ol>
          <p><em>Tip: Use headphones so the played noise doesn't feed back into your mic unnaturally.</em></p>
        </div>
        <p className="challenge-status-text">
          {gradeInfo && <span style={{ color: gradeInfo.color, fontWeight: 700, marginRight: '0.5rem' }}>{gradeInfo.text}</span>}
          {challengeStatus}
        </p>

        <div className="controls-row">
          <label>
            <span>Source</span>
            <select value={noiseType} onChange={(e) => setNoiseType(e.target.value)}>
              <option value="pink">Pink noise (broadband)</option>
              <option value="hvac">HVAC hum</option>
              <option value="keyboard">Keyboard clicks</option>
              <option value="babble">Speech-like babble</option>
              <option value="traffic">Traffic rumble</option>
            </select>
          </label>
          <label>
            <span>Level: {noiseGain.toFixed(2)}</span>
            <input type="range" min={0.05} max={0.8} step={0.01} value={noiseGain} onChange={(e) => {
              const val = Number(e.target.value);
              setNoiseGain(val);
              const gain = sessionRef.current.noiseNodes.find((n) => n instanceof GainNode) as GainNode | undefined;
              if (gain) gain.gain.value = val;
            }} />
          </label>
        </div>

        <div className="challenge-actions-grid">
          <div className="challenge-buttons">
            <div className="actions-row">
              <GuxButton accent="secondary" onClick={calibrateQuiet} disabled={!running}>1. Calibrate quiet</GuxButton>
              <GuxButton accent="primary" onClick={runChallenge} disabled={!running}>2. Run challenge</GuxButton>
            </div>
            <div className="actions-row">
              <GuxButton accent="secondary" onClick={() => playNoise()} disabled={!running}>Play noise only</GuxButton>
              <GuxButton accent="secondary" onClick={stopNoise} disabled={!running}>Stop noise</GuxButton>
            </div>
          </div>
          <div className="status-stack">
            <div className="status-row">
              <span className={`status-dot ${audioProcessor ? 'active' : 'inactive'}`} />
              <span>Audio Processor: <strong style={{ color: audioProcessor ? '#10b981' : '#dc2626' }}>{audioProcessor ? 'true' : 'false'}</strong></span>
            </div>
            <div className="status-row">
              <span className={`status-dot ${browserEc ? 'active' : 'inactive'}`} />
              <span>echoCancellation: <strong style={{ color: browserEc ? '#10b981' : '#dc2626' }}>{browserEc ? 'true' : 'false'}</strong></span>
            </div>
            <div className="status-row">
              <span className={`status-dot ${browserNs ? 'active' : 'inactive'}`} />
              <span>micNoiseSuppression: <strong style={{ color: browserNs ? '#10b981' : '#dc2626' }}>{browserNs ? 'true' : 'false'}</strong></span>
            </div>
          </div>
        </div>

        <div className="results-grid">
          <div className="result-card">
            <span className="label">Quiet baseline (far)</span>
            <span className="value">{baselineValue}</span>
          </div>
          <div className="result-card">
            <span className="label">Challenge residual (far)</span>
            <span className="value">{challengeValue}</span>
          </div>
          <div className="result-card highlight">
            <span className="label">Leak delta</span>
            <span className="value">{leakValue}</span>
          </div>
          <div className="result-card">
            <span className="label">Suppression estimate</span>
            <span className="value">{suppressionValue}</span>
          </div>
        </div>
      </div>

      <div className="log-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4>Run log</h4>
          <GuxButton accent="secondary" onClick={() => setLogs([])}>Clear</GuxButton>
        </div>
        <ol className="log-list">
          {logs.map((log, i) => <li key={i}>{log}</li>)}
        </ol>
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline />
      </>)}
    </Card>
  );
}
