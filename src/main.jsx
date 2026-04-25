import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/base.css";
import "./styles/admin-dashboard.css";
import "./styles/admin-export.css";
import "./styles/admin-product-detail.css";
import "./styles/admin-shell.css";
import "./styles/login.css";
import "./styles/public-review-receive.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
