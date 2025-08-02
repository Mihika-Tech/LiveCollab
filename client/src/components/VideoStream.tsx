import { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';

interface VideoStreamProps {
  socket: Socket | null;
  roomId: string;
  userId: string;
  userName: string;
}

interface Broadcaster {
  id: string;
  name: string;
  socketId?: string;
}

function VideoStream({ socket, roomId, userId }: VideoStreamProps) {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [broadcaster, setBroadcaster] = useState<Broadcaster | null>(null);
  const [error, setError] = useState("");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  // WebRTC configuration - move outside to avoid dependency issues
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  const stopViewing = useCallback(() => {
    setBroadcaster(null);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    // Close all peer connections
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
  }, []);

  // Request video stream from broadcaster
  const requestVideoStream = useCallback((broadcasterSocketId: string) => {
    console.log("Requesting video stream from broadcaster");
    socket?.emit("requestOffer", { target: broadcasterSocketId });
  }, [socket]);

  // Handle offer request (broadcaster side)
  const handleOfferRequest = useCallback(async (data: { requester: string; requesterName: string }) => {
    if (!isBroadcasting || !localStreamRef.current) return;
    
    console.log("Creating video connection for:", data.requesterName);
    
    try {
      const peerConnection = new RTCPeerConnection(rtcConfig);
      peerConnectionsRef.current.set(data.requester, peerConnection);
      
      // Add local stream to peer connection
      localStreamRef.current.getTracks().forEach(track => {
        if (localStreamRef.current) {
          peerConnection.addTrack(track, localStreamRef.current);
        }
      });
      
      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket?.emit("ice-candidate", {
            target: data.requester,
            candidate: event.candidate
          });
        }
      };
      
      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      socket?.emit("sendOffer", {
        target: data.requester,
        offer: offer
      });
      
      console.log("Video connection established with:", data.requesterName);
    } catch (error) {
      console.error("Error creating video connection:", error);
    }
  }, [isBroadcasting, socket]);

  // Handle receiving offer (viewer side)
  const handleReceiveOffer = useCallback(async (data: { offer: RTCSessionDescriptionInit; sender: string; senderName: string }) => {
    if (isBroadcasting) return;
    
    console.log("Connecting to video stream from:", data.senderName);
    
    try {
      const peerConnection = new RTCPeerConnection(rtcConfig);
      peerConnectionsRef.current.set(data.sender, peerConnection);
      
      // Handle incoming stream
      peerConnection.ontrack = (event) => {
        console.log("Video stream connected");
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          remoteVideoRef.current.play().catch(console.error);
        }
      };
      
      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket?.emit("ice-candidate", {
            target: data.sender,
            candidate: event.candidate
          });
        }
      };
      
      await peerConnection.setRemoteDescription(data.offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      socket?.emit("sendAnswer", {
        target: data.sender,
        answer: answer
      });
    } catch (error) {
      console.error("Error connecting to video stream:", error);
    }
  }, [isBroadcasting, socket]);

  // Handle receiving answer (broadcaster side)
  const handleReceiveAnswer = useCallback(async (data: { answer: RTCSessionDescriptionInit; sender: string; senderName: string }) => {
    console.log("Received answer from:", data.senderName);
    
    const peerConnection = peerConnectionsRef.current.get(data.sender);
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(data.answer);
        console.log("Answer processed for:", data.senderName);
      } catch (error) {
        console.error("Error handling answer:", error);
      }
    }
  }, []);

  // Handle ICE candidates
  const handleIceCandidate = useCallback((data: { candidate: RTCIceCandidateInit; sender: string }) => {
    const peerConnection = peerConnectionsRef.current.get(data.sender);
    if (peerConnection) {
      peerConnection.addIceCandidate(data.candidate).catch(console.error);
    }
  }, []);

  const handleBroadcastStarted = useCallback((data: { broadcasterId: string; broadcasterName: string; broadcasterSocketId: string }) => {
    console.log("Broadcast started event received:", data);
    if (data.broadcasterId !== userId) {
      setBroadcaster({ 
        id: data.broadcasterId, 
        name: data.broadcasterName,
        socketId: data.broadcasterSocketId 
      });
      // Request video stream using the broadcaster's socket ID
      console.log("Requesting video from socket:", data.broadcasterSocketId);
      requestVideoStream(data.broadcasterSocketId);
    }
  }, [userId, requestVideoStream]);

  const handleBroadcastStopped = useCallback(() => {
    console.log("Broadcast stopped event received");
    setBroadcaster(null);
    stopViewing();
  }, [stopViewing]);

  useEffect(() => {
    if (!socket) return;

    // Listen for broadcast events
    socket.on("broadcastStarted", handleBroadcastStarted);
    socket.on("broadcastStopped", handleBroadcastStopped);

    // WebRTC signaling events
    socket.on("requestOffer", handleOfferRequest);
    socket.on("receiveOffer", handleReceiveOffer);
    socket.on("receiveAnswer", handleReceiveAnswer);
    socket.on("ice-candidate", handleIceCandidate);

    return () => {
      socket.off("broadcastStarted", handleBroadcastStarted);
      socket.off("broadcastStopped", handleBroadcastStopped);
      socket.off("requestOffer", handleOfferRequest);
      socket.off("receiveOffer", handleReceiveOffer);
      socket.off("receiveAnswer", handleReceiveAnswer);
      socket.off("ice-candidate", handleIceCandidate);
    };
  }, [socket, handleBroadcastStarted, handleBroadcastStopped, handleOfferRequest, handleReceiveOffer, handleReceiveAnswer, handleIceCandidate]);

  const startBroadcast = async () => {
    try {
      setIsLoading(true);
      setError("");
      console.log("Starting camera broadcast...");

      // Get user media (camera and microphone)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      console.log("Camera access granted for broadcast:", stream);
      
      // Store the stream in ref FIRST
      localStreamRef.current = stream;
      console.log("Stream stored in ref:", localStreamRef.current);
      
      // Set the stream to the video element
      if (localVideoRef.current) {
        console.log("Setting srcObject to video element...");
        localVideoRef.current.srcObject = stream;
        console.log("Video element srcObject set:", localVideoRef.current.srcObject);
        
        // Force video to play
        try {
          const playPromise = localVideoRef.current.play();
          if (playPromise !== undefined) {
            await playPromise;
            console.log("Video element is now playing");
          }
        } catch (playError) {
          console.log("Autoplay failed, but video should still work:", playError);
        }
        
        console.log("Video stream set to video element");
      } else {
        console.error("localVideoRef.current is null!");
      }

      // Set broadcasting state immediately (don't wait for metadata)
      setIsBroadcasting(true);
      console.log("Broadcasting state set to true");
      
      // Retry setting the video stream after render
      setTimeout(() => {
        console.log("Retry: Setting stream to video element...");
        if (localVideoRef.current && localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          localVideoRef.current.play().catch(e => console.log("Retry play failed:", e));
          console.log("Retry: Video stream set");
        } else {
          console.log("Retry failed - refs not available");
        }
      }, 100);
      
      // Notify server about broadcast start
      socket?.emit("startBroadcast", roomId);
      console.log("Broadcast notification sent to server");
      
    } catch (err) {
      console.error("Error starting broadcast:", err);
      setError(`Failed to access camera: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const startScreenShare = async () => {
    try {
      setIsLoading(true);
      setError("");
      console.log("Starting screen share...");

      // Get display media (screen sharing)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true // Include system audio
      });

      console.log("Screen access granted for broadcast:", stream);
      
      // Handle screen share ending (when user clicks "Stop sharing" in browser)
      stream.getVideoTracks()[0].onended = () => {
        console.log("Screen sharing ended by user");
        stopBroadcast();
      };
      
      // Store the stream in ref
      localStreamRef.current = stream;
      
      // Set the stream to the video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        
        try {
          const playPromise = localVideoRef.current.play();
          if (playPromise !== undefined) {
            await playPromise;
            console.log("Screen share video playing");
          }
        } catch (playError) {
          console.log("Screen share autoplay failed:", playError);
        }
      }

      // Update peer connections with new stream
      if (isBroadcasting) {
        updatePeerConnectionStreams(stream);
      }

      setIsBroadcasting(true);
      setIsScreenSharing(true);
      console.log("Screen sharing started");
      
      // Notify server about broadcast start if not already broadcasting
      if (!isBroadcasting) {
        socket?.emit("startBroadcast", roomId);
      }
      
    } catch (err) {
      console.error("Error starting screen share:", err);
      setError(`Failed to access screen: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const switchToCamera = async () => {
    if (!isBroadcasting) {
      startBroadcast();
      return;
    }

    try {
      setIsLoading(true);
      console.log("Switching to camera...");

      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      // Stop current screen sharing tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }

      // Update with camera stream
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(console.error);
      }

      // Update peer connections
      updatePeerConnectionStreams(stream);

      setIsScreenSharing(false);
      console.log("Switched to camera");
      
    } catch (err) {
      console.error("Error switching to camera:", err);
      setError(`Failed to switch to camera: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePeerConnectionStreams = (newStream: MediaStream) => {
    console.log("Updating peer connections with new stream");
    
    peerConnectionsRef.current.forEach((peerConnection) => {
      const senders = peerConnection.getSenders();
      
      newStream.getTracks().forEach(track => {
        const sender = senders.find(s => s.track && s.track.kind === track.kind);
        if (sender) {
          sender.replaceTrack(track).catch(console.error);
        } else {
          peerConnection.addTrack(track, newStream);
        }
      });
    });
  };

  const stopBroadcast = () => {
    console.log("Stopping broadcast...");
    
    // Close all peer connections
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log("Stopping track:", track.kind);
        track.stop();
      });
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    setIsBroadcasting(false);
    setIsScreenSharing(false);
    socket?.emit("stopBroadcast", roomId);
    console.log("Broadcast stopped and server notified");
  };

  // Effect to set video stream when broadcasting starts
  useEffect(() => {
    if (isBroadcasting && localStreamRef.current && localVideoRef.current) {
      console.log("useEffect: Setting video stream...");
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(e => console.log("useEffect play failed:", e));
    }
  }, [isBroadcasting]);

  // Debug logging
  useEffect(() => {
    console.log("Render - isBroadcasting:", isBroadcasting, "broadcaster:", broadcaster);
  }, [isBroadcasting, broadcaster]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="video-section">
      <div className="video-header">
        <h3>📹 Live Video</h3>
        {broadcaster && !isBroadcasting && (
          <span className="broadcaster-info">
            {broadcaster.name} is broadcasting
          </span>
        )}
        {isBroadcasting && (
          <span className="broadcaster-info">
            🔴 You are live {isScreenSharing ? '(Screen)' : '(Camera)'}
          </span>
        )}
      </div>

      {error && (
        <div className="error-message" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <div className="video-container">
        {/* Broadcaster's own video - using same style as camera test */}
        {isBroadcasting ? (
          <div className="local-video-wrapper" style={{ width: '100%', height: '100%' }}>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              onLoadedMetadata={() => console.log("Video metadata loaded")}
              onCanPlay={() => console.log("Video can play")}
              onPlaying={() => console.log("Video is playing")}
              onError={(e) => console.error("Video error:", e)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                backgroundColor: '#000000'
              }}
            />
            <div className="video-overlay">
              {isScreenSharing ? 'You (Screen Sharing)' : 'You (Broadcasting)'}
            </div>
          </div>
        ) : broadcaster && !isBroadcasting ? (
          <div className="remote-video-wrapper" style={{ width: '100%', height: '100%' }}>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                backgroundColor: '#000000'
              }}
            />
            <div className="video-overlay">{broadcaster.name}</div>
          </div>
        ) : (
          <div className="no-video">
            <div className="no-video-icon">📹</div>
            <p>No one is broadcasting</p>
            <p className="no-video-subtitle">Start broadcasting to share your video</p>
          </div>
        )}
      </div>

      <div className="video-controls">
        {!isBroadcasting && !broadcaster && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={startBroadcast}
              disabled={isLoading}
              className="form-button"
            >
              {isLoading ? "Starting..." : "Start Camera"}
            </button>
            <button
              onClick={startScreenShare}
              disabled={isLoading}
              className="form-button purple"
            >
              {isLoading ? "Starting..." : "Share Screen"}
            </button>
          </div>
        )}

        {isBroadcasting && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {!isScreenSharing && (
              <button
                onClick={startScreenShare}
                disabled={isLoading}
                className="form-button purple"
              >
                {isLoading ? "Switching..." : "Share Screen"}
              </button>
            )}
            
            {isScreenSharing && (
              <button
                onClick={switchToCamera}
                disabled={isLoading}
                className="form-button green"
              >
                {isLoading ? "Switching..." : "Switch to Camera"}
              </button>
            )}
            
            <button
              onClick={stopBroadcast}
              className="form-button red"
            >
              Stop Broadcasting
            </button>
          </div>
        )}

        {broadcaster && !isBroadcasting && (
          <div style={{ color: '#9ca3af', textAlign: 'center', fontSize: '14px' }}>
            {broadcaster.name} is currently broadcasting
          </div>
        )}
      </div>
    </div>
  );
}

export default VideoStream;