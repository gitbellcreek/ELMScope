/**
 * camera-feed.js
 * Manages the device rear-camera video stream used as the AR background.
 */

export async function startCameraFeed(videoElement) {
  const constraints = {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;
    await videoElement.play();
    return stream;
  } catch (err) {
    console.error("Camera access failed:", err);
    throw err;
  }
}

export function stopCameraFeed(videoElement) {
  if (videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach((t) => t.stop());
    videoElement.srcObject = null;
  }
}
