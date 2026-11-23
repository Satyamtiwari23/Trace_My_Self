const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const validator = require('validator');

const router = express.Router();

/* ============================================================
   USER MODEL
============================================================ */

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    passwordHash: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

const User = mongoose.models.User ||
    mongoose.model('User', userSchema);


/* ============================================================
   DATABASE CONNECTION
============================================================ */

async function connectDB() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing from .env');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log('MongoDB connected successfully.');
}


/* ============================================================
   CONFIGURATION
============================================================ */

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is missing from .env');
}

const COOKIE_NAME = 'tms_token';
const TOKEN_DURATION = 7 * 24 * 60 * 60 * 1000;

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_DURATION
};

function createToken(userId) {
    return jwt.sign(
        { userId: userId.toString() },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function setLoginCookie(res, userId) {
    res.cookie(COOKIE_NAME, createToken(userId), cookieOptions);
}

function publicUser(user) {
    return {
        id: user._id,
        name: user.name,
        email: user.email
    };
}


/* ============================================================
   AUTHENTICATION MIDDLEWARE
============================================================ */

async function requireAuth(req, res, next) {
    try {
        const token = req.cookies?.[COOKIE_NAME];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to continue.'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await User.findById(decoded.userId)
            .select('_id name email');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User account not found. Please log in again.'
            });
        }

        req.user = user;
        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Your login session has expired. Please log in again.'
        });
    }
}


/* ============================================================
   SIGNUP
============================================================ */

router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (
            typeof name !== 'string' ||
            typeof email !== 'string' ||
            typeof password !== 'string'
        ) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, email and password.'
            });
        }

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();

        if (cleanName.length < 2 || cleanName.length > 60) {
            return res.status(400).json({
                success: false,
                message: 'Name must contain 2 to 60 characters.'
            });
        }

        if (!validator.isEmail(cleanEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Enter a valid email address.'
            });
        }

        if (password.length < 8 || password.length > 72) {
            return res.status(400).json({
                success: false,
                message: 'Password must contain 8 to 72 characters.'
            });
        }

        const existingUser = await User.findOne({
            email: cleanEmail
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'An account with this email already exists.'
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const user = await User.create({
            name: cleanName,
            email: cleanEmail,
            passwordHash
        });

        setLoginCookie(res, user._id);

        res.status(201).json({
            success: true,
            message: 'Account created successfully.',
            user: publicUser(user)
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'An account with this email already exists.'
            });
        }

        console.error('Signup error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Unable to create your account.'
        });
    }
});


/* ============================================================
   LOGIN
============================================================ */

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== 'string' ||
            typeof password !== 'string'
        ) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required.'
            });
        }

        const cleanEmail = email.trim().toLowerCase();

        const user = await User.findOne({
            email: cleanEmail
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }

        setLoginCookie(res, user._id);

        res.json({
            success: true,
            message: 'Login successful.',
            user: publicUser(user)
        });

    } catch (error) {
        console.error('Login error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Unable to log in.'
        });
    }
});


/* ============================================================
   LOGOUT
============================================================ */

router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    });

    res.json({
        success: true,
        message: 'Logged out successfully.'
    });
});


/* ============================================================
   CURRENT LOGGED-IN USER
============================================================ */

router.get('/me', requireAuth, (req, res) => {
    res.json({
        success: true,
        user: publicUser(req.user)
    });
});


/* ============================================================
   FORGOT PASSWORD — EMAIL OTP
============================================================ */

const resetSessions = new Map();

const resetTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_APP_PASSWORD
    }
});

function hashResetOtp(otp) {
    return crypto
        .createHmac('sha256', JWT_SECRET)
        .update(otp)
        .digest('hex');
}

function safeCompare(a, b) {
    const first = Buffer.from(a, 'hex');
    const second = Buffer.from(b, 'hex');

    return first.length === second.length &&
        crypto.timingSafeEqual(first, second);
}


/* SEND RESET OTP */

router.post('/forgot-password/start', async (req, res) => {
    try {
        const { email } = req.body;

        if (
            typeof email !== 'string' ||
            !validator.isEmail(email.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: 'Enter a valid email address.'
            });
        }

        const cleanEmail = email.trim().toLowerCase();

        const genericMessage =
            'If an account exists with this email, a password reset OTP has been sent.';

        const user = await User.findOne({
            email: cleanEmail
        });

        // Do not reveal whether an email is registered.
        if (!user) {
            return res.json({
                success: true,
                message: genericMessage
            });
        }

        const otp = crypto.randomInt(100000, 1000000).toString();

        resetSessions.set(cleanEmail, {
            otpHash: hashResetOtp(otp),
            expiresAt: Date.now() + 10 * 60 * 1000,
            attempts: 0
        });

        await resetTransporter.sendMail({
            from: process.env.SMTP_USER,
            to: cleanEmail,
            subject: 'Trace_My_Self — Password Reset OTP',
            text:
                `Your password reset OTP is ${otp}.\n\n` +
                'This OTP expires in 10 minutes.\n' +
                'If you did not request this, ignore this email.'
        });

        res.json({
            success: true,
            message: genericMessage
        });

    } catch (error) {
        console.error('Password reset email error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Unable to send password reset email.'
        });
    }
});


/* VERIFY OTP AND SET NEW PASSWORD */

router.post('/forgot-password/reset', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (
            typeof email !== 'string' ||
            typeof otp !== 'string' ||
            typeof newPassword !== 'string'
        ) {
            return res.status(400).json({
                success: false,
                message: 'Email, OTP and new password are required.'
            });
        }

        const cleanEmail = email.trim().toLowerCase();

        if (!validator.isEmail(cleanEmail) || !/^\d{6}$/.test(otp)) {
            return res.status(400).json({
                success: false,
                message: 'Enter a valid email and six-digit OTP.'
            });
        }

        if (newPassword.length < 8 || newPassword.length > 72) {
            return res.status(400).json({
                success: false,
                message: 'New password must contain 8 to 72 characters.'
            });
        }

        const session = resetSessions.get(cleanEmail);

        if (!session || Date.now() > session.expiresAt) {
            resetSessions.delete(cleanEmail);

            return res.status(400).json({
                success: false,
                message: 'OTP expired. Request a new OTP.'
            });
        }

        if (session.attempts >= 5) {
            resetSessions.delete(cleanEmail);

            return res.status(429).json({
                success: false,
                message: 'Too many incorrect attempts. Request a new OTP.'
            });
        }

        session.attempts++;

        if (!safeCompare(hashResetOtp(otp), session.otpHash)) {
            return res.status(400).json({
                success: false,
                message: 'Incorrect OTP.'
            });
        }

        const user = await User.findOne({
            email: cleanEmail
        });

        if (!user) {
            resetSessions.delete(cleanEmail);

            return res.status(400).json({
                success: false,
                message: 'Unable to reset password for this account.'
            });
        }

        user.passwordHash = await bcrypt.hash(newPassword, 12);
        await user.save();

        resetSessions.delete(cleanEmail);

        res.json({
            success: true,
            message: 'Password reset successfully. Please log in.'
        });

    } catch (error) {
        console.error('Password reset error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Unable to reset password.'
        });
    }
});


/* CLEAN EXPIRED RESET SESSIONS */

setInterval(() => {
    for (const [email, session] of resetSessions.entries()) {
        if (Date.now() > session.expiresAt) {
            resetSessions.delete(email);
        }
    }
}, 60 * 1000).unref();


module.exports = {
    router,
    connectDB,
    requireAuth
};