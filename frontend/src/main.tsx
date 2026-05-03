import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import "./index.css";

// HashRouter — URLs look like /#/caption. Required for GitHub Pages because
// GitHub serves a static 404 for any path past the repo subdir; HashRouter
// keeps everything past # client-side, so deep links + refreshes work.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
