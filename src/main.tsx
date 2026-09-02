import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import App from "./App";
import "./index.css";

// Point the editor at the locally bundled monaco-editor instead of its default
// jsdelivr CDN fetch — required by our CSP (script-src 'self') and the app's
// "no background network calls" privacy promise.
loader.config({ monaco });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
