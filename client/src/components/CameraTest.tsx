import { useRef, useState } from 'react';

function CameraTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      setError("");
      console.log("Requesting camera access...");
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      console.log("Camera access granted:", stream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError(`Camera error: ${err}`);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  };

  return (
    <div style={{ 
      padding: '20px', 
      backgroundColor: '#1f2937', 
      borderRadius: '8px',
      margin: '20px'
    }}>
      <h3 style={{ color: 'white', marginBottom: '16px' }}>Camera Test</h3>
      
      {error && (
        <div style={{ 
          backgroundColor: '#dc2626', 
          color: 'white', 
          padding: '12px', 
          borderRadius: '6px',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}
      
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: '100%',
          maxWidth: '400px',
          height: '300px',
          backgroundColor: '#000',
          borderRadius: '8px',
          marginBottom: '16px'
        }}
      />
      
      <div>
        {!isStreaming ? (
          <button
            onClick={startCamera}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '12px 24px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Test Camera
          </button>
        ) : (
          <button
            onClick={stopCamera}
            style={{
              backgroundColor: '#dc2626',
              color: 'white',
              padding: '12px 24px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Stop Camera
          </button>
        )}
      </div>
    </div>
  );
}

export default CameraTest;