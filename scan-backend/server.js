
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const scanRoutes = require("./routes/scanRoutes");

// ==================================
// Create Express App
// ==================================

const app = express();

const PORT = process.env.PORT || 5001;

// ==================================
// Middleware
// ==================================

app.use(cors());
app.use(express.json());

// ==================================
// Root Route
// ==================================

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "TraceMySelf Scan Backend is running"
    });
});

// ==================================
// Test API
// ==================================

app.get("/api/test", (req, res) => {
    res.json({
        success: true,
        message: "Scan backend API is working"
    });
});

// ==================================
// Scan Routes
// ==================================

app.use("/api", scanRoutes);

// ==================================
// 404 Route
// ==================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found"
    });
});

// ==================================
// Start Server
// ==================================

app.listen(PORT, () => {
    console.log(
        `TraceMySelf Scan Backend running on http://localhost:${PORT}`
    );
});
