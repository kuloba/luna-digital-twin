import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { twin } from "./sim/store";

// Handy for scripted walkthroughs and screenshots: window.twin().select("V2", { fly: true })
(window as unknown as { twin: typeof twin }).twin = twin;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
