import "./index.css";
import { initializeReceiver } from "./receiver";

try {
  initializeReceiver();
} catch (err) {
  console.error("[Main] Receiver initialization failed:", err);
}
// Wait for fonts and images to load before displaying the receiver
window.addEventListener('load', () => {
  // Wait for fonts and images to load
  document.fonts.ready.then(() => {
      document.body.classList.add('ready');
  });
});