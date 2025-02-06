import { GuxButton } from 'genesys-spark-components-react';
import { useRef, useEffect, useState } from 'react';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import Card from './Card';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';

export default function Video() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const { startMedia, startVideoConference } = useSdk();
  const sdk = useSelector((state) => state.sdk.sdk);
  const [prejoin, setPrejoin] = useState(false);
  const [processedStream, setProcessedStream] = useState(null);

  useEffect(() => {
    if (!sdk) return;

    sdk.on('sessionStarted', async (session) => {
      if (session.sessionType === 'collaborateVideo' && processedStream) {
        console.log('Joining conference with processed video stream...');
        sdk.acceptSession({
          conversationId: session.conversationId,
          videoElement: videoRef.current.srcObject,
          audioElement: document.createElement('audio'),
          mediaStream: processedStream, // Ensure processed video is sent
        });
      }
    });
  }, [processedStream, sdk]);

  async function startVideo() {
    console.warn('start!');
    const stream = await startMedia();
    console.warn('here is the stream: ', stream);

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }

    processVideo();
  }

  function processVideo() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const bgImage = new Image();
    bgImage.src = '/IMG_BLACK.jpg';
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    const segmentation = new SelfieSegmentation({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
    });

    segmentation.setOptions({
      modelSelection: 1, // Higher accuracy,
      selfieMode: true
    });

    segmentation.onResults((results) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Draw the video feed first (full frame)
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      // 2️. Apply the mask to keep only the subject
      ctx.globalCompositeOperation = 'destination-in';
      ctx.filter = 'blur(4px)';  // Softens mask edges
      ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none'; // Reset filter

      // 3️. Reset composition mode and draw the background behind the subject
      ctx.globalCompositeOperation = 'destination-over';

      // Draw the image background
      ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    });

    async function detect() {
      if (!video.paused && !video.ended) {
        await segmentation.send({ image: video });
      }
      requestAnimationFrame(detect);
    }

    video.onloadeddata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      detect();

      setProcessedStream(canvas.captureStream(30));
      setPrejoin(true);
      console.warn('processedStream: ', processedStream);
    };
  }


  const startVideoConferenceBtn = () => {
    if (prejoin) {
      return <GuxButton onClick={startVideoConference}>Start Conference</GuxButton>
    }
    return;
  }

  return (
    <Card>
      <h3>Video</h3>
      <GuxButton accent="primary" onClick={startVideo}>Start Video</GuxButton>
      {startVideoConferenceBtn()}
      <audio ref={audioRef}></audio>
      <video ref={videoRef} autoPlay playsInline style={{ display: 'none' }}></video>
      <canvas ref={canvasRef}></canvas>
    </Card>
  );
}
