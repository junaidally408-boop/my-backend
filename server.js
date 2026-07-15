require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ============================
//  MONGODB CONNECTION
// ============================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ MongoDB Error:', err));

// ============================
//  MODELS (Schemas)
// ============================

// User Model
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  role: { type: String, enum: ['admin', 'coadmin', 'user', 'client'], default: 'user' },
  clientId: { type: String, default: null },
  status: { type: String, enum: ['invited', 'active'], default: 'invited' },
  inviteToken: { type: String },
  tokenExpiry: { type: Date },
  phone: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
const User = mongoose.model('User', UserSchema);

// Client Model
const ClientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  purchased: { type: Number, default: 0 },
  consumed: { type: Number, default: 0 },
  referrals: { type: Number, default: 0 },
  history: { type: [Number], default: [0,0,0,0,0,0] },
  createdBy: { type: String, required: true }
});
const Client = mongoose.model('Client', ClientSchema);

// Task Model
const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  status: { type: String, default: 'todo' },
  priority: { type: String, default: 'medium' },
  clientId: { type: String, required: true },
  assignedTo: { type: [String], default: [] },
  dueDate: { type: String, default: '' },
  tags: { type: [String], default: [] },
  createdBy: { type: String, required: true },
  createdByName: { type: String, default: 'Admin' },
  createdAt: { type: String, default: () => new Date().toISOString().slice(0,10) },
  timeSpent: { type: Number, default: 0 },
  timerRunning: { type: Boolean, default: false },
  timerStart: { type: Number, default: null },
  timeEntries: { type: Array, default: [] },
  subtasks: { type: Array, default: [] },
  comments: { type: Array, default: [] }
});
const Task = mongoose.model('Task', TaskSchema);

// ============================
//  RESEND SETUP
// ============================
const resend = new Resend(process.env.RESEND_API_KEY);
// 🔥 FIX: Frontend URL updated to Vercel
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://my-frontend-4j5ffw90z-virtual-ally.vercel.app';

// ============================
//  AUTH ROUTES
// ============================

app.get('/health', (req, res) => res.json({ status: 'OK' }));

app.post('/api/invite', async (req, res) => {
  try {
    const { name, email, role, clientId } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
    let user = await User.findOne({ email });
    if (user && user.status === 'active') return res.status(400).json({ error: 'User already active.' });
    const token = require('crypto').randomBytes(32).toString('hex');
    const expiry = new Date(); expiry.setHours(expiry.getHours() + 72);
    if (user) {
      user.name = name; user.role = role || 'user'; user.clientId = clientId || null;
      user.inviteToken = token; user.tokenExpiry = expiry; user.status = 'invited';
      await user.save();
    } else {
      const newUser = new User({ name, email, role: role || 'user', clientId: clientId || null, inviteToken: token, tokenExpiry: expiry, status: 'invited' });
      await newUser.save();
    }
    const link = `${FRONTEND_URL}/?token=${token}&email=${encodeURIComponent(email)}`;

    // ===== BEAUTIFUL & PROFESSIONAL EMAIL =====
    await resend.emails.send({
      from: 'Virtual Ally <noreply@invite.virtualally.email>',
      to: email,
      subject: `You're invited to join Virtual Ally, ${name}!`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invitation</title>
          </head>
          <body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f7fb; margin: 0; padding: 0; -webkit-font-smoothing: antialiased;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f7fb; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden; padding: 40px 30px;">
                    <tr>
                      <td align="center" style="padding-bottom: 20px;">
                        <!-- Logo -->
                        <img src="https://vibe.filesafe.space/1781548817483658086/attachments/4f7e2bb5-46d6-459e-8104-44ee1ccee4c0.webp" alt="Virtual Ally" width="80" style="display: block; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                      </td>
                    </tr>
                    <tr>
                      <td style="text-align: center; padding-bottom: 8px;">
                        <h1 style="font-size: 26px; font-weight: 800; color: #1A2A4A; margin: 0 0 4px 0; letter-spacing: -0.5px;">Welcome to Virtual Ally! 🎉</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="text-align: center; padding-bottom: 24px;">
                        <p style="font-size: 16px; color: #6B7A8E; margin: 0;">You've been invited to join as a <strong style="color: #1A2A4A; font-weight: 700;">${role}</strong>.</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0 30px 0; border-top: 1px solid #eaeef3; border-bottom: 1px solid #eaeef3;">
                        <table width="100%" style="padding: 10px 0;">
                          <tr>
                            <td style="padding: 6px 0; font-size: 14px; color: #4B5A6B;"><span style="font-weight: 600; width: 100px; display: inline-block;">👤 Name:</span> ${name}</td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0; font-size: 14px; color: #4B5A6B;"><span style="font-weight: 600; width: 100px; display: inline-block;">📧 Email:</span> ${email}</td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0; font-size: 14px; color: #4B5A6B;"><span style="font-weight: 600; width: 100px; display: inline-block;">🔑 Role:</span> ${role}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="text-align: center; padding: 30px 0 20px 0;">
                        <a href="${link}" style="display: inline-block; background: #1A2A4A; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 10px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(26, 42, 74, 0.15);">Accept Invitation →</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="text-align: center; padding-bottom: 16px;">
                        <p style="font-size: 12px; color: #9CA3AF; margin: 0;">This link will expire in <strong>72 hours</strong> for security reasons.</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="text-align: center; padding-top: 16px; border-top: 1px solid #f0f2f5;">
                        <p style="font-size: 12px; color: #b0b8c4; margin: 0;">If you didn't request this, please ignore this email.</p>
                        <p style="font-size: 12px; color: #b0b8c4; margin: 8px 0 0 0;">© 2026 Virtual Ally. All rights reserved.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `
    });

    res.json({ message: 'Invitation sent successfully!' });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: error.message });
  }
});

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
    res.json({ message: 'Account activated!', token: jwtToken, user: { id: user._id, name: user.name, email: user.email, role: user.role, clientId: user.clientId } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await User.findOne({ email, status: 'active' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful', token, user: { id: user._id, name: user.name, email: user.email, role: user.role, clientId: user.clientId } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================
//  DATA ROUTES
// ============================

// Get Team
app.get('/api/team', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const users = await User.find({}).select('-password -inviteToken -tokenExpiry');
    if (decoded.role !== 'admin') {
      return res.json(users.filter(u => u.email === decoded.email));
    }
    res.json(users);
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Get Clients
app.get('/api/clients', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let clients;
    if (decoded.role === 'admin' || decoded.role === 'coadmin') {
      clients = await Client.find({});
    } else if (decoded.role === 'client') {
      const user = await User.findOne({ email: decoded.email });
      clients = await Client.find({ _id: user.clientId });
    } else {
      clients = await Client.find({ createdBy: decoded.email });
    }
    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add Client
app.post('/api/clients', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin' && decoded.role !== 'coadmin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { name, email, purchased } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const client = new Client({
      name,
      email: email || '',
      purchased: purchased || 0,
      consumed: 0,
      referrals: 0,
      history: [0,0,0,0,0,0],
      createdBy: decoded.email
    });
    await client.save();
    res.status(201).json(client);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Client
app.put('/api/clients/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin' && decoded.role !== 'coadmin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const { name, email, purchased, consumed, referrals, history } = req.body;
    if (name) client.name = name;
    if (email !== undefined) client.email = email;
    if (purchased !== undefined) client.purchased = purchased;
    if (consumed !== undefined) client.consumed = consumed;
    if (referrals !== undefined) client.referrals = referrals;
    if (history) client.history = history;
    await client.save();
    res.json(client);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Client
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    await Client.findByIdAndDelete(req.params.id);
    res.json({ message: 'Client deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let tasks;
    if (decoded.role === 'admin' || decoded.role === 'coadmin') {
      tasks = await Task.find({});
    } else if (decoded.role === 'client') {
      const user = await User.findOne({ email: decoded.email });
      tasks = await Task.find({ clientId: user.clientId });
    } else {
      tasks = await Task.find({ assignedTo: decoded.email });
    }
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add Task
app.post('/api/tasks', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { title, description, status, priority, clientId, assignedTo, dueDate, tags } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const task = new Task({
      title,
      description: description || '',
      status: status || 'todo',
      priority: priority || 'medium',
      clientId,
      assignedTo: assignedTo || [],
      dueDate: dueDate || '',
      tags: tags || [],
      createdBy: decoded.email,
      createdByName: decoded.email.split('@')[0],
      createdAt: new Date().toISOString().slice(0,10)
    });
    await task.save();
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Task
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const allowed = ['title','description','status','priority','clientId','assignedTo','dueDate','tags','timeSpent','timeEntries','subtasks','comments','timerRunning','timerStart'];
    allowed.forEach(key => {
      if (req.body[key] !== undefined) task[key] = req.body[key];
    });
    await task.save();
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Profile
app.put('/api/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ email: decoded.email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { name, phone, avatar } = req.body;
    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;
    await user.save();
    res.json({ message: 'Profile updated', user: { name: user.name, email: user.email, phone: user.phone, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create Admin (Emergency)
app.post('/api/create-admin', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    let user = await User.findOne({ email });
    if (user) {
      user.password = password;
      user.role = 'admin';
      user.status = 'active';
      await user.save();
      return res.json({ message: 'Admin updated', email });
    }
    const newUser = new User({ name: name || 'Admin', email, password, role: 'admin', status: 'active' });
    await newUser.save();
    res.json({ message: 'Admin created', email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================
//  DELETE USER (Admin Only)
// ============================
app.delete('/api/users/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin only.' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.email === decoded.email) {
      return res.status(400).json({ error: 'You cannot delete yourself.' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================
//  START SERVER
// ============================
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
