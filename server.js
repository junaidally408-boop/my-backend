require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ MongoDB Error:', err));

// Resend Setup (Email)
const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://peppy-buttercream-008e87.netlify.app';
// ============================
//  CREATE ADMIN (Direct Setup)
// ============================
app.post('/api/create-admin', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'User already exists. Try logging in.' });
    }

    // Create new user (password will be hashed by pre-save hook)
    const user = new User({
      name: name || 'Admin',
      email,
      password,  // pre-save hook will hash this
      role: 'admin',
      status: 'active'
    });
    await user.save();

    res.status(201).json({ 
      message: '✅ Admin user created successfully!', 
      email: user.email,
      role: user.role
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});
// ============================
//  HEALTH CHECK (cron-job)
// ============================
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is awake!' });
});

// ============================
//  INVITE API
// ============================
app.post('/api/invite', async (req, res) => {
  try {
    const { name, email, role, clientId } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

    let user = await User.findOne({ email });
    if (user && user.status === 'active') {
      return res.status(400).json({ error: 'User already active. Try logging in.' });
    }

    const token = require('crypto').randomBytes(32).toString('hex');
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 72); // 72 hours valid

    if (user) {
      user.name = name; user.role = role || 'user'; user.clientId = clientId || null;
      user.inviteToken = token; user.tokenExpiry = expiry; user.status = 'invited';
      await user.save();
    } else {
      const newUser = new User({
        name, email, role: role || 'user', clientId: clientId || null,
        inviteToken: token, tokenExpiry: expiry, status: 'invited'
      });
      await newUser.save();
    }

    // Send Email
    const link = `${FRONTEND_URL}/?token=${token}&email=${encodeURIComponent(email)}`;
    await resend.emails.send({
      from: 'Virtual Ally <onboarding@resend.dev>', // Resend ki default hai
      to: email,
      subject: 'You are invited to Virtual Ally!',
      html: `<h2>Welcome, ${name}!</h2>
             <p>You have been invited to join <b>Virtual Ally</b> as a <b>${role}</b>.</p>
             <p>Click the link below to set your password and activate your account:</p>
             <a href="${link}" style="padding:10px 20px;background:#1A2A4A;color:#fff;border-radius:8px;text-decoration:none;">Join Now</a>
             <p>This link expires in 72 hours.</p>`
    });

    res.status(200).json({ message: 'Invitation sent successfully!' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to send invitation', details: error.message });
  }
});

// ============================
//  VERIFY TOKEN
// ============================
app.post('/api/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    const user = await User.findOne({ inviteToken: token, status: 'invited' });
    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });
    if (user.tokenExpiry < new Date()) return res.status(400).json({ error: 'Token expired' });
    res.status(200).json({ email: user.email, name: user.name });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================
//  SET PASSWORD (Activate)
// ============================
app.post('/api/set-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const user = await User.findOne({ inviteToken: token, status: 'invited' });
    if (!user) return res.status(400).json({ error: 'Invalid token' });
    if (user.tokenExpiry < new Date()) return res.status(400).json({ error: 'Token expired' });

    user.password = password;
    user.status = 'active';
    user.inviteToken = undefined;
    user.tokenExpiry = undefined;
    await user.save();

    const jwtToken = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(200).json({ 
      message: 'Account activated!', 
      token: jwtToken,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, clientId: user.clientId }
    });

  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================
//  LOGIN
// ============================
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await User.findOne({ email, status: 'active' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials or account not activated' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(200).json({ 
      message: 'Login successful', 
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, clientId: user.clientId }
    });

  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================
//  GET CURRENT USER
// ============================
app.get('/api/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -inviteToken -tokenExpiry');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
