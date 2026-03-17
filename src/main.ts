import "./index.css";
import { initializeReceiver } from "./receiver";

try {
  initializeReceiver();
} catch (err) {
  console.error("[Main] Receiver initialization failed:", err);
}
