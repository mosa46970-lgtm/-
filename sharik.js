require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");

process.on('uncaughtException', (err) => {
  console.error(' UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error(' UNHANDLED REJECTION:', reason);
});

const app = express();
// Port من متغيرات البيئة أو 3000 افتراضياً
const port = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : null;
const DEFAULT_CORS_ORIGINS = [
  "https://sharij-532a3.web.app",
  "https://sharij-532a3.firebaseapp.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
const effectiveCorsOrigins = CORS_ORIGINS || (isProduction ? DEFAULT_CORS_ORIGINS : ["*"]);
const mongoose = require("mongoose");
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: effectiveCorsOrigins,
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 10e6 // 10 MB
});
const whiteboardStates = new Map();
const whiteboardPersistTimers = new Map();
const codeEditorStates = new Map();
const codeEditorPersistTimers = new Map();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? null : "sharik_secret_key_2026_secure_dev_only");
if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET must be set in production");
  process.exit(1);
}

const MAX_CACHED_CHATS = Number(process.env.MAX_CACHED_CHATS || 200);
const MAX_NOTIFICATIONS = Number(process.env.MAX_NOTIFICATIONS || 100);
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "5mb";

app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
app.use(express.json({ limit: JSON_BODY_LIMIT }));

const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: effectiveCorsOrigins, credentials: true }));

// Native Gzip Compression Middleware (Zero-dependency response compression)
const zlib = require("zlib");
app.use((req, res, next) => {
  const ae = req.headers["accept-encoding"] || "";
  if (!ae.includes("gzip")) return next();
  const rawSend = res.send;
  res.send = function (body) {
    if (res.headersSent) return rawSend.call(res, body);
    if (body && (typeof body === "string" || Buffer.isBuffer(body)) && body.length > 1024) {
      zlib.gzip(body, (err, buf) => {
        if (!err && !res.headersSent) {
          res.setHeader("Content-Encoding", "gzip");
          res.setHeader("Vary", "Accept-Encoding");
          return rawSend.call(res, buf);
        }
        return rawSend.call(res, body);
      });
    } else {
      return rawSend.call(res, body);
    }
  };
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة، حاول لاحقاً" },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_API_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة، حاول لاحقاً" },
});
app.use("/api/login", authLimiter);
app.use("/api/register", authLimiter);
app.use("/api/forgot-password", authLimiter);
app.use("/api/reset-password", authLimiter);
app.use("/api/", apiLimiter);
app.use((req, res, next) => {
  req.traceId = genTraceId(req.headers["x-trace-id"]);
  res.setHeader("x-trace-id", req.traceId);
  const startedAt = Date.now();
  res.on("finish", () => {
    structuredLog("http.request", {
      traceId: req.traceId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latencyMs: Date.now() - startedAt,
    });
  });
  next();
});

const User = require("./modules/User");
const Message = require("./modules/Message");
const WhiteboardState = require("./modules/WhiteboardState");
const CodeEditorState = require("./modules/CodeEditorState");
const Article = require("./modules/myData");
const Report = require("./modules/Report");
const Match = require("./modules/Match");
const AuditLog = require("./modules/AuditLog");
const Session = require("./modules/Session");
const { hasVerifiedTeachSkill, isBidirectionalMatch, calcMatchScore, explainMatch } = require("./modules/matchingHelpers");
const {
  createSkillTestSession,
  gradeSkillTestSubmission,
  gradeSkillTestAnswer,
} = require("./modules/skillTestService");
const { getSkillsList } = require("./modules/skillQuestionBank");
const { computeGamification, pointsForNewReview } = require("./modules/gamification");
const { isEmailConfigured, sendMail } = require("./services/emailService");

const path = require("path");
// Serve frontend static files from /public seamlessly
app.use(express.static(path.join(__dirname, "../public")));
const objectStorage = require("./services/objectStorage");
const crypto = require("crypto");
const WHITEBOARD_SNAPSHOT_INTERVAL = 25;
const WHITEBOARD_MAX_ACTIONS = 140;
const WHITEBOARD_MAX_RECORDING_EVENTS = 5000;
const WHITEBOARD_LOCK_DURATION_MS = 10 * 60 * 1000;
const METRICS_LOG_INTERVAL_MS = 60000;
const REDIS_RETRY_ATTEMPTS = 5;
const EVENT_QUEUE_MAX = Number(process.env.EVENT_QUEUE_MAX || 400);
const eventQueues = new Map();
const whiteboardPendingApprovals = new Map();
const whiteboardLockTimers = new Map();
const metrics = {
  socketEvents: {},
  rateLimited: {},
  latency: {},
};

function structuredLog(event, payload = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...payload }));
}

function genTraceId(seed = "") {
  if (seed && typeof seed === "string" && seed.length >= 8) return seed.slice(0, 64);
  return crypto.randomUUID();
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str).replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function evictOldestMapEntry(map, maxSize) {
  if (map.size <= maxSize) return;
  const firstKey = map.keys().next().value;
  if (firstKey !== undefined) map.delete(firstKey);
}

function cleanupEventQueue(chatId) {
  const queue = eventQueues.get(chatId);
  if (queue && !queue.running && queue.items.length === 0) {
    eventQueues.delete(chatId);
  }
}

async function pushNotification(email, notification) {
  await User.findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    {
      $push: {
        notifications: {
          $each: [notification],
          $slice: -MAX_NOTIFICATIONS,
        },
      },
    }
  );
}

const ADMIN_ROLES = ["super_admin", "admin", "moderator", "support_agent"];
const ROLE_PERMISSIONS = {
  super_admin: ["*"],
  admin: ["dashboard:read", "users:read", "users:write", "skills:write", "exchanges:write", "reports:write", "notifications:write", "settings:write", "audit:read", "backup:write"],
  moderator: ["dashboard:read", "users:read", "skills:write", "exchanges:write", "reports:write", "notifications:write", "audit:read"],
  support_agent: ["dashboard:read", "users:read", "reports:write", "notifications:write"],
};

function getRolePermissions(role = "user") {
  return ROLE_PERMISSIONS[role] || [];
}

function hasPermission(role, permission) {
  const permissions = getRolePermissions(role);
  return permissions.includes("*") || permissions.includes(permission);
}

function isRestrictedAccount(user = {}) {
  if (!user) return true;
  if (user.status === "suspended") return true;
  if (user.status !== "banned") return false;
  if (!user.banUntil) return true;
  return new Date(user.banUntil).getTime() > Date.now();
}

async function clearExpiredRestriction(user) {
  if (user?.status === "banned" && user.banUntil && new Date(user.banUntil).getTime() <= Date.now()) {
    await User.updateOne(
      { _id: user._id },
      { status: "active", banUntil: null, banReason: "" }
    );
    return false;
  }
  return isRestrictedAccount(user);
}

async function writeAuditLog(req, action, target = {}, metadata = {}) {
  try {
    const actor = req.adminUser || {};
    await AuditLog.create({
      actorId: String(actor._id || req.userId || ""),
      actorEmail: actor.email || "",
      action,
      targetType: target.type || "",
      targetId: String(target.id || ""),
      targetEmail: target.email || "",
      metadata,
      ip: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });
  } catch (err) {
    structuredLog("audit.write_failed", { action, error: err.message });
  }
}

async function hasAcceptedMatch(emailA, emailB) {
  const [userA, userB] = Match.makePair(emailA, emailB);
  const match = await Match.findOne({ userA, userB, status: "accepted" }).lean();
  return Boolean(match);
}

async function canAccessChatRoom(emailA, emailB) {
  return hasAcceptedMatch(emailA, emailB);
}

function attachGamification(safeUser) {
  const g = computeGamification(safeUser);
  safeUser.gamifyPoints = g.points;
  safeUser.gamifyLevel = g.level;
  safeUser.gamifyHelped = g.helped;
  return safeUser;
}

function testEndpointGuard(req, res, next) {
  if (process.env.NODE_ENV === "production" && !process.env.ENABLE_TEST_ENDPOINTS) {
    return res.status(404).json({ error: "Not found" });
  }
  const expectedKey = process.env.TEST_API_KEY;
  if (expectedKey && req.headers["x-test-api-key"] !== expectedKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

function trackEvent(name) {
  metrics.socketEvents[name] = (metrics.socketEvents[name] || 0) + 1;
}

function trackRateLimited(name) {
  metrics.rateLimited[name] = (metrics.rateLimited[name] || 0) + 1;
}

function trackLatency(name, ms) {
  if (!metrics.latency[name]) metrics.latency[name] = { count: 0, totalMs: 0, maxMs: 0 };
  const bucket = metrics.latency[name];
  bucket.count += 1;
  bucket.totalMs += ms;
  bucket.maxMs = Math.max(bucket.maxMs, ms);
}

function enqueueChatTask(chatId, task) {
  if (!eventQueues.has(chatId)) eventQueues.set(chatId, { running: false, items: [] });
  const queue = eventQueues.get(chatId);
  if (queue.items.length >= EVENT_QUEUE_MAX) return false;
  queue.items.push(task);
  if (!queue.running) {
    queue.running = true;
    (async function run() {
      while (queue.items.length > 0) {
        const fn = queue.items.shift();
        try {
          await fn();
        } catch (err) {
          structuredLog("queue.task_failed", { chatId, error: err.message });
        }
      }
      queue.running = false;
      cleanupEventQueue(chatId);
    })();
  }
  return true;
}

function parseChatMembers(chatId) {
  if (!chatId || typeof chatId !== "string") return [];
  return chatId.split("_").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function canAccessChat(socket, chatId) {
  const members = parseChatMembers(chatId);
  return members.includes((socket.user?.email || "").toLowerCase());
}

function ensureJoined(socket, chatId) {
  return Boolean(socket.data.joinedChats && socket.data.joinedChats.has(chatId));
}

function isRateLimited(socket, key, limit, windowMs) {
  if (!socket.data.rl) socket.data.rl = {};
  const now = Date.now();
  const bucket = socket.data.rl[key] || [];
  const filtered = bucket.filter((ts) => now - ts < windowMs);
  filtered.push(now);
  socket.data.rl[key] = filtered;
  const blocked = filtered.length > limit;
  if (blocked) trackRateLimited(key);
  return blocked;
}

function sanitizeAction(action) {
  if (!action || typeof action !== "object") return null;
  if (action.type === "stroke") {
    const points = Array.isArray(action.points) ? action.points.slice(0, 1200) : [];
    return {
      id: String(action.id || `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`),
      type: "stroke",
      mode: action.mode === "erase" ? "erase" : "draw",
      color: typeof action.color === "string" ? action.color : "#2563eb",
      size: Math.max(1, Math.min(50, Number(action.size) || 4)),
      points: points
        .map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    };
  }
  if (action.type === "text") {
    return {
      id: String(action.id || `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`),
      type: "text",
      x: Number(action.x) || 0,
      y: Number(action.y) || 0,
      text: String(action.text || "").slice(0, 300),
      color: typeof action.color === "string" ? action.color : "#2563eb",
      size: Math.max(10, Math.min(80, Number(action.size) || 16)),
    };
  }
  return null;
}

function defaultPermission(canControl = false) {
  return {
    canDraw: true,
    canUseText: true,
    canUpload: true,
    canControl,
  };
}

function ensureSessionMeta(state = {}, chatId = "") {
  if (!state.sessionMeta || typeof state.sessionMeta !== "object") {
    state.sessionMeta = {
      teacher: "",
      learner: "",
      permissions: {},
      boardLocked: false,
      followMode: false,
      activeTemplate: "blank",
      recordingActive: false,
      recordingStartedAt: null,
      roleModeActive: false,
      lockExpiresAt: null,
    };
  }
  if (!state.sessionMeta.permissions || typeof state.sessionMeta.permissions !== "object") {
    state.sessionMeta.permissions = {};
  }
  if (!state.assets || !Array.isArray(state.assets)) state.assets = [];
  if (!state.recordingLog || !Array.isArray(state.recordingLog)) state.recordingLog = [];

  const members = parseChatMembers(chatId);
  if (members.length >= 2) {
    const [memberA, memberB] = members;
    if (!state.sessionMeta.permissions[memberA]) state.sessionMeta.permissions[memberA] = defaultPermission(false);
    if (!state.sessionMeta.permissions[memberB]) state.sessionMeta.permissions[memberB] = defaultPermission(false);
  }
  return state;
}

function normalizeSessionEmail(email = "") {
  return String(email || "").trim().toLowerCase();
}

function canControlSession(state, email) {
  const userEmail = normalizeSessionEmail(email);
  const teacher = normalizeSessionEmail(state?.sessionMeta?.teacher);
  if (teacher && teacher === userEmail) return true;
  return Boolean(state?.sessionMeta?.permissions?.[userEmail]?.canControl);
}

function canUserDraw(state, email) {
  const userEmail = normalizeSessionEmail(email);
  if (state?.sessionMeta?.boardLocked) {
    const teacher = normalizeSessionEmail(state?.sessionMeta?.teacher);
    return teacher && userEmail === teacher;
  }
  const permission = state?.sessionMeta?.permissions?.[userEmail];
  if (!permission) return true;
  return Boolean(permission.canDraw);
}

function getPeerEmail(chatId, email) {
  const members = parseChatMembers(chatId);
  const current = normalizeSessionEmail(email);
  return members.find((m) => m !== current) || "";
}

function getApprovalState(chatId) {
  if (!whiteboardPendingApprovals.has(chatId)) {
    whiteboardPendingApprovals.set(chatId, { role: null, lock: null });
  }
  return whiteboardPendingApprovals.get(chatId);
}

function clearLockTimer(chatId) {
  const timer = whiteboardLockTimers.get(chatId);
  if (timer) clearTimeout(timer);
  whiteboardLockTimers.delete(chatId);
}

function scheduleLockExpiry(chatId) {
  clearLockTimer(chatId);
  const timer = setTimeout(async () => {
    const state = await loadWhiteboardState(chatId);
    ensureSessionMeta(state, chatId);
    state.sessionMeta.boardLocked = false;
    state.sessionMeta.lockExpiresAt = null;
    state.sessionMeta.roleModeActive = false;
    state.sessionMeta.teacher = "";
    state.sessionMeta.learner = "";
    whiteboardStates.set(chatId, state);
    queueWhiteboardPersist(chatId);
    io.to(chatId).emit("whiteboardLockExpired", {
      chatId,
      sessionMeta: state.sessionMeta,
    });
    io.to(chatId).emit("whiteboardSession", {
      chatId,
      sessionMeta: state.sessionMeta,
    });
  }, WHITEBOARD_LOCK_DURATION_MS);
  whiteboardLockTimers.set(chatId, timer);
}

function appendRecordingEvent(state, eventName, sender, payload = {}) {
  ensureSessionMeta(state);
  const shouldRecord = state.sessionMeta.recordingActive || eventName.startsWith("recording:");
  if (!shouldRecord) return;
  state.recordingLog.push({
    ts: Date.now(),
    event: eventName,
    sender: normalizeSessionEmail(sender),
    payload,
  });
  if (state.recordingLog.length > WHITEBOARD_MAX_RECORDING_EVENTS) {
    state.recordingLog = state.recordingLog.slice(-WHITEBOARD_MAX_RECORDING_EVENTS);
  }
}

async function initRedisAdapterIfEnabled() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;
  for (let attempt = 1; attempt <= REDIS_RETRY_ATTEMPTS; attempt++) {
    try {
      const { createAdapter } = require("@socket.io/redis-adapter");
      const { createClient } = require("redis");
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      structuredLog("socket.redis_adapter_enabled", { redisUrl: "***", attempt });
      return;
    } catch (err) {
      structuredLog("socket.redis_adapter_failed", { error: err.message, attempt });
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  structuredLog("socket.redis_fallback_memory_adapter");
}

async function loadWhiteboardState(chatId) {
  if (!chatId) return { snapshot: null, actions: [], redoStack: [] };
  if (whiteboardStates.has(chatId)) return whiteboardStates.get(chatId);
  const doc = await WhiteboardState.findOne({ chatId });
  let snapshot = null;
  if (doc?.snapshot?.key) {
    if (objectStorage.isRemoteStorage) {
      snapshot = {
        mime: doc.snapshot.mime || "image/jpeg",
        signedUrl: await objectStorage.getSignedReadUrl(doc.snapshot.key),
        updatedAt: doc.snapshot.updatedAt || null,
      };
    } else {
      const dataUrl = await objectStorage.readDataUrl(doc.snapshot.key);
      if (dataUrl) {
        snapshot = {
          mime: doc.snapshot.mime || "image/jpeg",
          data: dataUrl,
          updatedAt: doc.snapshot.updatedAt || null,
        };
      }
    }
  }
  const state = doc
    ? {
      snapshot,
      actions: doc.actions || [],
      redoStack: doc.redoStack || [],
      sessionMeta: doc.sessionMeta || {},
      assets: doc.assets || [],
      recordingLog: doc.recordingLog || [],
    }
    : { snapshot: null, actions: [], redoStack: [], sessionMeta: {}, assets: [], recordingLog: [] };
  ensureSessionMeta(state, chatId);
  whiteboardStates.set(chatId, state);
  evictOldestMapEntry(whiteboardStates, MAX_CACHED_CHATS);
  return state;
}

function queueWhiteboardPersist(chatId) {
  if (!chatId) return;
  const existing = whiteboardPersistTimers.get(chatId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    const state = whiteboardStates.get(chatId) || { snapshot: null, actions: [], redoStack: [], sessionMeta: {}, assets: [], recordingLog: [] };
    ensureSessionMeta(state, chatId);
    try {
      let snapshotKey = "";
      if (state.snapshot?.data) {
        snapshotKey = await objectStorage.saveDataUrl(chatId, state.snapshot.data);
      }
      await WhiteboardState.findOneAndUpdate(
        { chatId },
        {
          chatId,
          lastActivity: new Date(),
          snapshot: state.snapshot
            ? {
              mime: state.snapshot.mime || "image/jpeg",
              key: snapshotKey,
              updatedAt: state.snapshot.updatedAt || new Date(),
            }
            : { mime: "", key: "", updatedAt: null },
          actions: state.actions,
          redoStack: state.redoStack,
          sessionMeta: state.sessionMeta,
          assets: state.assets,
          recordingLog: state.recordingLog,
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error("Whiteboard persist error:", err.message);
    } finally {
      whiteboardPersistTimers.delete(chatId);
    }
  }, 220);
  whiteboardPersistTimers.set(chatId, timer);
}

async function loadCodeEditorState(chatId) {
  if (!chatId) return { content: "// ابدأ الكتابة...\n", language: "javascript", revision: 0 };
  if (codeEditorStates.has(chatId)) return codeEditorStates.get(chatId);
  const doc = await CodeEditorState.findOne({ chatId });
  const state = doc
    ? { content: doc.content || "", language: doc.language || "javascript", revision: doc.revision || 0 }
    : { content: "// ابدأ الكتابة...\n", language: "javascript", revision: 0 };
  codeEditorStates.set(chatId, state);
  evictOldestMapEntry(codeEditorStates, MAX_CACHED_CHATS);
  return state;
}

function queueCodeEditorPersist(chatId) {
  if (!chatId) return;
  const existing = codeEditorPersistTimers.get(chatId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    const state = codeEditorStates.get(chatId);
    if (!state) return;
    try {
      await CodeEditorState.findOneAndUpdate(
        { chatId },
        {
          chatId,
          lastActivity: new Date(),
          content: state.content,
          language: state.language,
          revision: state.revision,
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error("CodeEditor persist error:", err.message);
    } finally {
      codeEditorPersistTimers.delete(chatId);
    }
  }, 1000);
  codeEditorPersistTimers.set(chatId, timer);
}

// ═══════════════════════════════════════════════
// Serve Static Frontend
// ═══════════════════════════════════════════════
app.use(express.static(path.join(__dirname, "../public")));

// ═══════════════════════════════════════════════
// JWT Auth Middleware
// ═══════════════════════════════════════════════
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "جلسة غير صالحة، سجل الدخول مرة أخرى" });
    }
    try {
      const user = await User.findById(decoded.id).select("status banUntil banReason").lean();
      if (!user) {
        return res.status(401).json({ error: "جلسة غير صالحة، سجل الدخول مرة أخرى" });
      }
      if (await clearExpiredRestriction(user)) {
        return res.status(403).json({
          error: user.status === "suspended" ? "تم إيقاف هذا الحساب" : "تم حظر هذا الحساب",
          reason: user.banReason || "",
          until: user.banUntil || null,
        });
      }
      req.userId = decoded.id;
      next();
    } catch {
      return res.status(500).json({ error: "خطأ في التحقق من الجلسة" });
    }
  });
}

function requireAdmin(permission = "dashboard:read") {
  return async (req, res, next) => {
    try {
      const admin = await User.findById(req.userId).select("-password");
      if (!admin || !ADMIN_ROLES.includes(admin.role) || !hasPermission(admin.role, permission)) {
        return res.status(403).json({ error: "غير مصرح لك بالوصول إلى لوحة الإدارة" });
      }
      if (await clearExpiredRestriction(admin)) {
        return res.status(403).json({ error: "الحساب الإداري موقوف أو محظور" });
      }
      req.adminUser = admin;
      next();
    } catch (err) {
      res.status(500).json({ error: "خطأ في التحقق من صلاحيات الإدارة" });
    }
  };
}

function ensureAdminCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const expected = req.headers["x-csrf-token"];
  const token = req.headers.authorization?.split(" ")[1] || "";
  const actual = crypto.createHash("sha256").update(`${token}:${JWT_SECRET}`).digest("hex");
  if (!expected || expected !== actual) {
    return res.status(403).json({ error: "رمز حماية CSRF غير صالح" });
  }
  next();
}



// ═══════════════════════════════════════════════
// 1) AUTH APIs - Register & Login
// ═══════════════════════════════════════════════
app.get("/api/health", async (req, res) => {
  const dbOk = mongoose.connection.readyState === 1;
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    db: dbOk ? "connected" : "disconnected",
    uptimeSec: Math.round(process.uptime()),
    ts: new Date().toISOString(),
  });
});

app.post("/api/register", async (req, res) => {
  try {
    const { username1, username2, email, password } = req.body;
    if (!username1 || !username2 || !email || !password) {
      return res.status(400).json({ error: "جميع الحقول مطلوبة" });
    }
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ error: "هذا البريد مسجل بالفعل" });
    }
    const role = email.toLowerCase().trim() === "sharik@gmail.com" ? "super_admin" : "user";
    const user = new User({
      username1: username1.trim(),
      username2: username2.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      role: role,
    });
    await user.save();
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    const safeUser = user.toSafeObject();
    safeUser.name = safeUser.username1 + " " + safeUser.username2;
    res.status(201).json({ token, user: safeUser });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "حدث خطأ في التسجيل" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "البريد وكلمة المرور مطلوبان" });
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }
    if (await clearExpiredRestriction(user)) {
      return res.status(403).json({
        error: user.status === "suspended" ? "تم إيقاف هذا الحساب. تواصل مع الدعم." : "تم حظر هذا الحساب. تواصل مع الدعم.",
        reason: user.banReason || "",
        until: user.banUntil || null,
      });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }
    if (user.email.toLowerCase().trim() === "sharik@gmail.com" && user.role !== "super_admin") {
      user.role = "super_admin";
    }
    user.lastLoginAt = new Date();
    if (ADMIN_ROLES.includes(user.role)) user.lastAdminLoginAt = new Date();
    await user.save();
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    const safeUser = user.toSafeObject();
    safeUser.name = safeUser.username1 + " " + safeUser.username2;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "حدث خطأ في تسجيل الدخول" });
  }
});

app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });
    const safeUser = attachGamification(user.toSafeObject());
    safeUser.name = safeUser.username1 + " " + safeUser.username2;
    res.json({ user: safeUser });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب البيانات" });
  }
});

// Update avatar (base64)
app.put("/api/me/avatar", authMiddleware, async (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar) return res.status(400).json({ error: "الصورة مطلوبة" });
    // Limit to ~2MB base64
    if (avatar.length > 2.8 * 1024 * 1024) {
      return res.status(413).json({ error: "حجم الصورة كبير جداً (الحد الأقصى 2MB)" });
    }
    const user = await User.findByIdAndUpdate(
      req.userId,
      { avatar },
      { new: true }
    );
    const safeUser = user.toSafeObject();
    safeUser.name = safeUser.username1 + " " + safeUser.username2;
    res.json({ user: safeUser });
  } catch (err) {
    res.status(500).json({ error: "خطأ في تحديث الصورة" });
  }
});

// ═══════════════════════════════════════════════
// 2) SKILLS APIs - Save skills
// ═══════════════════════════════════════════════
app.post("/api/skills", authMiddleware, async (req, res) => {
  try {
    const { learnSkills, teachSkills } = req.body;
    if (!learnSkills || !teachSkills || learnSkills.length === 0 || teachSkills.length === 0) {
      return res.status(400).json({ error: "يجب اختيار مهارة واحدة على الأقل من كل قسم" });
    }
    const user = await User.findByIdAndUpdate(
      req.userId,
      { learnSkills, teachSkills },
      { new: true }
    );
    const safeUser = user.toSafeObject();
    safeUser.name = safeUser.username1 + " " + safeUser.username2;
    res.json({ user: safeUser });
  } catch (err) {
    res.status(500).json({ error: "خطأ في حفظ المهارات" });
  }
});

// ═══════════════════════════════════════════════
// 3) SKILL TEST APIs
// ═══════════════════════════════════════════════
app.get("/api/skill-test/skills", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("teachSkills learnSkills").lean();
    const skills = new Set(getSkillsList());
    [...(user?.teachSkills || []), ...(user?.learnSkills || [])].forEach((s) => skills.add(s));
    res.json({ skills: [...skills] });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب المهارات" });
  }
});

app.post("/api/skill-test/start", authMiddleware, async (req, res) => {
  try {
    const { skill } = req.body;
    if (!skill || typeof skill !== "string") {
      return res.status(400).json({ error: "المهارة مطلوبة" });
    }
    const session = createSkillTestSession(JWT_SECRET, req.userId, skill);
    if (!session.ok) {
      return res.status(400).json({ error: session.error });
    }
    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطأ في بدء الاختبار" });
  }
});

app.post("/api/skill-test/check-answer", authMiddleware, async (req, res) => {
  try {
    const { sessionToken, questionIndex, answer, skill } = req.body;
    const checked = gradeSkillTestAnswer(JWT_SECRET, req.userId, {
      sessionToken,
      questionIndex,
      answer,
      skill,
    });
    if (!checked.ok) {
      return res.status(400).json({ error: checked.error });
    }
    return res.json({ correct: checked.correct });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطأ في فحص الإجابة" });
  }
});

app.post("/api/skill-test/submit", authMiddleware, async (req, res) => {
  try {
    const { sessionToken, answers, skill } = req.body;

    if (sessionToken && Array.isArray(answers)) {
      const graded = gradeSkillTestSubmission(JWT_SECRET, req.userId, {
        sessionToken,
        answers,
        skill,
      });
      if (!graded.ok) {
        return res.status(400).json({ error: graded.error });
      }

      const user = await User.findById(req.userId).select("verifiedSkills");
      if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });

      const { skill: gradedSkill, score, total, pct, passed } = graded;
      const update = {};
      update[`skillTestResults.${gradedSkill}`] = {
        pct,
        passed,
        date: new Date().toISOString(),
        score,
        total,
      };

      if (passed) {
        await User.findByIdAndUpdate(req.userId, {
          $set: update,
          $addToSet: { verifiedSkills: gradedSkill },
        });
      } else {
        await User.findByIdAndUpdate(req.userId, { $set: update });
      }

      const updatedUser = await User.findById(req.userId);
      const safeUser = attachGamification(updatedUser.toSafeObject());
      safeUser.name = safeUser.username1 + " " + safeUser.username2;
      return res.json({ user: safeUser, passed, score, total, pct });
    }

    return res.status(400).json({
      error: "يجب إرسال جلسة الاختبار والإجابات. أعد الاختبار من البداية.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطأ في حفظ نتيجة الاختبار" });
  }
});

// ═══════════════════════════════════════════════
// 4) MATCHING API
// ═══════════════════════════════════════════════
app.get("/api/matches", authMiddleware, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId)
      .select("email learnSkills teachSkills verifiedSkills status languages country")
      .lean();
    if (!currentUser || currentUser.status === "banned") {
      return res.json({ matches: [], requiresVerification: false });
    }

    const myVerified = currentUser.verifiedSkills || [];
    const teachSkillsNeedingTest = (currentUser.teachSkills || []).filter(
      (s) => !myVerified.includes(s)
    );

    if (!currentUser.learnSkills?.length || !currentUser.teachSkills?.length) {
      return res.json({
        matches: [],
        requiresVerification: false,
        reason: "missing_skills",
      });
    }

    if (!hasVerifiedTeachSkill(currentUser)) {
      return res.json({
        matches: [],
        requiresVerification: true,
        teachSkillsNeedingTest,
        reason: "needs_verification",
      });
    }

    const matchLimit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
    const allUsers = await User.find(
      {
        _id: { $ne: currentUser._id },
        learnSkills: { $in: currentUser.teachSkills },
        teachSkills: { $in: currentUser.learnSkills },
        verifiedSkills: { $exists: true, $ne: [] },
        status: { $ne: "banned" },
      },
      "email username1 username2 learnSkills teachSkills verifiedSkills bio avatar country languages reviews gamifyPoints gamifyLevel completedSessions isVerified"
    )
      .limit(matchLimit * 5)
      .lean();

    const matches = allUsers
      .filter(
        (user) =>
          isBidirectionalMatch(currentUser, user) && hasVerifiedTeachSkill(user)
      )
      .map((user) => {
        const safe = { ...user };
        delete safe.password;
        safe.name = safe.username1 + " " + safe.username2;
        safe.matchScore = calcMatchScore(currentUser, user);
        const explanation = explainMatch(currentUser, user);
        safe.compatibility = safe.matchScore;
        safe.theyTeachYou = explanation.theyTeachYou;
        safe.youTeachThem = explanation.youTeachThem;
        safe.sharedInterests = explanation.sharedInterests;
        safe.reasons = explanation.reasons;
        const reviews = user.reviews || [];
        safe.avgRating = reviews.length
          ? Math.round(
              (reviews.reduce((a, r) => a + (Number(r.rating) || 0), 0) / reviews.length) * 10
            ) / 10
          : 0;
        safe.reviewCount = reviews.length;
        delete safe.reviews;
        return safe;
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, matchLimit);

    res.json({
      matches,
      total: matches.length,
      limit: matchLimit,
      requiresVerification: false,
      reason: matches.length ? "ok" : "no_partners",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "خطأ في البحث عن شركاء" });
  }
});

// ═══════════════════════════════════════════════
// 5) CHAT APIs
// ═══════════════════════════════════════════════
app.get("/api/chat-access/:email", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId).select("email status").lean();
    if (!me) return res.status(404).json({ error: "مستخدم غير موجود" });
    if (me.status === "banned") {
      return res.status(403).json({ allowed: false, error: "حسابك محظور" });
    }

    const otherEmail = req.params.email?.toLowerCase().trim();
    if (!otherEmail || otherEmail === me.email) {
      return res.status(400).json({ allowed: false, error: "بريد غير صالح" });
    }

    const allowed = await canAccessChatRoom(me.email, otherEmail);
    if (!allowed) {
      return res.json({
        allowed: false,
        error: "يجب قبول طلب المطابقة قبل بدء المحادثة",
      });
    }

    const chatId = Match.buildChatId(me.email, otherEmail);
    res.json({ allowed: true, chatId });
  } catch (err) {
    res.status(500).json({ error: "خطأ في التحقق من صلاحية المحادثة" });
  }
});

app.get("/api/messages/:chatId", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId).select("email status").lean();
    if (!me) return res.status(404).json({ error: "مستخدم غير موجود" });
    if (me.status === "banned") return res.status(403).json({ error: "حسابك محظور" });

    const chatId = req.params.chatId;
    const members = parseChatMembers(chatId);
    const peerEmail = members.find((m) => m !== me.email.toLowerCase());
    if (!peerEmail || !members.includes(me.email.toLowerCase())) {
      return res.status(403).json({ error: "غير مسموح بالوصول لهذه المحادثة" });
    }
    if (!(await canAccessChatRoom(me.email, peerEmail))) {
      return res.status(403).json({ error: "يجب قبول طلب المطابقة قبل عرض الرسائل" });
    }

    const { before, limit } = req.query;
    const cappedLimit = Math.max(1, Math.min(Number(limit) || 40, 100));
    const filter = { chatId: req.params.chatId };
    if (before) {
      const beforeDate = new Date(before);
      if (!Number.isNaN(beforeDate.getTime())) {
        filter.createdAt = { $lt: beforeDate };
      }
    }
    const rows = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(cappedLimit + 1)
      .lean();
    const hasMore = rows.length > cappedLimit;
    const page = hasMore ? rows.slice(0, cappedLimit) : rows;
    const messages = page.reverse();
    const nextBefore = messages.length ? messages[0].createdAt : null;
    res.json({ messages, hasMore, nextBefore });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب الرسائل" });
  }
});

app.post("/api/messages", authMiddleware, async (req, res) => {
  try {
    const { chatId, receiver, text, attachments, messageId } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });
    if (user.status === "banned") return res.status(403).json({ error: "حسابك محظور" });
    if (!messageId || typeof messageId !== "string") {
      return res.status(400).json({ error: "messageId مطلوب" });
    }
    if (!chatId || !receiver) {
      return res.status(400).json({ error: "بيانات المحادثة ناقصة" });
    }
    if (!(await canAccessChatRoom(user.email, receiver))) {
      return res.status(403).json({ error: "يجب قبول طلب المطابقة قبل إرسال الرسائل" });
    }

    let message = await Message.findOne({ chatId, messageId });
    if (!message) {
      message = new Message({
        chatId,
        messageId,
        sender: user.email,
        receiver,
        text: escapeHTML(text),
        attachments: attachments || [],
      });
      await message.save();
      // Emit only on first creation
      io.to(chatId).emit("newMessage", message);
    }

    res.status(201).json({ message });
  } catch (err) {
    res.status(500).json({ error: "خطأ في إرسال الرسالة" });
  }
});

// Get user by email (for profile/chat)
app.get("/api/user/:email", authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });
    const safeUser = attachGamification(user.toSafeObject());
    safeUser.name = safeUser.username1 + " " + safeUser.username2;
    res.json({ user: safeUser });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب بيانات المستخدم" });
  }
});

// ═══════════════════════════════════════════════
// 6) PROFILE EXTENSIONS APIs (Interactions, Reviews, Bio)
// ═══════════════════════════════════════════════

// Session Rating
app.post("/api/session/rate", authMiddleware, async (req, res) => {
  try {
    const { ratedEmail, skill, rating, comment } = req.body;
    if (!ratedEmail || !rating) return res.status(400).json({ error: "البيانات ناقصة" });

    const reviewer = await User.findById(req.userId);
    if (!reviewer) return res.status(404).json({ error: "المراجع غير موجود" });

    const targetUser = await User.findOne({ email: ratedEmail.toLowerCase().trim() });
    if (!targetUser) return res.status(404).json({ error: "المستخدم غير موجود" });

    if (!targetUser.reviews) targetUser.reviews = [];
    targetUser.reviews.push({
      reviewerEmail: reviewer.email,
      reviewerName: reviewer.username1 + " " + reviewer.username2,
      skill: skill || "عام",
      rating: Number(rating),
      comment: escapeHTML(String(comment || "").slice(0, 500)),
      date: new Date(),
    });

    const pts = pointsForNewReview(targetUser, rating);
    targetUser.gamifyPoints = (targetUser.gamifyPoints || 0) + pts;
    const g = computeGamification(targetUser);
    targetUser.gamifyLevel = g.level;

    await targetUser.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "خطأ في حفظ التقييم" });
  }
});

// Update Bio
app.put("/api/me/bio", authMiddleware, async (req, res) => {
  try {
    const { bio } = req.body;
    const user = await User.findByIdAndUpdate(req.userId, { bio }, { new: true });
    const safeUser = user.toSafeObject();
    safeUser.name = safeUser.username1 + " " + safeUser.username2;
    res.json({ user: safeUser });
  } catch (err) {
    res.status(500).json({ error: "خطأ في تحديث النبذة" });
  }
});

// Get users interacted with (matches or chatted)
app.get("/api/interactions", authMiddleware, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId)
      .select("email deletedConnections")
      .lean();
    if (!currentUser) return res.status(404).json({ error: "مستخدم غير موجود" });

    // استخدام distinct بدل جلب كل الرسائل — أسرع بكتير في الذاكرة
    const [senders, receivers] = await Promise.all([
      Message.distinct("sender", { receiver: currentUser.email }),
      Message.distinct("receiver", { sender: currentUser.email }),
    ]);

    const interactedEmails = new Set([...senders, ...receivers]);
    interactedEmails.delete(currentUser.email); // حذف الـ email الخاص

    // Remove deleted connections
    const deleted = new Set(currentUser.deletedConnections || []);
    const validEmails = Array.from(interactedEmails).filter(e => !deleted.has(e));

    // جلب بيانات المستخدمين بـ lean() وبدون password
    const users = await User.find(
      { email: { $in: validEmails } },
      "email username1 username2 avatar bio verifiedSkills learnSkills teachSkills"
    ).lean();

    const safeUsers = users.map(u => {
      u.name = u.username1 + " " + u.username2;
      return u;
    });

    res.json({ interactions: safeUsers });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب التفاعلات" });
  }
});

// Delete a connection
app.post("/api/connections/delete", authMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });

    await User.findByIdAndUpdate(req.userId, {
      $addToSet: { deletedConnections: email }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "خطأ في حذف الاتصال" });
  }
});

// Add a review
app.post("/api/reviews", authMiddleware, async (req, res) => {
  try {
    const { targetEmail, rating, comment } = req.body;
    if (!targetEmail || !rating) return res.status(400).json({ error: "البيانات مطلوبة" });

    const reviewer = await User.findById(req.userId);
    if (!reviewer) return res.status(404).json({ error: "المراجع غير موجود" });

    const targetUser = await User.findOne({ email: targetEmail });
    if (!targetUser) return res.status(404).json({ error: "المستخدم المستهدف غير موجود" });

    // Check if review already exists
    const existingReviewIndex = targetUser.reviews.findIndex(r => r.reviewerEmail === reviewer.email);
    const newReview = {
      reviewerEmail: reviewer.email,
      reviewerName: reviewer.username1 + " " + reviewer.username2,
      rating: Number(rating),
      comment: escapeHTML(String(comment || "").slice(0, 500)),
      date: new Date()
    };

    if (existingReviewIndex >= 0) {
      targetUser.reviews[existingReviewIndex] = newReview;
    } else {
      targetUser.reviews.push(newReview);
      const pts = pointsForNewReview(targetUser, rating);
      targetUser.gamifyPoints = (targetUser.gamifyPoints || 0) + pts;
    }

    const g = computeGamification(targetUser);
    targetUser.gamifyLevel = g.level;

    await targetUser.save();
    res.json({ success: true, reviews: targetUser.reviews });
  } catch (err) {
    res.status(500).json({ error: "خطأ في إضافة التقييم" });
  }
});

// Report User
app.post("/api/reports", authMiddleware, async (req, res) => {
  try {
    const { targetEmail, reason, chatId } = req.body;
    if (!targetEmail || !reason) return res.status(400).json({ error: "بيانات البلاغ غير مكتملة" });

    const reporter = await User.findById(req.userId);
    if (!reporter) return res.status(404).json({ error: "المبلغ غير موجود" });

    const report = new Report({
      reporterEmail: reporter.email,
      reportedEmail: targetEmail,
      reason: escapeHTML(reason),
      chatId: chatId || ""
    });
    
    await report.save();
    res.json({ success: true, message: "تم إرسال البلاغ وسيقوم المسؤولون بمراجعته بأقرب وقت" });
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ أثناء إرسال البلاغ" });
  }
});

// ═══════════════════════════════════════════════
// 6b) NOTIFICATIONS API
// ═══════════════════════════════════════════════

// GET /api/notifications — جلب الإشعارات للمستخدم الحالي
app.get("/api/notifications", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("notifications").lean();
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });
    const notifications = (user.notifications || []).slice().reverse(); // الأحدث أولاً
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب الإشعارات" });
  }
});

// PATCH /api/notifications/read — تعليم كل الإشعارات كمقروءة
app.patch("/api/notifications/read", authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, {
      $set: { "notifications.$[].read": true }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "خطأ في تحديث الإشعارات" });
  }
});

// ═══════════════════════════════════════════════
// 6c) MATCH REQUESTS API (Inbox / Accept / Reject)
// ═══════════════════════════════════════════════

// GET /api/match-requests — جلب طلبات المطابقة الواردة (pending)
app.get("/api/match-requests", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId).select("email").lean();
    if (!me) return res.status(404).json({ error: "مستخدم غير موجود" });

    const incoming = await Match.find({
      $or: [{ userA: me.email }, { userB: me.email }],
      initiator: { $ne: me.email },
      status: "pending",
    }).lean();

    // جلب بيانات المرسل لكل طلب
    const requesterEmails = incoming.map(m => m.initiator);
    const requesters = await User.find(
      { email: { $in: requesterEmails } },
      "email username1 username2 avatar learnSkills teachSkills verifiedSkills"
    ).lean();
    const requesterMap = {};
    requesters.forEach(u => {
      requesterMap[u.email] = { ...u, name: u.username1 + " " + u.username2 };
    });

    const result = incoming.map(m => ({
      matchId: m._id,
      chatId: m.chatId,
      status: m.status,
      createdAt: m.createdAt,
      requester: requesterMap[m.initiator] || { email: m.initiator, name: m.initiator },
    }));

    res.json({ requests: result });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب طلبات المطابقة" });
  }
});

// POST /api/match-requests — إرسال طلب مطابقة جديد
app.post("/api/match-requests", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId)
      .select("email username1 username2 teachSkills verifiedSkills status")
      .lean();
    if (!me) return res.status(404).json({ error: "مستخدم غير موجود" });
    if (me.status === "banned") {
      return res.status(403).json({ error: "حسابك محظور" });
    }
    if (!hasVerifiedTeachSkill(me)) {
      return res.status(403).json({
        error: "يجب اجتياز اختبار مهارة واحدة على الأقل من المهارات التي تعلّمها قبل إرسال طلب مطابقة",
      });
    }

    const { targetEmail } = req.body;
    if (!targetEmail) return res.status(400).json({ error: "البريد المستهدف مطلوب" });
    if (targetEmail.toLowerCase() === me.email) return res.status(400).json({ error: "لا يمكنك إرسال طلب لنفسك" });

    const target = await User.findOne({ email: targetEmail.toLowerCase().trim() })
      .select("verifiedSkills status")
      .lean();
    if (!target || target.status === "banned") {
      return res.status(404).json({ error: "المستخدم المستهدف غير موجود" });
    }
    if (!(target.verifiedSkills || []).length) {
      return res.status(403).json({ error: "لا يمكن إرسال طلب مطابقة لمستخدم لم يجتز الاختبار" });
    }

    const [userA, userB] = Match.makePair(me.email, targetEmail);
    const existing = await Match.findOne({ userA, userB });
    if (existing) {
      return res.status(409).json({ error: "يوجد طلب مطابقة بالفعل بينكما", status: existing.status });
    }

    const match = await Match.create({
      userA,
      userB,
      initiator: me.email.toLowerCase().trim(),
      status: "pending",
    });

    const senderName = (me.username1 || "") + " " + (me.username2 || "");
    try {
      await pushNotification(targetEmail, {
        title: "طلب مطابقة جديد",
        message: `أرسل لك ${senderName.trim() || me.email} طلب مطابقة لتبادل المهارات`,
        type: "info",
        read: false,
        date: new Date(),
      });
    } catch (notifErr) {
      console.error("تعذر إرسال إشعار طلب المطابقة:", notifErr);
    }

    res.status(201).json({ success: true, match });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ error: "يوجد طلب مطابقة بالفعل بينكما" });
    }
    res.status(500).json({ error: "خطأ في إرسال طلب المطابقة" });
  }
});

// PATCH /api/match-requests/:matchId — قبول أو رفض طلب مطابقة
app.patch("/api/match-requests/:matchId", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId).select("email username1 username2").lean();
    if (!me) return res.status(404).json({ error: "مستخدم غير موجود" });

    const { action } = req.body; // 'accept' or 'reject'
    if (!action || !["accept", "reject"].includes(action)) {
      return res.status(400).json({ error: "action يجب أن تكون accept أو reject" });
    }

    const match = await Match.findById(req.params.matchId);
    if (!match) return res.status(404).json({ error: "الطلب غير موجود" });

    // فقط المستلم (غير المُبادر) يمكنه الرد
    const myEmail = me.email.toLowerCase();
    const isRecipient = (match.userA === myEmail || match.userB === myEmail) && match.initiator !== myEmail;
    if (!isRecipient) return res.status(403).json({ error: "لا يمكنك الرد على هذا الطلب" });
    if (match.status !== "pending") return res.status(409).json({ error: "تم الرد على هذا الطلب مسبقاً" });

    if (action === "accept") {
      match.status = "accepted";
      match.chatId = Match.buildChatId(match.userA, match.userB);

      // إرسال إشعار للمُبادر
      const responderName = me.username1 + " " + me.username2;
      await pushNotification(match.initiator, {
        title: "تم قبول طلب المطابقة! 🎉",
        message: `قبل ${responderName} طلبك — يمكنك الآن بدء المحادثة`,
        type: "success",
        read: false,
        date: new Date(),
      });
    } else {
      match.status = "rejected";
    }

    await match.save();
    res.json({ success: true, match });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطأ في الرد على الطلب" });
  }
});

// ═══════════════════════════════════════════════
// 7) ADMIN & GAMIFICATION APIs
// ═══════════════════════════════════════════════

app.use("/api/admin", authMiddleware, requireAdmin("dashboard:read"), ensureAdminCsrf);

app.get("/api/admin/csrf-token", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1] || "";
  res.json({
    csrfToken: crypto.createHash("sha256").update(`${token}:${JWT_SECRET}`).digest("hex"),
  });
});

app.get("/api/admin/me", async (req, res) => {
  const admin = req.adminUser.toObject ? req.adminUser.toObject() : req.adminUser;
  delete admin.password;
  res.json({
    admin,
    permissions: getRolePermissions(admin.role),
    twoFactorRequired: ADMIN_ROLES.includes(admin.role) && !admin.twoFactorEnabled,
  });
});

app.get("/api/admin/dashboard", async (req, res) => {
  try {
    const now = new Date();
    const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      dailyActiveUsers,
      monthlyActiveUsers,
      bannedUsers,
      suspendedUsers,
      openComplaints,
      closedComplaints,
      totalRequests,
      completedSessions,
      pendingRequests,
      rejectedRequests,
      messageSessions,
      verifiedAgg,
      topTeachSkills,
      topLearnSkills,
      activeUsers,
      recentAudit,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastLoginAt: { $gte: dayStart } }),
      User.countDocuments({ lastLoginAt: { $gte: monthStart } }),
      User.countDocuments({ status: "banned" }),
      User.countDocuments({ status: "suspended" }),
      Report.countDocuments({ status: { $in: ["open", "pending", "reviewing"] } }),
      Report.countDocuments({ status: { $in: ["closed", "resolved", "reviewed"] } }),
      Match.countDocuments(),
      Match.countDocuments({ status: "accepted" }),
      Match.countDocuments({ status: "pending" }),
      Match.countDocuments({ status: "rejected" }),
      Message.distinct("chatId"),
      User.aggregate([
        { $project: { n: { $size: { $ifNull: ["$verifiedSkills", []] } } } },
        { $group: { _id: null, total: { $sum: "$n" } } },
      ]),
      User.aggregate([
        { $unwind: "$teachSkills" },
        { $group: { _id: "$teachSkills", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      User.aggregate([
        { $unwind: "$learnSkills" },
        { $group: { _id: "$learnSkills", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      User.find({}, "email username1 username2 reviews verifiedSkills lastLoginAt gamifyPoints")
        .sort({ lastLoginAt: -1, gamifyPoints: -1 })
        .limit(8)
        .lean(),
      AuditLog.find().sort({ createdAt: -1 }).limit(8).lean(),
    ]);

    const totalSkills = verifiedAgg[0]?.total || 0;
    const successRate = totalRequests ? Math.round((completedSessions / totalRequests) * 100) : 0;
    const complaintRate = totalUsers ? Math.round(((openComplaints + closedComplaints) / totalUsers) * 1000) / 10 : 0;
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      return d;
    });

    const weeklyUsers = await Promise.all(days.map((d) => {
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return User.countDocuments({ createdAt: { $gte: start, $lte: end } });
    }));
    const weeklyRequests = await Promise.all(days.map((d) => {
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return Match.countDocuments({ createdAt: { $gte: start, $lte: end } });
    }));

    res.json({
      stats: {
        totalUsers,
        dailyActiveUsers,
        monthlyActiveUsers,
        totalSkills,
        exchangeRequests: totalRequests,
        completedSessions,
        openComplaints,
        closedComplaints,
        bannedUsers,
        suspendedUsers,
        successRate,
        complaintRate,
        activeSessions: messageSessions.length,
        pendingRequests,
        rejectedRequests,
      },
      charts: {
        labels: days.map((d) => d.toLocaleDateString("ar-EG", { weekday: "short" })),
        users: weeklyUsers,
        requests: weeklyRequests,
      },
      topSkills: topLearnSkills.map((item) => ({ name: item._id, demand: item.count })),
      availableSkills: topTeachSkills.map((item) => ({ name: item._id, providers: item.count })),
      activeUsers: activeUsers.map((u) => ({
        id: u._id,
        name: `${u.username1 || ""} ${u.username2 || ""}`.trim() || u.email,
        email: u.email,
        verifiedSkills: (u.verifiedSkills || []).length,
        reviews: (u.reviews || []).length,
        lastLoginAt: u.lastLoginAt,
        points: u.gamifyPoints || 0,
      })),
      recentAudit,
      security: {
        rateLimiting: true,
        csrfProtection: true,
        sessionManagement: true,
        twoFactorAdmins: true,
      },
    });
  } catch (err) {
    structuredLog("admin.dashboard_failed", { error: err.message });
    res.status(500).json({ error: "تعذر تحميل إحصائيات لوحة الإدارة" });
  }
});

app.get("/api/admin/users", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 20));
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "all");
    const role = String(req.query.role || "all");
    const sort = String(req.query.sort || "createdAt:desc");
    const [sortField, sortDir] = sort.split(":");
    const allowedSort = ["createdAt", "lastLoginAt", "email", "status", "role", "violationCount"];
    const filter = {};

    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: "i" } },
        { username1: { $regex: search, $options: "i" } },
        { username2: { $regex: search, $options: "i" } },
      ];
    }
    if (["active", "suspended", "banned"].includes(status)) filter.status = status;
    if (["user", ...ADMIN_ROLES].includes(role)) filter.role = role;

    const sortSpec = { [allowedSort.includes(sortField) ? sortField : "createdAt"]: sortDir === "asc" ? 1 : -1 };
    const [users, total] = await Promise.all([
      User.find(filter, "-password")
        .sort(sortSpec)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      users: users.map((u) => ({
        ...u,
        role: u.role || "user",
        status: u.status || "active",
        isTempBanned: Boolean(u.banUntil && new Date(u.banUntil).getTime() > Date.now()),
      })),
      stats: {
        totalUsers: total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "تعذر تحميل المستخدمين" });
  }
});

app.get("/api/admin/users/:userId", requireAdmin("users:read"), async (req, res) => {
  const user = await User.findById(req.params.userId, "-password").lean();
  if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
  const audit = await AuditLog.find({ targetId: String(user._id) }).sort({ createdAt: -1 }).limit(20).lean();
  res.json({ user, audit });
});

app.patch("/api/admin/users/:userId", requireAdmin("users:write"), async (req, res) => {
  try {
    const allowed = ["username1", "username2", "bio", "role", "teachSkills", "learnSkills", "verifiedSkills"];
    const patch = {};
    allowed.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];
    });
    if (patch.role && !["user", ...ADMIN_ROLES].includes(patch.role)) {
      return res.status(400).json({ error: "دور غير صالح" });
    }
    if (patch.role && req.adminUser.role !== "super_admin") {
      return res.status(403).json({ error: "تغيير الأدوار يتطلب Super Admin" });
    }
    const user = await User.findByIdAndUpdate(req.params.userId, patch, { new: true, projection: "-password" });
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    await writeAuditLog(req, "user.update", { type: "user", id: user._id, email: user.email }, { patch: Object.keys(patch) });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: "تعذر تعديل المستخدم" });
  }
});

app.delete("/api/admin/users/:userId", requireAdmin("users:write"), async (req, res) => {
  try {
    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ error: "المستخدم غير موجود" });
    if (ADMIN_ROLES.includes(target.role) && req.adminUser.role !== "super_admin") {
      return res.status(403).json({ error: "حذف حساب إداري يتطلب Super Admin" });
    }
    await User.deleteOne({ _id: target._id });
    await writeAuditLog(req, "user.delete", { type: "user", id: target._id, email: target.email });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "تعذر حذف المستخدم" });
  }
});

app.put("/api/admin/users/:userId/status", requireAdmin("users:write"), async (req, res) => {
  try {
    const { status, reason = "", banUntil = null, durationValue = null, durationUnit = "" } = req.body;
    if (!["active", "suspended", "banned"].includes(status)) {
      return res.status(400).json({ error: "حالة غير صحيحة" });
    }
    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ error: "المستخدم غير موجود" });
    if (ADMIN_ROLES.includes(target.role) && req.adminUser.role !== "super_admin") {
      return res.status(403).json({ error: "تعديل حساب إداري يتطلب Super Admin" });
    }

    let until = banUntil ? new Date(banUntil) : null;
    if (!until && durationValue && ["hours", "days", "weeks"].includes(durationUnit)) {
      const unitMs = durationUnit === "hours" ? 3600000 : durationUnit === "days" ? 86400000 : 604800000;
      until = new Date(Date.now() + Number(durationValue) * unitMs);
    }
    target.status = status;
    target.banReason = status === "active" ? "" : String(reason || "إجراء إداري").slice(0, 500);
    target.banUntil = status === "banned" && until && Number.isFinite(until.getTime()) ? until : null;
    if (status !== "active") target.violationCount = Number(target.violationCount || 0) + 1;
    target.banHistory.push({
      action: status,
      reason: target.banReason,
      until: target.banUntil,
      by: req.adminUser.email,
      at: new Date(),
    });
    if (req.body.notify !== false && status !== "active") {
      target.notifications.push({
        title: status === "suspended" ? "تم إيقاف حسابك مؤقتًا" : "تم تطبيق حظر على حسابك",
        message: target.banReason || "يرجى مراجعة الدعم لمزيد من التفاصيل.",
        type: "warning",
        read: false,
        date: new Date(),
      });
    }
    await target.save();
    await writeAuditLog(req, `user.${status}`, { type: "user", id: target._id, email: target.email }, {
      reason: target.banReason,
      until: target.banUntil,
      notify: req.body.notify !== false,
    });
    res.json({ success: true, status: target.status, banUntil: target.banUntil, banReason: target.banReason });
  } catch (err) {
    res.status(500).json({ error: "تعذر تحديث حالة المستخدم" });
  }
});

app.post("/api/admin/users/:userId/unban", requireAdmin("users:write"), async (req, res) => {
  try {
    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ error: "المستخدم غير موجود" });
    if (ADMIN_ROLES.includes(target.role) && req.adminUser.role !== "super_admin") {
      return res.status(403).json({ error: "تعديل حساب إداري يتطلب Super Admin" });
    }
    target.status = "active";
    target.banReason = "";
    target.banUntil = null;
    target.banHistory.push({
      action: "unban",
      reason: req.body.reason || "فك حظر يدوي",
      by: req.adminUser.email,
      at: new Date(),
    });
    await target.save();
    await writeAuditLog(req, "user.unban", { type: "user", id: target._id, email: target.email });
    res.json({ success: true, status: target.status });
  } catch (err) {
    res.status(500).json({ error: "تعذر فك الحظر" });
  }
});

app.get("/api/admin/skills", async (req, res) => {
  try {
    const [teach, learn, verified] = await Promise.all([
      User.aggregate([{ $unwind: "$teachSkills" }, { $group: { _id: "$teachSkills", providers: { $sum: 1 } } }, { $sort: { providers: -1 } }]),
      User.aggregate([{ $unwind: "$learnSkills" }, { $group: { _id: "$learnSkills", demand: { $sum: 1 } } }, { $sort: { demand: -1 } }]),
      User.aggregate([{ $unwind: "$verifiedSkills" }, { $group: { _id: "$verifiedSkills", verified: { $sum: 1 } } }]),
    ]);
    const rows = new Map();
    teach.forEach((x) => rows.set(x._id, { name: x._id, providers: x.providers, demand: 0, verified: 0, status: "approved" }));
    learn.forEach((x) => rows.set(x._id, { ...(rows.get(x._id) || { name: x._id, providers: 0, verified: 0, status: "approved" }), demand: x.demand }));
    verified.forEach((x) => rows.set(x._id, { ...(rows.get(x._id) || { name: x._id, providers: 0, demand: 0, status: "approved" }), verified: x.verified }));
    res.json({ skills: Array.from(rows.values()).sort((a, b) => b.demand - a.demand) });
  } catch (err) {
    res.status(500).json({ error: "تعذر تحميل المهارات" });
  }
});

app.get("/api/admin/exchanges", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
  const status = String(req.query.status || "all");
  const filter = ["pending", "accepted", "rejected"].includes(status) ? { status } : {};
  const [requests, total] = await Promise.all([
    Match.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Match.countDocuments(filter),
  ]);
  res.json({ requests, stats: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } });
});

app.patch("/api/admin/exchanges/:id", requireAdmin("exchanges:write"), async (req, res) => {
  const { status } = req.body;
  if (!["pending", "accepted", "rejected"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
  const request = await Match.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!request) return res.status(404).json({ error: "طلب التبادل غير موجود" });
  await writeAuditLog(req, "exchange.update", { type: "exchange", id: request._id }, { status });
  res.json({ success: true, request });
});

app.get("/api/admin/reports", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
  const status = String(req.query.status || "all");
  const filter = ["open", "pending", "reviewing", "reviewed", "resolved", "closed"].includes(status) ? { status } : {};
  const [reports, total] = await Promise.all([
    Report.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Report.countDocuments(filter),
  ]);
  res.json({ reports, stats: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } });
});

app.patch("/api/admin/reports/:id", requireAdmin("reports:write"), async (req, res) => {
  const patch = {};
  ["status", "adminNotes", "actionTaken"].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];
  });
  if (patch.status && !["open", "pending", "reviewing", "reviewed", "resolved", "closed"].includes(patch.status)) {
    return res.status(400).json({ error: "حالة شكوى غير صالحة" });
  }
  patch.handledBy = req.adminUser.email;
  patch.handledAt = new Date();
  const report = await Report.findByIdAndUpdate(req.params.id, patch, { new: true });
  if (!report) return res.status(404).json({ error: "الشكوى غير موجودة" });
  await writeAuditLog(req, "report.update", { type: "report", id: report._id, email: report.reportedEmail }, patch);
  res.json({ success: true, report });
});

app.post("/api/admin/notifications", requireAdmin("notifications:write"), async (req, res) => {
  const { target = "all", email = "", title = "", message = "", type = "info" } = req.body;
  if (!title || !message) return res.status(400).json({ error: "العنوان والرسالة مطلوبان" });
  const notification = { title: title.slice(0, 120), message: message.slice(0, 700), type, read: false, date: new Date() };
  let result;
  if (target === "single") {
    result = await User.updateOne({ email: email.toLowerCase().trim() }, { $push: { notifications: notification } });
  } else if (target === "admins") {
    result = await User.updateMany({ role: { $in: ADMIN_ROLES } }, { $push: { notifications: notification } });
  } else {
    result = await User.updateMany({}, { $push: { notifications: notification } });
  }
  await writeAuditLog(req, "notification.send", { type: "notification" }, { target, email, count: result.modifiedCount || 0 });
  res.json({ success: true, sent: result.modifiedCount || 0 });
});

app.get("/api/admin/audit-logs", requireAdmin("audit:read"), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 30));
  const [logs, total] = await Promise.all([
    AuditLog.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(),
  ]);
  res.json({ logs, stats: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } });
});

app.get("/api/admin/settings", requireAdmin("settings:write"), async (req, res) => {
  res.json({
    settings: {
      siteName: "Sharik",
      emailProvider: isEmailConfigured() ? "configured" : "not_configured",
      notificationsEnabled: true,
      bannersEnabled: true,
      contentModeration: true,
      forbiddenWords: ["spam", "abuse"],
      backupSchedule: "daily",
    },
  });
});

// Get all users for admin dashboard (محمي بالـ role)
app.get("/api/admin/users", authMiddleware, async (req, res) => {
  try {
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "غير مصرح لك — يجب أن تكون مسؤولاً" });
    }

    // Pagination لتجنب جلب آلاف المستخدمين دفعة واحدة
    const page = Number(req.query.page) || 1;
    const limit = 50;
    const rawUsers = await User.find({}, "-password -notifications -reviews")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const totalCount = await User.countDocuments();

    // Normalize old users that don't have status field yet
    const users = rawUsers.map(u => {
      if (!u.status) u.status = "active";
      if (!u.role)   u.role   = "user";
      return u;
    });

    // Real active sessions: distinct chatIds in Message collection
    let activeSessions = 0;
    try {
      activeSessions = await Message.distinct("chatId").then(r => r.length);
    } catch(_) { activeSessions = 0; }

    const [verifiedAgg] = await User.aggregate([
      { $project: { n: { $size: { $ifNull: ["$verifiedSkills", []] } } } },
      { $group: { _id: null, total: { $sum: "$n" } } },
    ]);

    const stats = {
      totalUsers: totalCount,
      verifiedSkills: verifiedAgg?.total || 0,
      activeSessions,
      page,
      totalPages: Math.ceil(totalCount / limit)
    };
    res.json({ users, stats });
  } catch (err) {
    res.status(500).json({ error: "Error fetching admin data" });
  }
});

// Update user status (ban/unban) — محمي بالـ role
app.put("/api/admin/users/:userId/status", authMiddleware, async (req, res) => {
  try {
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "غير مصرح لك" });
    }
    const { status } = req.body;
    if (!['active', 'banned'].includes(status)) {
      return res.status(400).json({ error: "حالة غير صحيحة" });
    }
    const targetUser = await User.findByIdAndUpdate(req.params.userId, { status }, { new: true });
    if (!targetUser) return res.status(404).json({ error: "المستخدم غير موجود" });
    res.json({ success: true, status: targetUser.status });
  } catch (err) {
    res.status(500).json({ error: "Error updating status" });
  }
});

// Admin: Get Chats — محمي بالـ role
app.get("/api/admin/chats", authMiddleware, async (req, res) => {
  try {
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "غير مصرح لك" });
    }
    // Group messages by chatId to find unique sessions
    const chatStats = await Message.aggregate([
      { $group: { _id: "$chatId", msgCount: { $sum: 1 }, lastMessage: { $max: "$createdAt" }, members: { $addToSet: "$sender" } } },
      { $sort: { lastMessage: -1 } },
      { $limit: 50 }
    ]);
    res.json({ chats: chatStats });
  } catch (err) {
    res.status(500).json({ error: "Error fetching admin chats" });
  }
});

// Admin: Get Blogs — محمي بالـ role
app.get("/api/admin/blogs", authMiddleware, async (req, res) => {
  try {
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "غير مصرح لك" });
    }
    const blogs = await Article.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json({ blogs });
  } catch (err) {
    res.status(500).json({ error: "Error fetching admin blogs" });
  }
});

// Admin: Get Reports
app.get("/api/admin/reports", authMiddleware, async (req, res) => {
  try {
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "غير مصرح لك" });
    }
    const reports = await Report.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب البلاغات" });
  }
});

// ═══════════════════════════════════════════════
// 8) E2E TESTING HELPERS (Not protected)
// ═══════════════════════════════════════════════

app.put("/api/test/reset-user", testEndpointGuard, async (req, res) => {
  try {
    // Allows resetting the test user account between E2E runs
    const testEmail = "sharik@gmail.com";
    await User.deleteMany({ email: testEmail });
    await Match.deleteMany({ $or: [{ userA: testEmail }, { userB: testEmail }] });
    res.json({ success: true, message: `Deleted testing records for ${testEmail}` });
  } catch (err) {
    res.status(500).json({ error: "خطأ في الجلب" });
  }
});

app.post("/api/test/seed-match", testEndpointGuard, async (req, res) => {
  try {
    const testEmail = "sharik@gmail.com";
    const partnerEmail = "helper@sharik.com";
    
    // تأكد من وجود حساب المساعد للتشات
    let helper = await User.findOne({ email: partnerEmail });
    if (!helper) {
      helper = await User.create({
        username1: "المعلم", username2: "الآلي", email: partnerEmail, password: "NotARealPassword123",
        learnSkills: ["Test"], teachSkills: ["JavaScript"]
      });
    }

    const [userA, userB] = Match.makePair(testEmail, partnerEmail);
    const existing = await Match.findOne({ userA, userB });
    if (!existing) {
        await Match.create({
           userA, userB, initiator: partnerEmail, status: "pending"
        });
    } else {
        await Match.updateOne({ userA, userB }, { status: "pending", initiator: partnerEmail });
    }
    res.json({ success: true, message: "تم إنشاء طلب مطابقة وهمي" });
  } catch (err) {
    res.status(500).json({ error: "خطأ في حقن المطابقة" });
  }
});

// Forgot Password — إرسال رابط إعادة التعيين
app.post("/api/forgot-password", async (req, res) => {
  try {
    const email = req.body.email?.toLowerCase().trim();
    if (!email) return res.status(400).json({ error: "البريد مطلوب" });

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({
        success: true,
        message: "إذا كان البريد مسجلاً، ستصلك رسالة لإعادة تعيين كلمة المرور",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.resetPasswordToken = resetHash;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const appUrl = (process.env.APP_URL || "https://sharij-532a3.web.app").replace(/\/$/, "");
    const resetLink = `${appUrl}/login-signup/reset-password.html?token=${resetToken}&email=${encodeURIComponent(email)}`;

    if (isEmailConfigured()) {
      await sendMail({
        to: email,
        subject: "إعادة تعيين كلمة المرور — شارك",
        text: `افتح الرابط لإعادة تعيين كلمة المرور (صالح ساعة واحدة):\n${resetLink}`,
        html: `<p>اضغط <a href="${resetLink}">هنا</a> لإعادة تعيين كلمة المرور.</p><p>الرابط صالح لمدة ساعة.</p>`,
      });
    } else if (!isProduction) {
      console.log("[dev] Password reset link:", resetLink);
    } else {
      return res.status(503).json({
        error: "خدمة البريد غير مُعدّة. تواصل مع الدعم لإعادة تعيين كلمة المرور.",
      });
    }

    res.json({
      success: true,
      message: "إذا كان البريد مسجلاً، ستصلك رسالة لإعادة تعيين كلمة المرور",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطأ في معالجة الطلب" });
  }
});

app.post("/api/reset-password", async (req, res) => {
  try {
    const { email, token, password } = req.body;
    if (!email || !token || !password) {
      return res.status(400).json({ error: "البيانات غير مكتملة" });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" });
    }

    const resetHash = crypto.createHash("sha256").update(String(token)).digest("hex");
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      resetPasswordToken: resetHash,
      resetPasswordExpires: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ error: "الرابط غير صالح أو منتهي الصلاحية" });
    }

    user.password = password;
    user.resetPasswordToken = "";
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطأ في إعادة تعيين كلمة المرور" });
  }
});

app.get("/api/metrics", authMiddleware, async (req, res) => {
  const latency = {};
  Object.keys(metrics.latency).forEach((key) => {
    const bucket = metrics.latency[key];
    latency[key] = {
      count: bucket.count,
      avgMs: bucket.count ? Math.round((bucket.totalMs / bucket.count) * 100) / 100 : 0,
      maxMs: bucket.maxMs,
    };
  });
  res.json({
    socketEvents: metrics.socketEvents,
    rateLimited: metrics.rateLimited,
    latency,
    storageMode: objectStorage.mode,
  });
});

// ═══════════════════════════════════════════════
// SaaS APIs: Dashboard, Sessions, Search, Social
// ═══════════════════════════════════════════════

function avgRating(reviews) {
  if (!reviews?.length) return 0;
  return Math.round(
    (reviews.reduce((a, r) => a + (Number(r.rating) || 0), 0) / reviews.length) * 10
  ) / 10;
}

function buildGoogleCalendarUrl(session) {
  const start = new Date(session.startAt);
  const end = new Date(session.endAt);
  const fmt = (d) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const title = encodeURIComponent(session.title || `جلسة ${session.skill} | شارك`);
  const details = encodeURIComponent(
    `جلسة تبادل مهارات على منصة شارك\nالمهارة: ${session.skill}\nمع: ${session.hostEmail} / ${session.guestEmail}`
  );
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}`;
}

app.get("/api/dashboard", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });

    const email = user.email;
    const [upcomingSessions, pastSessions, pendingMatches, unreadNotifs, matchesPreview] =
      await Promise.all([
        Session.find({
          $or: [{ hostEmail: email }, { guestEmail: email }],
          status: { $in: ["pending", "confirmed"] },
          startAt: { $gte: new Date() },
        })
          .sort({ startAt: 1 })
          .limit(5)
          .lean(),
        Session.find({
          $or: [{ hostEmail: email }, { guestEmail: email }],
          status: "completed",
        })
          .sort({ startAt: -1 })
          .limit(5)
          .lean(),
        Match.countDocuments({
          $or: [{ userA: email }, { userB: email }],
          status: "pending",
        }),
        (user.notifications || []).filter((n) => !n.read).length,
        (async () => {
          try {
            if (!hasVerifiedTeachSkill(user) || !user.learnSkills?.length) return [];
            const candidates = await User.find(
              {
                _id: { $ne: user._id },
                learnSkills: { $in: user.teachSkills },
                teachSkills: { $in: user.learnSkills },
                verifiedSkills: { $exists: true, $ne: [] },
                status: { $ne: "banned" },
              },
              "email username1 username2 teachSkills learnSkills verifiedSkills avatar country"
            )
              .limit(20)
              .lean();
            return candidates
              .filter((c) => isBidirectionalMatch(user, c) && hasVerifiedTeachSkill(c))
              .map((c) => {
                const exp = explainMatch(user, c);
                return {
                  email: c.email,
                  name: `${c.username1} ${c.username2}`,
                  avatar: c.avatar || "",
                  compatibility: calcMatchScore(user, c),
                  theyTeachYou: exp.theyTeachYou,
                  youTeachThem: exp.youTeachThem,
                  reasons: exp.reasons.slice(0, 2),
                };
              })
              .sort((a, b) => b.compatibility - a.compatibility)
              .slice(0, 4);
          } catch {
            return [];
          }
        })(),
      ]);

    const g = computeGamification(user);
    const weekDays = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
    const weeklyProgress = weekDays.map((day, i) => ({
      day,
      hours: Math.max(0, Math.round(((user.learningHours || 0) / 7) * (0.6 + ((i * 17) % 5) / 10) * 10) / 10),
      sessions: Math.max(0, Math.floor(((user.completedSessions || 0) / 7) * (0.5 + (i % 3) * 0.3))),
    }));

    const skillProgress = (user.learnSkills || []).slice(0, 6).map((skill, i) => ({
      skill,
      progress: Math.min(
        95,
        25 + ((user.verifiedSkills || []).includes(skill) ? 40 : 0) + ((i * 13) % 35)
      ),
    }));

    const activities = (user.activityTimeline || [])
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8);

    res.json({
      stats: {
        learningHours: user.learningHours || 0,
        completedSessions: user.completedSessions || pastSessions.length,
        activeRequests: pendingMatches,
        unreadMessages: 0,
        unreadNotifications: unreadNotifs,
        followers: (user.followers || []).length,
        following: (user.following || []).length,
        rating: avgRating(user.reviews),
        xp: g.points,
        level: g.level,
        streak: user.dailyStreak || 0,
        teachCount: (user.teachSkills || []).length,
        learnCount: (user.learnSkills || []).length,
      },
      weeklyProgress,
      skillProgress,
      upcomingSessions,
      recentSessions: pastSessions,
      recommendedMatches: matchesPreview,
      activities,
      goals: [
        { title: "إكمال 3 جلسات هذا الأسبوع", progress: Math.min(100, ((user.completedSessions || 0) % 3) * 33 + 10), target: 3 },
        { title: "التحقق من مهارة تعليمية", progress: (user.verifiedSkills || []).length ? 100 : 20, target: 1 },
        { title: "الحفاظ على سلسلة يومية", progress: Math.min(100, (user.dailyStreak || 0) * 20), target: 5 },
      ],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطأ في لوحة التحكم" });
  }
});

app.get("/api/sessions", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId).select("email").lean();
    if (!me) return res.status(404).json({ error: "مستخدم غير موجود" });
    const status = req.query.status;
    const filter = {
      $or: [{ hostEmail: me.email }, { guestEmail: me.email }],
    };
    if (status) filter.status = status;
    const sessions = await Session.find(filter).sort({ startAt: 1 }).limit(100).lean();
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب الجلسات" });
  }
});

app.post("/api/sessions", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId);
    if (!me) return res.status(404).json({ error: "مستخدم غير موجود" });

    const {
      partnerEmail,
      skill,
      title,
      startAt,
      durationMinutes = 60,
      timezone,
      notes,
    } = req.body;

    if (!partnerEmail || !skill || !startAt) {
      return res.status(400).json({ error: "البيانات ناقصة" });
    }

    const partner = await User.findOne({ email: String(partnerEmail).toLowerCase().trim() });
    if (!partner) return res.status(404).json({ error: "الشريك غير موجود" });

    const start = new Date(startAt);
    if (Number.isNaN(start.getTime()) || start < new Date()) {
      return res.status(400).json({ error: "وقت الجلسة غير صالح" });
    }
    const duration = Math.min(180, Math.max(30, Number(durationMinutes) || 60));
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const chatId = Match.buildChatId(me.email, partner.email);

    const session = await Session.create({
      hostEmail: me.email,
      guestEmail: partner.email,
      skill: escapeHTML(String(skill).slice(0, 80)),
      title: escapeHTML(String(title || `جلسة ${skill}`).slice(0, 120)),
      startAt: start,
      endAt: end,
      timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Cairo",
      durationMinutes: duration,
      notes: escapeHTML(String(notes || "").slice(0, 500)),
      status: "pending",
      createdBy: me.email,
      chatId,
    });

    session.googleEventUrl = buildGoogleCalendarUrl(session);
    await session.save();

    partner.notifications = partner.notifications || [];
    partner.notifications.unshift({
      title: "طلب جلسة جديد",
      message: `${me.username1} يطلب جلسة ${skill}`,
      type: "success",
      read: false,
      date: new Date(),
    });
    if (partner.notifications.length > MAX_NOTIFICATIONS) {
      partner.notifications = partner.notifications.slice(0, MAX_NOTIFICATIONS);
    }
    await partner.save();

    res.json({ session, googleCalendarUrl: session.googleEventUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطأ في حجز الجلسة" });
  }
});

app.patch("/api/sessions/:id", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId).select("email username1").lean();
    if (!me) return res.status(404).json({ error: "مستخدم غير موجود" });

    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "الجلسة غير موجودة" });
    if (![session.hostEmail, session.guestEmail].includes(me.email)) {
      return res.status(403).json({ error: "غير مصرح" });
    }

    const { status, startAt, durationMinutes, cancelReason } = req.body;
    if (status && ["confirmed", "cancelled", "completed", "rescheduled"].includes(status)) {
      session.status = status;
    }
    if (cancelReason) session.cancelReason = escapeHTML(String(cancelReason).slice(0, 300));
    if (startAt) {
      const start = new Date(startAt);
      if (!Number.isNaN(start.getTime())) {
        session.startAt = start;
        const duration = durationMinutes || session.durationMinutes || 60;
        session.endAt = new Date(start.getTime() + duration * 60 * 1000);
        session.durationMinutes = duration;
        session.status = "rescheduled";
        session.googleEventUrl = buildGoogleCalendarUrl(session);
      }
    }
    if (status === "completed") {
      await User.updateMany(
        { email: { $in: [session.hostEmail, session.guestEmail] } },
        {
          $inc: {
            completedSessions: 1,
            learningHours: (session.durationMinutes || 60) / 60,
            gamifyPoints: 15,
          },
        }
      );
    }
    await session.save();
    res.json({ session, googleCalendarUrl: session.googleEventUrl || buildGoogleCalendarUrl(session) });
  } catch (err) {
    res.status(500).json({ error: "خطأ في تحديث الجلسة" });
  }
});

app.get("/api/search", authMiddleware, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().toLowerCase();
    const category = String(req.query.category || "").trim();
    const country = String(req.query.country || "").trim();
    const language = String(req.query.language || "").trim();
    const minRating = Number(req.query.rating) || 0;
    const onlineOnly = req.query.online === "1";
    const difficulty = String(req.query.difficulty || "").trim();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24));

    const skillCatalog = getSkillsList();
    let skills = skillCatalog.map((s) => (typeof s === "string" ? s : s.name || s.skill || String(s)));

    if (q) skills = skills.filter((s) => s.toLowerCase().includes(q));
    if (category) {
      skills = skills.filter((s) => s.toLowerCase().includes(category.toLowerCase()));
    }

    const userFilter = { status: { $ne: "banned" } };
    if (q) {
      userFilter.$or = [
        { username1: new RegExp(q, "i") },
        { username2: new RegExp(q, "i") },
        { teachSkills: new RegExp(q, "i") },
        { learnSkills: new RegExp(q, "i") },
      ];
    }
    if (country) userFilter.country = country;
    if (language) userFilter.languages = language;

    const mentors = await User.find(userFilter)
      .select(
        "email username1 username2 teachSkills learnSkills verifiedSkills avatar bio country languages reviews gamifyPoints isVerified completedSessions lastLoginAt"
      )
      .limit(limit)
      .lean();

    const mentorsOut = mentors
      .map((u) => {
        const rating = avgRating(u.reviews);
        return {
          email: u.email,
          name: `${u.username1} ${u.username2}`,
          avatar: u.avatar || "",
          bio: u.bio || "",
          country: u.country || "",
          languages: u.languages || [],
          teachSkills: u.teachSkills || [],
          learnSkills: u.learnSkills || [],
          verifiedSkills: u.verifiedSkills || [],
          rating,
          reviewCount: (u.reviews || []).length,
          xp: u.gamifyPoints || 0,
          isVerified: Boolean(u.isVerified) || (u.verifiedSkills || []).length > 0,
          completedSessions: u.completedSessions || 0,
          online: onlineOnly
            ? u.lastLoginAt && Date.now() - new Date(u.lastLoginAt).getTime() < 15 * 60 * 1000
            : undefined,
        };
      })
      .filter((m) => m.rating >= minRating)
      .filter((m) => (onlineOnly ? m.online : true));

    const trending = (skillCatalog || [])
      .slice(0, 12)
      .map((s) => (typeof s === "string" ? s : s.name || s.skill));

    res.json({
      query: q,
      skills: skills.slice(0, 40).map((name) => ({
        name,
        category: category || "تقنية",
        difficulty: difficulty || "متوسط",
        learners: 40 + Math.abs(name.length * 17) % 400,
      })),
      mentors: mentorsOut,
      suggested: trending.slice(0, 8),
      trending,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطأ في البحث" });
  }
});

app.get("/api/leaderboard", authMiddleware, async (req, res) => {
  try {
    const type = req.query.type || "mentors";
    const users = await User.find({ status: { $ne: "banned" } })
      .select(
        "email username1 username2 avatar gamifyPoints gamifyLevel teachSkills learnSkills verifiedSkills reviews completedSessions dailyStreak badges isVerified"
      )
      .sort({ gamifyPoints: -1 })
      .limit(50)
      .lean();

    const list = users.map((u, i) => ({
      rank: i + 1,
      email: u.email,
      name: `${u.username1} ${u.username2}`,
      avatar: u.avatar || "",
      xp: u.gamifyPoints || 0,
      level: u.gamifyLevel || "عضو جديد",
      rating: avgRating(u.reviews),
      sessions: u.completedSessions || 0,
      streak: u.dailyStreak || 0,
      badges: u.badges || [],
      isVerified: Boolean(u.isVerified) || (u.verifiedSkills || []).length > 0,
      focus:
        type === "learners"
          ? (u.learnSkills || []).slice(0, 3)
          : (u.teachSkills || []).slice(0, 3),
    }));

    res.json({ type, leaders: list });
  } catch (err) {
    res.status(500).json({ error: "خطأ في لوحة المتصدرين" });
  }
});

app.post("/api/follow/:email", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId);
    if (!me) return res.status(404).json({ error: "مستخدم غير موجود" });
    const targetEmail = String(req.params.email || "").toLowerCase().trim();
    if (!targetEmail || targetEmail === me.email) {
      return res.status(400).json({ error: "بريد غير صالح" });
    }
    const target = await User.findOne({ email: targetEmail });
    if (!target) return res.status(404).json({ error: "المستخدم غير موجود" });

    me.following = me.following || [];
    target.followers = target.followers || [];
    const already = me.following.includes(targetEmail);
    if (already) {
      me.following = me.following.filter((e) => e !== targetEmail);
      target.followers = target.followers.filter((e) => e !== me.email);
    } else {
      me.following.push(targetEmail);
      target.followers.push(me.email);
      target.notifications = target.notifications || [];
      target.notifications.unshift({
        title: "متابع جديد",
        message: `${me.username1} بدأ بمتابعتك`,
        type: "info",
        read: false,
        date: new Date(),
      });
    }
    await Promise.all([me.save(), target.save()]);
    res.json({
      following: !already,
      followersCount: target.followers.length,
      followingCount: me.following.length,
    });
  } catch (err) {
    res.status(500).json({ error: "خطأ في المتابعة" });
  }
});

app.put("/api/me/profile", authMiddleware, async (req, res) => {
  try {
    const allowed = [
      "bio",
      "country",
      "languages",
      "experience",
      "portfolioLinks",
      "certificates",
      "availability",
      "coverImage",
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.bio) updates.bio = escapeHTML(String(updates.bio).slice(0, 800));
    if (updates.experience) updates.experience = escapeHTML(String(updates.experience).slice(0, 1000));
    if (updates.country) updates.country = escapeHTML(String(updates.country).slice(0, 60));
    if (Array.isArray(updates.languages)) {
      updates.languages = updates.languages.map((l) => escapeHTML(String(l).slice(0, 40))).slice(0, 8);
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });
    const safe = attachGamification(user.toSafeObject());
    safe.name = safe.username1 + " " + safe.username2;
    res.json({ user: safe });
  } catch (err) {
    res.status(500).json({ error: "خطأ في تحديث الملف" });
  }
});

app.post("/api/skills/save", authMiddleware, async (req, res) => {
  try {
    const skill = String(req.body.skill || "").trim();
    if (!skill) return res.status(400).json({ error: "المهارة مطلوبة" });
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });
    user.savedSkills = user.savedSkills || [];
    const exists = user.savedSkills.includes(skill);
    if (exists) user.savedSkills = user.savedSkills.filter((s) => s !== skill);
    else user.savedSkills.push(skill);
    await user.save();
    res.json({ saved: !exists, savedSkills: user.savedSkills });
  } catch (err) {
    res.status(500).json({ error: "خطأ في حفظ المهارة" });
  }
});

app.get("/api/availability/:email", authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ email: String(req.params.email).toLowerCase().trim() })
      .select("availability email username1 username2 timezone")
      .lean();
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });

    const defaultSlots = ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];
    const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const availability =
      user.availability?.length > 0
        ? user.availability
        : days.map((day, i) => ({
            day,
            slots: i === 5 ? [] : defaultSlots.filter((_, idx) => (idx + i) % 2 === 0),
          }));

    res.json({
      email: user.email,
      name: `${user.username1} ${user.username2}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Cairo",
      availability,
    });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب التوفر" });
  }
});


// ═══════════════════════════════════════════════
// SOCKET.IO - Real-time Chat
// ═══════════════════════════════════════════════
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("UNAUTHORIZED"));
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select("email status role banUntil").lean();
    if (!user) return next(new Error("UNAUTHORIZED"));
    if (await clearExpiredRestriction(user)) return next(new Error("RESTRICTED"));
    socket.user = { id: String(decoded.id), email: user.email, role: user.role };
    socket.data.joinedChats = new Set();
    socket.data.rl = {};
    next();
  } catch {
    next(new Error("UNAUTHORIZED"));
  }
});

setInterval(() => {
  const latency = {};
  Object.keys(metrics.latency).forEach((key) => {
    const bucket = metrics.latency[key];
    latency[key] = {
      count: bucket.count,
      avgMs: bucket.count ? Math.round((bucket.totalMs / bucket.count) * 100) / 100 : 0,
      maxMs: bucket.maxMs,
    };
  });
  structuredLog("metrics.snapshot", {
    socketEvents: metrics.socketEvents,
    rateLimited: metrics.rateLimited,
    latency,
  });
}, METRICS_LOG_INTERVAL_MS);

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);
  socket.data.connectionTraceId = genTraceId();
  structuredLog("socket.connected", {
    socketId: socket.id,
    user: socket.user?.email,
    traceId: socket.data.connectionTraceId,
  });

  const ackOk = (ack, traceId, payload = {}) => {
    if (typeof ack === "function") ack({ ok: true, traceId, ...payload });
  };
  const ackErr = (ack, traceId, code, message) => {
    if (typeof ack === "function") ack({ ok: false, traceId, code, message });
  };
  const startEvent = (name, traceId) => {
    trackEvent(name);
    structuredLog("socket.event.start", { eventName: name, socketId: socket.id, user: socket.user?.email, traceId });
    return Date.now();
  };
  const endEvent = (name, startedAt, traceId) => {
    trackLatency(name, Date.now() - startedAt);
    structuredLog("socket.event.end", { eventName: name, traceId, latencyMs: Date.now() - startedAt });
  };

  socket.on("joinChat", async (chatId, ack) => {
    const traceId = genTraceId();
    const startedAt = startEvent("joinChat", traceId);
    if (isRateLimited(socket, "joinChat", 12, 15000)) {
      ackErr(ack, traceId, "RATE_LIMITED", "rate_limited");
      endEvent("joinChat", startedAt, traceId);
      return;
    }
    if (!canAccessChat(socket, chatId)) {
      socket.emit("socketError", { code: "FORBIDDEN_CHAT", message: "غير مسموح بالدخول لهذه الغرفة" });
      ackErr(ack, traceId, "FORBIDDEN_CHAT", "forbidden");
      endEvent("joinChat", startedAt, traceId);
      return;
    }
    const members = parseChatMembers(chatId);
    const peerEmail = members.find((m) => m !== (socket.user?.email || "").toLowerCase());
    if (!peerEmail || !(await canAccessChatRoom(socket.user.email, peerEmail))) {
      socket.emit("socketError", { code: "MATCH_REQUIRED", message: "يجب قبول طلب المطابقة قبل الدخول للمحادثة" });
      ackErr(ack, traceId, "MATCH_REQUIRED", "match_required");
      endEvent("joinChat", startedAt, traceId);
      return;
    }
    socket.join(chatId);
    socket.data.joinedChats.add(chatId);
    console.log(`📌 Socket ${socket.id} joined chat: ${chatId}`);
    const state = await loadWhiteboardState(chatId);
    socket.emit("whiteboardState", {
      chatId,
      snapshot: state.snapshot || null,
      actions: state.actions,
      sessionMeta: state.sessionMeta,
      assets: state.assets,
      recordingLog: state.recordingLog,
    });
    ackOk(ack, traceId);
    endEvent("joinChat", startedAt, traceId);
  });

  socket.on("sendMessage", async (data, ack) => {
    const traceId = genTraceId(data?.traceId);
    const startedAt = startEvent("sendMessage", traceId);
    try {
      if (!data?.chatId || !ensureJoined(socket, data.chatId) || !canAccessChat(socket, data.chatId)) {
        ackErr(ack, traceId, "FORBIDDEN_CHAT", "forbidden");
        endEvent("sendMessage", startedAt, traceId);
        return;
      }
      if (isRateLimited(socket, "sendMessage", 20, 10000)) {
        ackErr(ack, traceId, "RATE_LIMITED", "rate_limited");
        endEvent("sendMessage", startedAt, traceId);
        return;
      }
      if (!data.messageId || typeof data.messageId !== "string") {
        ackErr(ack, traceId, "INVALID_MESSAGE_ID", "invalid_message_id");
        endEvent("sendMessage", startedAt, traceId);
        return;
      }
      let message = await Message.findOne({
        chatId: data.chatId,
        messageId: data.messageId,
      });
      if (!message) {
        message = new Message({
          chatId: data.chatId,
          messageId: data.messageId,
          sender: socket.user.email,
          receiver: data.receiver,
          text: data.text || "",
          attachments: data.attachments || [],
          traceId,
        });
        await message.save();
        io.to(data.chatId).emit("newMessage", message);
      }
      ackOk(ack, traceId, { message });
      endEvent("sendMessage", startedAt, traceId);
    } catch (err) {
      console.log("Socket message error:", err);
      ackErr(ack, traceId, "MESSAGE_SAVE_FAILED", "failed");
      endEvent("sendMessage", startedAt, traceId);
    }
  });

  socket.on("typing", (data) => {
    if (!data?.chatId || !ensureJoined(socket, data.chatId) || !canAccessChat(socket, data.chatId)) return;
    if (isRateLimited(socket, "typing", 40, 10000)) return;
    socket.to(data.chatId).emit("userTyping", { email: data.email });
  });

  socket.on("stopTyping", (data) => {
    if (!data?.chatId || !ensureJoined(socket, data.chatId) || !canAccessChat(socket, data.chatId)) return;
    socket.to(data.chatId).emit("userStopTyping", { email: data.email });
  });

  socket.on("requestWhiteboardState", async ({ chatId, traceId: reqTraceId }, ack) => {
    const traceId = genTraceId(reqTraceId);
    const startedAt = startEvent("requestWhiteboardState", traceId);
    if (!chatId || !ensureJoined(socket, chatId) || !canAccessChat(socket, chatId)) {
      ackErr(ack, traceId, "FORBIDDEN_CHAT", "forbidden");
      endEvent("requestWhiteboardState", startedAt, traceId);
      return;
    }
    if (isRateLimited(socket, "requestWhiteboardState", 25, 10000)) {
      ackErr(ack, traceId, "RATE_LIMITED", "rate_limited");
      endEvent("requestWhiteboardState", startedAt, traceId);
      return;
    }
    const state = await loadWhiteboardState(chatId);
    socket.emit("whiteboardState", {
      chatId,
      snapshot: state.snapshot || null,
      actions: state.actions,
      sessionMeta: state.sessionMeta,
      assets: state.assets,
      recordingLog: state.recordingLog,
    });
    ackOk(ack, traceId);
    endEvent("requestWhiteboardState", startedAt, traceId);
  });

  socket.on("whiteboardAction", async ({ chatId, senderName, action, traceId: reqTraceId }, ack) => {
    const traceId = genTraceId(reqTraceId);
    const startedAt = startEvent("whiteboardAction", traceId);
    if (!chatId || !ensureJoined(socket, chatId) || !canAccessChat(socket, chatId)) {
      ackErr(ack, traceId, "FORBIDDEN_CHAT", "forbidden");
      endEvent("whiteboardAction", startedAt, traceId);
      return;
    }
    if (isRateLimited(socket, "whiteboardAction", 80, 10000)) {
      ackErr(ack, traceId, "RATE_LIMITED", "rate_limited");
      endEvent("whiteboardAction", startedAt, traceId);
      return;
    }
    const safeAction = sanitizeAction(action);
    if (!safeAction) {
      ackErr(ack, traceId, "INVALID_ACTION", "invalid_action");
      endEvent("whiteboardAction", startedAt, traceId);
      return;
    }
    const preState = await loadWhiteboardState(chatId);
    ensureSessionMeta(preState, chatId);
    if (!canUserDraw(preState, socket.user.email)) {
      ackErr(ack, traceId, "DRAW_FORBIDDEN", "draw_forbidden");
      endEvent("whiteboardAction", startedAt, traceId);
      return;
    }
    const enqueued = enqueueChatTask(chatId, async () => {
      const state = await loadWhiteboardState(chatId);
      ensureSessionMeta(state, chatId);
      state.actions.push(safeAction);
      state.redoStack = [];
      appendRecordingEvent(state, "action", socket.user.email, { action: safeAction });
      if (state.actions.length % WHITEBOARD_SNAPSHOT_INTERVAL === 0) {
        state.snapshot = null;
        if (state.actions.length > WHITEBOARD_MAX_ACTIONS) {
          state.actions = state.actions.slice(-WHITEBOARD_MAX_ACTIONS);
        }
      }
      whiteboardStates.set(chatId, state);
      queueWhiteboardPersist(chatId);
      socket.to(chatId).emit("whiteboardAction", {
        chatId,
        sender: socket.user.email,
        senderName,
        action: safeAction,
        traceId,
      });
    });
    if (!enqueued) {
      ackErr(ack, traceId, "OVERLOADED", "queue_overloaded");
      endEvent("whiteboardAction", startedAt, traceId);
      return;
    }
    ackOk(ack, traceId);
    endEvent("whiteboardAction", startedAt, traceId);
  });

  socket.on("whiteboardCommand", async ({ chatId, command, snapshot, traceId: reqTraceId }, ack) => {
    const traceId = genTraceId(reqTraceId);
    const startedAt = startEvent("whiteboardCommand", traceId);
    if (!chatId || !ensureJoined(socket, chatId) || !canAccessChat(socket, chatId)) {
      ackErr(ack, traceId, "FORBIDDEN_CHAT", "forbidden");
      endEvent("whiteboardCommand", startedAt, traceId);
      return;
    }
    if (isRateLimited(socket, "whiteboardCommand", 45, 10000)) {
      ackErr(ack, traceId, "RATE_LIMITED", "rate_limited");
      endEvent("whiteboardCommand", startedAt, traceId);
      return;
    }
    if (!command) {
      ackErr(ack, traceId, "INVALID_COMMAND", "invalid_command");
      endEvent("whiteboardCommand", startedAt, traceId);
      return;
    }
    const enqueued = enqueueChatTask(chatId, async () => {
      const state = await loadWhiteboardState(chatId);

      if (command === "undo" && state.actions.length > 0) {
        state.redoStack.push(state.actions.pop());
      } else if (command === "redo" && state.redoStack.length > 0) {
        state.actions.push(state.redoStack.pop());
      } else if (command === "clear") {
        state.actions = [];
        state.redoStack = [];
        state.snapshot = null;
      } else if (command === "snapshot" && snapshot?.data && snapshot?.mime) {
        if (typeof snapshot.data === "string" && snapshot.data.length < 3_000_000) {
          state.snapshot = {
            mime: snapshot.mime,
            data: snapshot.data,
            updatedAt: new Date(),
          };
          state.actions = [];
          state.redoStack = [];
        }
      }
      appendRecordingEvent(state, `command:${command}`, socket.user.email, { snapshot: command === "snapshot" ? Boolean(snapshot) : false });

      whiteboardStates.set(chatId, state);
      queueWhiteboardPersist(chatId);
      socket.to(chatId).emit("whiteboardCommand", {
        chatId,
        sender: socket.user.email,
        command,
        snapshot: command === "snapshot" ? state.snapshot : undefined,
        traceId,
      });
    });
    if (!enqueued) {
      ackErr(ack, traceId, "OVERLOADED", "queue_overloaded");
      endEvent("whiteboardCommand", startedAt, traceId);
      return;
    }
    ackOk(ack, traceId);
    endEvent("whiteboardCommand", startedAt, traceId);
  });

  socket.on("whiteboardCursor", (payload) => {
    const traceId = genTraceId(payload?.traceId);
    const startedAt = startEvent("whiteboardCursor", traceId);
    if (!payload || !payload.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) return;
    if (isRateLimited(socket, "whiteboardCursor", 70, 10000)) {
      endEvent("whiteboardCursor", startedAt, traceId);
      return;
    }
    socket.to(payload.chatId).emit("whiteboardCursor", {
      chatId: payload.chatId,
      sender: socket.user.email,
      senderName: payload.senderName,
      point: payload.point,
      traceId,
    });
    endEvent("whiteboardCursor", startedAt, traceId);
  });

  socket.on("whiteboardPointer", (payload) => {
    const traceId = genTraceId(payload?.traceId);
    const startedAt = startEvent("whiteboardPointer", traceId);
    if (!payload || !payload.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) return;
    if (isRateLimited(socket, "whiteboardPointer", 90, 10000)) {
      endEvent("whiteboardPointer", startedAt, traceId);
      return;
    }
    socket.to(payload.chatId).emit("whiteboardPointer", {
      chatId: payload.chatId,
      sender: socket.user.email,
      senderName: payload.senderName,
      point: payload.point,
      color: payload.color || "#ef4444",
      traceId,
    });
    enqueueChatTask(payload.chatId, async () => {
      const state = await loadWhiteboardState(payload.chatId);
      appendRecordingEvent(state, "pointer", socket.user.email, {
        point: payload.point,
        color: payload.color || "#ef4444",
      });
      whiteboardStates.set(payload.chatId, state);
      queueWhiteboardPersist(payload.chatId);
    });
    endEvent("whiteboardPointer", startedAt, traceId);
  });

  socket.on("whiteboardPresence", async (payload, ack) => {
    const traceId = genTraceId(payload?.traceId);
    const startedAt = startEvent("whiteboardPresence", traceId);
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) {
      ackErr(ack, traceId, "FORBIDDEN_CHAT", "forbidden");
      endEvent("whiteboardPresence", startedAt, traceId);
      return;
    }
    if (isRateLimited(socket, "whiteboardPresence", 60, 10000)) {
      ackErr(ack, traceId, "RATE_LIMITED", "rate_limited");
      endEvent("whiteboardPresence", startedAt, traceId);
      return;
    }
    socket.to(payload.chatId).emit("whiteboardPresence", {
      chatId: payload.chatId,
      sender: socket.user.email,
      senderName: payload.senderName,
      status: payload.status || "viewing",
      traceId,
    });
    ackOk(ack, traceId);
    endEvent("whiteboardPresence", startedAt, traceId);
  });

  socket.on("whiteboardControl", async (payload, ack) => {
    const traceId = genTraceId(payload?.traceId);
    const startedAt = startEvent("whiteboardControl", traceId);
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) {
      ackErr(ack, traceId, "FORBIDDEN_CHAT", "forbidden");
      endEvent("whiteboardControl", startedAt, traceId);
      return;
    }
    const preState = await loadWhiteboardState(payload.chatId);
    ensureSessionMeta(preState, payload.chatId);
    const enqueued = enqueueChatTask(payload.chatId, async () => {
      const state = await loadWhiteboardState(payload.chatId);
      ensureSessionMeta(state, payload.chatId);
      const action = payload.action || "";
      const target = normalizeSessionEmail(payload.targetEmail);
      const approvals = getApprovalState(payload.chatId);

      if (action === "requestRoleMode") {
        const requestId = String(payload.requestId || genTraceId());
        const targetEmail = target || getPeerEmail(payload.chatId, socket.user.email);
        if (!targetEmail) return;
        approvals.role = {
          requestId,
          requester: normalizeSessionEmail(socket.user.email),
          target: targetEmail,
          createdAt: Date.now(),
        };
        io.to(payload.chatId).emit("whiteboardRoleProposal", {
          chatId: payload.chatId,
          requestId,
          requester: socket.user.email,
          requesterName: payload.requesterName || socket.user.email,
          target: targetEmail,
          traceId,
        });
      } else if (action === "respondRoleMode") {
        const req = approvals.role;
        if (!req || req.requestId !== payload.requestId) return;
        if (normalizeSessionEmail(socket.user.email) !== req.target) return;
        if (payload.approved) {
          state.sessionMeta.roleModeActive = true;
          state.sessionMeta.teacher = req.requester;
          state.sessionMeta.learner = req.target;
        } else {
          state.sessionMeta.roleModeActive = false;
          state.sessionMeta.teacher = "";
          state.sessionMeta.learner = "";
        }
        approvals.role = null;
      } else if (action === "requestLock") {
        if (!state.sessionMeta.roleModeActive) return;
        const requestId = String(payload.requestId || genTraceId());
        const targetEmail = target || getPeerEmail(payload.chatId, socket.user.email);
        if (!targetEmail) return;
        approvals.lock = {
          requestId,
          requester: normalizeSessionEmail(socket.user.email),
          target: targetEmail,
          createdAt: Date.now(),
        };
        io.to(payload.chatId).emit("whiteboardLockProposal", {
          chatId: payload.chatId,
          requestId,
          requester: socket.user.email,
          requesterName: payload.requesterName || socket.user.email,
          target: targetEmail,
          durationMs: WHITEBOARD_LOCK_DURATION_MS,
          traceId,
        });
      } else if (action === "respondLock") {
        const req = approvals.lock;
        if (!req || req.requestId !== payload.requestId) return;
        if (normalizeSessionEmail(socket.user.email) !== req.target) return;
        if (payload.approved) {
          state.sessionMeta.boardLocked = true;
          state.sessionMeta.lockExpiresAt = new Date(Date.now() + WHITEBOARD_LOCK_DURATION_MS);
          scheduleLockExpiry(payload.chatId);
        }
        approvals.lock = null;
      } else if (action === "clearRoleMode") {
        if (normalizeSessionEmail(socket.user.email) !== normalizeSessionEmail(state.sessionMeta.teacher)) return;
        state.sessionMeta.roleModeActive = false;
        state.sessionMeta.teacher = "";
        state.sessionMeta.learner = "";
        state.sessionMeta.boardLocked = false;
        state.sessionMeta.lockExpiresAt = null;
        clearLockTimer(payload.chatId);
      } else if (action === "setRole" && target && (payload.role === "teacher" || payload.role === "learner")) {
        state.sessionMeta[payload.role] = target;
      } else if (action === "setPermission" && target) {
        if (!canControlSession(state, socket.user.email)) return;
        const current = state.sessionMeta.permissions[target] || defaultPermission(false);
        state.sessionMeta.permissions[target] = {
          ...current,
          ...payload.permission,
        };
      } else if (action === "lockBoard") {
        if (!canControlSession(state, socket.user.email)) return;
        state.sessionMeta.boardLocked = Boolean(payload.locked);
        state.sessionMeta.lockExpiresAt = state.sessionMeta.boardLocked ? new Date(Date.now() + WHITEBOARD_LOCK_DURATION_MS) : null;
        if (state.sessionMeta.boardLocked) scheduleLockExpiry(payload.chatId);
        else clearLockTimer(payload.chatId);
      } else if (action === "followMode") {
        if (!canControlSession(state, socket.user.email)) return;
        state.sessionMeta.followMode = Boolean(payload.enabled);
      } else if (action === "kick" && target) {
        if (!canControlSession(state, socket.user.email)) return;
        io.to(payload.chatId).emit("whiteboardControl", {
          chatId: payload.chatId,
          action: "kicked",
          targetEmail: target,
          by: socket.user.email,
          traceId,
        });
      } else if (action === "setTemplate") {
        state.sessionMeta.activeTemplate = String(payload.template || "blank");
      }
      appendRecordingEvent(state, "control", socket.user.email, { action, target, payload });
      whiteboardStates.set(payload.chatId, state);
      queueWhiteboardPersist(payload.chatId);
      io.to(payload.chatId).emit("whiteboardSession", {
        chatId: payload.chatId,
        sessionMeta: state.sessionMeta,
        sender: socket.user.email,
        traceId,
      });
    });
    if (!enqueued) {
      ackErr(ack, traceId, "OVERLOADED", "queue_overloaded");
      endEvent("whiteboardControl", startedAt, traceId);
      return;
    }
    ackOk(ack, traceId);
    endEvent("whiteboardControl", startedAt, traceId);
  });

  socket.on("whiteboardAssetUpload", async (payload, ack) => {
    const traceId = genTraceId(payload?.traceId);
    const startedAt = startEvent("whiteboardAssetUpload", traceId);
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) {
      ackErr(ack, traceId, "FORBIDDEN_CHAT", "forbidden");
      endEvent("whiteboardAssetUpload", startedAt, traceId);
      return;
    }
    const preState = await loadWhiteboardState(payload.chatId);
    ensureSessionMeta(preState, payload.chatId);
    const uploadPerm = preState.sessionMeta.permissions?.[normalizeSessionEmail(socket.user.email)]?.canUpload;
    if (uploadPerm === false && !canControlSession(preState, socket.user.email)) {
      ackErr(ack, traceId, "UPLOAD_FORBIDDEN", "upload_forbidden");
      endEvent("whiteboardAssetUpload", startedAt, traceId);
      return;
    }
    const enqueued = enqueueChatTask(payload.chatId, async () => {
      const state = await loadWhiteboardState(payload.chatId);
      ensureSessionMeta(state, payload.chatId);
      const asset = payload.asset || {};
      const safeAsset = {
        id: String(asset.id || `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`),
        type: asset.type === "pdf-page" ? "pdf-page" : "image",
        name: String(asset.name || ""),
        mime: String(asset.mime || ""),
        key: String(asset.key || asset.data || ""),
        data: String(asset.data || asset.key || ""),
        page: Number(asset.page) || 1,
        width: Number(asset.width) || 0,
        height: Number(asset.height) || 0,
        x: Number(asset.x) || 0,
        y: Number(asset.y) || 0,
        rotation: Number(asset.rotation) || 0,
        scaleX: Number(asset.scaleX) || 1,
        scaleY: Number(asset.scaleY) || 1,
        z: Number(asset.z) || 1,
        version: Number(asset.version) || 1,
        createdBy: socket.user.email,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      const existingIdx = state.assets.findIndex((a) => a.id === safeAsset.id);
      if (existingIdx >= 0) state.assets[existingIdx] = { ...state.assets[existingIdx], ...safeAsset };
      else state.assets.push(safeAsset);
      appendRecordingEvent(state, "asset:upload", socket.user.email, { assetId: safeAsset.id, type: safeAsset.type });
      whiteboardStates.set(payload.chatId, state);
      queueWhiteboardPersist(payload.chatId);
      io.to(payload.chatId).emit("whiteboardAssetUpload", {
        chatId: payload.chatId,
        sender: socket.user.email,
        asset: safeAsset,
        traceId,
      });
    });
    if (!enqueued) {
      ackErr(ack, traceId, "OVERLOADED", "queue_overloaded");
      endEvent("whiteboardAssetUpload", startedAt, traceId);
      return;
    }
    ackOk(ack, traceId);
    endEvent("whiteboardAssetUpload", startedAt, traceId);
  });

  socket.on("whiteboardAssetAnnotate", async (payload, ack) => {
    const traceId = genTraceId(payload?.traceId);
    const startedAt = startEvent("whiteboardAssetAnnotate", traceId);
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) {
      ackErr(ack, traceId, "FORBIDDEN_CHAT", "forbidden");
      endEvent("whiteboardAssetAnnotate", startedAt, traceId);
      return;
    }
    socket.to(payload.chatId).emit("whiteboardAssetAnnotate", {
      chatId: payload.chatId,
      sender: socket.user.email,
      annotation: payload.annotation || {},
      traceId,
    });
    ackOk(ack, traceId);
    endEvent("whiteboardAssetAnnotate", startedAt, traceId);
  });

  socket.on("whiteboardAssetUpdate", async (payload, ack) => {
    const traceId = genTraceId(payload?.traceId);
    const startedAt = startEvent("whiteboardAssetUpdate", traceId);
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) {
      ackErr(ack, traceId, "FORBIDDEN_CHAT", "forbidden");
      endEvent("whiteboardAssetUpdate", startedAt, traceId);
      return;
    }
    const enqueued = enqueueChatTask(payload.chatId, async () => {
      const state = await loadWhiteboardState(payload.chatId);
      ensureSessionMeta(state, payload.chatId);
      const idx = state.assets.findIndex((a) => a.id === payload.assetId && !a.deletedAt);
      if (idx < 0) return;
      const current = state.assets[idx];
      const incomingVersion = Number(payload.version) || current.version + 1;
      if (incomingVersion <= Number(current.version || 0)) return;
      state.assets[idx] = {
        ...current,
        x: Number(payload.x ?? current.x) || 0,
        y: Number(payload.y ?? current.y) || 0,
        width: Number(payload.width ?? current.width) || 0,
        height: Number(payload.height ?? current.height) || 0,
        rotation: Number(payload.rotation ?? current.rotation) || 0,
        scaleX: Number(payload.scaleX ?? current.scaleX) || 1,
        scaleY: Number(payload.scaleY ?? current.scaleY) || 1,
        z: Number(payload.z ?? current.z) || 1,
        version: incomingVersion,
        updatedAt: new Date(),
      };
      whiteboardStates.set(payload.chatId, state);
      queueWhiteboardPersist(payload.chatId);
      io.to(payload.chatId).emit("whiteboardAssetUpdate", {
        chatId: payload.chatId,
        asset: state.assets[idx],
        traceId,
      });
    });
    if (!enqueued) {
      ackErr(ack, traceId, "OVERLOADED", "queue_overloaded");
      endEvent("whiteboardAssetUpdate", startedAt, traceId);
      return;
    }
    ackOk(ack, traceId);
    endEvent("whiteboardAssetUpdate", startedAt, traceId);
  });

  socket.on("whiteboardAssetDelete", async (payload, ack) => {
    const traceId = genTraceId(payload?.traceId);
    const startedAt = startEvent("whiteboardAssetDelete", traceId);
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) {
      ackErr(ack, traceId, "FORBIDDEN_CHAT", "forbidden");
      endEvent("whiteboardAssetDelete", startedAt, traceId);
      return;
    }
    const enqueued = enqueueChatTask(payload.chatId, async () => {
      const state = await loadWhiteboardState(payload.chatId);
      ensureSessionMeta(state, payload.chatId);
      state.assets = state.assets.map((asset) =>
        asset.id === payload.assetId ? { ...asset, deletedAt: new Date(), version: Number(asset.version || 1) + 1 } : asset
      );
      whiteboardStates.set(payload.chatId, state);
      queueWhiteboardPersist(payload.chatId);
      io.to(payload.chatId).emit("whiteboardAssetDelete", {
        chatId: payload.chatId,
        assetId: payload.assetId,
        traceId,
      });
    });
    if (!enqueued) {
      ackErr(ack, traceId, "OVERLOADED", "queue_overloaded");
      endEvent("whiteboardAssetDelete", startedAt, traceId);
      return;
    }
    ackOk(ack, traceId);
    endEvent("whiteboardAssetDelete", startedAt, traceId);
  });

  socket.on("whiteboardRecording", async (payload, ack) => {
    const traceId = genTraceId(payload?.traceId);
    const startedAt = startEvent("whiteboardRecording", traceId);
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) {
      ackErr(ack, traceId, "FORBIDDEN_CHAT", "forbidden");
      endEvent("whiteboardRecording", startedAt, traceId);
      return;
    }
    const enqueued = enqueueChatTask(payload.chatId, async () => {
      const state = await loadWhiteboardState(payload.chatId);
      ensureSessionMeta(state, payload.chatId);
      if (!canControlSession(state, socket.user.email)) return;
      const command = payload.command || "";
      if (command === "start") {
        state.sessionMeta.recordingActive = true;
        state.sessionMeta.recordingStartedAt = new Date();
        appendRecordingEvent(state, "recording:start", socket.user.email, {});
      } else if (command === "stop") {
        appendRecordingEvent(state, "recording:stop", socket.user.email, {});
        state.sessionMeta.recordingActive = false;
      } else if (command === "clear") {
        state.recordingLog = [];
      } else if (command === "save") {
        appendRecordingEvent(state, "recording:save", socket.user.email, { total: state.recordingLog.length });
      }
      whiteboardStates.set(payload.chatId, state);
      queueWhiteboardPersist(payload.chatId);
      io.to(payload.chatId).emit("whiteboardRecording", {
        chatId: payload.chatId,
        sender: socket.user.email,
        command,
        sessionMeta: state.sessionMeta,
        recordingLog: state.recordingLog,
        traceId,
      });
    });
    if (!enqueued) {
      ackErr(ack, traceId, "OVERLOADED", "queue_overloaded");
      endEvent("whiteboardRecording", startedAt, traceId);
      return;
    }
    ackOk(ack, traceId);
    endEvent("whiteboardRecording", startedAt, traceId);
  });

  socket.on("webrtcSignal", (payload, ack) => {
    const traceId = genTraceId(payload?.traceId);
    const startedAt = startEvent("webrtcSignal", traceId);
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) {
      ackErr(ack, traceId, "FORBIDDEN_CHAT", "forbidden");
      endEvent("webrtcSignal", startedAt, traceId);
      return;
    }
    if (isRateLimited(socket, "webrtcSignal", 150, 10000)) {
      ackErr(ack, traceId, "RATE_LIMITED", "rate_limited");
      endEvent("webrtcSignal", startedAt, traceId);
      return;
    }
    socket.to(payload.chatId).emit("webrtcSignal", {
      chatId: payload.chatId,
      sender: socket.user.email,
      senderName: payload.senderName,
      signalType: payload.signalType,
      signal: payload.signal,
      muted: payload.muted,
      traceId,
    });
    ackOk(ack, traceId);
    endEvent("webrtcSignal", startedAt, traceId);
  });

  socket.on("screenShareSignal", (payload) => {
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) return;
    socket.to(payload.chatId).emit("screenShareSignal", {
      chatId: payload.chatId,
      sender: socket.user.email,
      senderName: payload.senderName,
      type: payload.type,
      data: payload.data
    });
  });

  socket.on("lessonStart", (payload) => {
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId)) return;
    io.to(payload.chatId).emit("lessonStarted", {
      chatId: payload.chatId,
      senderEmail: socket.user.email,
      senderName: payload.senderName,
      skill: payload.skill
    });
  });

  socket.on("sessionConfirm", (payload) => {
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) return;
    io.to(payload.chatId).emit("sessionConfirmed", {
      chatId: payload.chatId,
      confirmerEmail: socket.user.email,
      senderName: payload.senderName,
      skill: payload.skill
    });
    socket.to(payload.chatId).emit("sessionStartRequest", {
      chatId: payload.chatId,
      senderEmail: socket.user.email,
      senderName: payload.senderName,
      skill: payload.skill
    });
  });

  socket.on("whiteboardCursorLeave", (payload) => {
    const traceId = genTraceId(payload?.traceId);
    const startedAt = startEvent("whiteboardCursorLeave", traceId);
    if (!payload || !payload.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) return;
    socket.to(payload.chatId).emit("whiteboardCursorLeave", {
      chatId: payload.chatId,
      sender: socket.user.email,
      traceId,
    });
    endEvent("whiteboardCursorLeave", startedAt, traceId);
  });

  // ═══════════════════════════════════════════════
  // Code Editor Events
  // ═══════════════════════════════════════════════
  socket.on("codeEditorJoin", async (payload, ack) => {
    const traceId = genTraceId(payload?.traceId);
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) return;
    const state = await loadCodeEditorState(payload.chatId);
    socket.emit("codeEditorState", {
      chatId: payload.chatId,
      content: state.content,
      language: state.language,
      revision: state.revision,
      traceId,
    });
    ackOk(ack, traceId);
  });

  socket.on("codeEditorSync", async (payload) => {
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) return;
    if (isRateLimited(socket, "codeEditorSync", 40, 1000)) return; // rate limit per sec
    const state = await loadCodeEditorState(payload.chatId);
    state.content = payload.content || state.content;
    state.revision = Math.max(state.revision, payload.revision || 0);
    codeEditorStates.set(payload.chatId, state);
    
    socket.to(payload.chatId).emit("codeEditorSync", {
      chatId: payload.chatId,
      sender: socket.user.email,
      content: state.content,
      revision: state.revision,
    });
  });

  socket.on("codeEditorSave", async (payload) => {
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) return;
    const state = await loadCodeEditorState(payload.chatId);
    state.content = payload.content || state.content;
    state.revision = Math.max(state.revision, payload.revision || 0);
    codeEditorStates.set(payload.chatId, state);
    queueCodeEditorPersist(payload.chatId);
    socket.emit("codeEditorSaved", { chatId: payload.chatId });
    socket.to(payload.chatId).emit("codeEditorSaved", { chatId: payload.chatId });
  });

  socket.on("codeEditorTyping", (payload) => {
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) return;
    socket.to(payload.chatId).emit("codeEditorTyping", {
      chatId: payload.chatId,
      sender: socket.user.email,
      typing: payload.typing,
    });
  });

  socket.on("codeEditorCursor", (payload) => {
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) return;
    socket.to(payload.chatId).emit("codeEditorCursor", {
      chatId: payload.chatId,
      sender: socket.user.email,
      position: payload.position,
    });
  });

  socket.on("codeEditorLanguage", async (payload) => {
    if (!payload?.chatId || !ensureJoined(socket, payload.chatId) || !canAccessChat(socket, payload.chatId)) return;
    const state = await loadCodeEditorState(payload.chatId);
    state.language = payload.language || state.language;
    codeEditorStates.set(payload.chatId, state);
    queueCodeEditorPersist(payload.chatId);
    socket.to(payload.chatId).emit("codeEditorLanguage", {
      chatId: payload.chatId,
      sender: socket.user.email,
      language: state.language,
    });
  });

  socket.on("codeEditorLeave", (payload) => {
    if (!payload?.chatId) return;
  });

  socket.on("disconnect", () => {
    if (socket.data.joinedChats && socket.user?.email) {
      socket.data.joinedChats.forEach((chatId) => {
        socket.to(chatId).emit("whiteboardCursorLeave", { chatId, sender: socket.user.email });
        // Emit offline event silently to peers (to handle lesson interruptions or chat offline states)
        socket.to(chatId).emit("peerDisconnected", { chatId, sender: socket.user.email });
      });
    }
    console.log("🔴 User disconnected:", socket.id);
  });
});

// ═══════════════════════════════════════════════
// NEW MODULES — AI, Feed, Marketplace
// ═══════════════════════════════════════════════
const aiService = require("./services/aiService");
const Post = require("./modules/Post");
const Skill = require("./modules/Skill");

// ═══════════════════════════════════════════════
// AI APIs
// ═══════════════════════════════════════════════

app.post("/api/ai/roadmap", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("learnSkills teachSkills").lean();
    const { goal } = req.body;
    if (!goal || typeof goal !== "string" || goal.trim().length < 3) {
      return res.status(400).json({ error: "يرجى تحديد هدف واضح" });
    }
    const roadmap = await aiService.generateRoadmap(goal.trim(), [
      ...(user?.teachSkills || []),
      ...(user?.learnSkills || []),
    ]);
    res.json({ roadmap, goal, provider: aiService.provider });
  } catch (err) {
    structuredLog("ai.roadmap_failed", { error: err.message });
    res.status(500).json({ error: "خطأ في توليد خطة التعلم" });
  }
});

app.post("/api/ai/mentor", authMiddleware, async (req, res) => {
  try {
    const { message, history, context } = req.body;
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "الرسالة مطلوبة" });
    }
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];
    const reply = await aiService.getMentorChat(message.trim(), safeHistory, context || {});
    res.json({ reply, provider: aiService.provider });
  } catch (err) {
    structuredLog("ai.mentor_failed", { error: err.message });
    res.status(500).json({ error: "خطأ في الحصول على رد المساعد الذكي" });
  }
});

app.post("/api/ai/review-code", authMiddleware, async (req, res) => {
  try {
    const { code, language } = req.body;
    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return res.status(400).json({ error: "الكود مطلوب" });
    }
    if (code.length > 50000) return res.status(413).json({ error: "الكود كبير جداً (الحد 50,000 حرف)" });
    const review = await aiService.reviewCode(code, language || "javascript");
    res.json({ review, provider: aiService.provider });
  } catch (err) {
    structuredLog("ai.code_review_failed", { error: err.message });
    res.status(500).json({ error: "خطأ في مراجعة الكود" });
  }
});

app.post("/api/ai/quiz", authMiddleware, async (req, res) => {
  try {
    const { skill, difficulty } = req.body;
    if (!skill || typeof skill !== "string") {
      return res.status(400).json({ error: "المهارة مطلوبة" });
    }
    const quiz = await aiService.generateQuiz(skill.trim(), difficulty || "medium");
    res.json({ quiz, provider: aiService.provider });
  } catch (err) {
    structuredLog("ai.quiz_failed", { error: err.message });
    res.status(500).json({ error: "خطأ في توليد الاختبار" });
  }
});

app.post("/api/ai/session-summary", authMiddleware, async (req, res) => {
  try {
    const { messages, metadata } = req.body;
    const summary = await aiService.summarizeSession(messages || [], metadata || {});
    res.json({ summary, provider: aiService.provider });
  } catch (err) {
    structuredLog("ai.summary_failed", { error: err.message });
    res.status(500).json({ error: "خطأ في تلخيص الجلسة" });
  }
});

app.post("/api/ai/career", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("teachSkills learnSkills completedSessions")
      .lean();
    const guidance = await aiService.getCareerGuidance(user || {});
    res.json({ guidance, provider: aiService.provider });
  } catch (err) {
    structuredLog("ai.career_failed", { error: err.message });
    res.status(500).json({ error: "خطأ في جلب التوجيه المهني" });
  }
});

app.get("/api/ai/skill-recommendations", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("teachSkills learnSkills completedSessions")
      .lean();
    const recommendations = await aiService.getSkillRecommendations(user || {});
    res.json({ recommendations, provider: aiService.provider });
  } catch (err) {
    structuredLog("ai.recommendations_failed", { error: err.message });
    res.status(500).json({ error: "خطأ في جلب توصيات المهارات" });
  }
});

// ═══════════════════════════════════════════════
// COMMUNITY FEED APIs
// ═══════════════════════════════════════════════

app.get("/api/feed", authMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, parseInt(req.query.limit) || 10);
    const type = req.query.type;
    const skip = (page - 1) * limit;
    const filter = { isHidden: false };
    if (type && ["achievement", "question", "resource", "milestone", "project", "general"].includes(type)) {
      filter.type = type;
    }
    const [posts, total] = await Promise.all([
      Post.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Post.countDocuments(filter),
    ]);
    res.json({ posts, total, page, limit, hasMore: skip + posts.length < total });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب المنشورات" });
  }
});

app.post("/api/feed/post", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("email username1 username2 avatar gamifyLevel").lean();
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });
    const { content, type, tags, attachments } = req.body;
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({ error: "محتوى المنشور مطلوب" });
    }
    if (content.length > 3000) return res.status(400).json({ error: "المحتوى طويل جداً" });
    const post = await Post.create({
      authorEmail: user.email,
      authorName: `${user.username1} ${user.username2}`,
      authorAvatar: user.avatar || "",
      authorLevel: user.gamifyLevel || "",
      content: content.trim(),
      type: type || "general",
      tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
      attachments: Array.isArray(attachments) ? attachments.slice(0, 5) : [],
    });
    // Socket.IO real-time broadcast
    io.emit("feed:new-post", { post });
    res.status(201).json({ post });
  } catch (err) {
    res.status(500).json({ error: "خطأ في نشر المنشور" });
  }
});

app.post("/api/feed/post/:id/like", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("email").lean();
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "المنشور غير موجود" });
    const idx = post.likes.indexOf(user.email);
    if (idx === -1) {
      post.likes.push(user.email);
    } else {
      post.likes.splice(idx, 1);
    }
    await post.save();
    res.json({ liked: idx === -1, likesCount: post.likes.length });
  } catch (err) {
    res.status(500).json({ error: "خطأ في تسجيل الإعجاب" });
  }
});

app.post("/api/feed/post/:id/comment", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("email username1 username2 avatar").lean();
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });
    const { content } = req.body;
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({ error: "محتوى التعليق مطلوب" });
    }
    const post = await Post.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          comments: {
            authorEmail: user.email,
            authorName: `${user.username1} ${user.username2}`,
            authorAvatar: user.avatar || "",
            content: content.trim().slice(0, 1000),
            date: new Date(),
          },
        },
      },
      { new: true, select: "comments" }
    );
    if (!post) return res.status(404).json({ error: "المنشور غير موجود" });
    res.json({ comment: post.comments[post.comments.length - 1] });
  } catch (err) {
    res.status(500).json({ error: "خطأ في إضافة التعليق" });
  }
});

app.delete("/api/feed/post/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("email role").lean();
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "المنشور غير موجود" });
    if (post.authorEmail !== user.email && !ADMIN_ROLES.includes(user.role)) {
      return res.status(403).json({ error: "غير مصرح بحذف هذا المنشور" });
    }
    await post.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "خطأ في حذف المنشور" });
  }
});

// ═══════════════════════════════════════════════
// SKILL MARKETPLACE APIs
// ═══════════════════════════════════════════════

app.get("/api/marketplace/skills", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(24, parseInt(req.query.limit) || 12);
    const skip = (page - 1) * limit;
    const filter = { status: "active" };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.level) filter.level = req.query.level;
    if (req.query.isPremium !== undefined) filter.isPremium = req.query.isPremium === "true";
    if (req.query.q) {
      const re = new RegExp(req.query.q.slice(0, 50), "i");
      filter.$or = [{ title: re }, { description: re }, { tags: re }];
    }
    const [skills, total] = await Promise.all([
      Skill.find(filter)
        .sort({ enrolledCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true }),
      Skill.countDocuments(filter),
    ]);
    res.json({ skills, total, page, limit, hasMore: skip + skills.length < total });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب المهارات" });
  }
});

app.get("/api/marketplace/skills/:id", async (req, res) => {
  try {
    const skill = await Skill.findById(req.params.id).lean({ virtuals: true });
    if (!skill || skill.status === "rejected") return res.status(404).json({ error: "المهارة غير موجودة" });
    await Skill.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });
    res.json({ skill });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب تفاصيل المهارة" });
  }
});

app.post("/api/marketplace/skills", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("email username1 username2 avatar").lean();
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });
    const { title, description, tags, category, level, language, duration, sessionCount, isPremium, coverImageUrl, videoIntroUrl, resources, whatYouLearn, prerequisites } = req.body;
    if (!title || !description) return res.status(400).json({ error: "العنوان والوصف مطلوبان" });
    const skill = await Skill.create({
      ownerEmail: user.email,
      ownerName: `${user.username1} ${user.username2}`,
      ownerAvatar: user.avatar || "",
      title: title.trim().slice(0, 100),
      description: description.trim().slice(0, 3000),
      tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
      category: category || "Technology",
      level: level || "beginner",
      language: language || "العربية",
      duration: Math.min(480, Math.max(15, parseInt(duration) || 60)),
      sessionCount: Math.min(20, Math.max(1, parseInt(sessionCount) || 4)),
      isPremium: Boolean(isPremium),
      coverImageUrl: coverImageUrl || "",
      videoIntroUrl: videoIntroUrl || "",
      resources: Array.isArray(resources) ? resources.slice(0, 20) : [],
      whatYouLearn: Array.isArray(whatYouLearn) ? whatYouLearn.slice(0, 10) : [],
      prerequisites: Array.isArray(prerequisites) ? prerequisites.slice(0, 10) : [],
    });
    res.status(201).json({ skill });
  } catch (err) {
    res.status(500).json({ error: "خطأ في نشر المهارة" });
  }
});

app.put("/api/marketplace/skills/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("email role").lean();
    const skill = await Skill.findById(req.params.id);
    if (!skill) return res.status(404).json({ error: "المهارة غير موجودة" });
    if (skill.ownerEmail !== user?.email && !ADMIN_ROLES.includes(user?.role)) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const allowed = ["title", "description", "tags", "category", "level", "language", "duration", "sessionCount", "isPremium", "coverImageUrl", "videoIntroUrl", "resources", "whatYouLearn", "prerequisites"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) skill[key] = req.body[key];
    }
    await skill.save();
    res.json({ skill });
  } catch (err) {
    res.status(500).json({ error: "خطأ في تحديث المهارة" });
  }
});

app.delete("/api/marketplace/skills/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("email role").lean();
    const skill = await Skill.findById(req.params.id);
    if (!skill) return res.status(404).json({ error: "المهارة غير موجودة" });
    if (skill.ownerEmail !== user?.email && !ADMIN_ROLES.includes(user?.role)) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    await skill.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "خطأ في حذف المهارة" });
  }
});

app.post("/api/marketplace/skills/:id/review", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("email username1 username2").lean();
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و 5" });
    const skill = await Skill.findById(req.params.id);
    if (!skill) return res.status(404).json({ error: "المهارة غير موجودة" });
    const existing = skill.reviews.find((r) => r.reviewerEmail === user.email);
    if (existing) return res.status(400).json({ error: "قيّمت هذه المهارة من قبل" });
    skill.reviews.push({
      reviewerEmail: user.email,
      reviewerName: `${user.username1} ${user.username2}`,
      rating,
      comment: (comment || "").trim().slice(0, 1000),
    });
    await skill.save();
    res.json({ ok: true, averageRating: skill.averageRating });
  } catch (err) {
    res.status(500).json({ error: "خطأ في إضافة التقييم" });
  }
});

// ═══════════════════════════════════════════════
// ANALYTICS APIs
// ═══════════════════════════════════════════════

app.get("/api/analytics/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("activityTimeline learningHours completedSessions dailyStreak badges gamifyPoints gamifyLevel reviews teachSkills learnSkills verifiedSkills")
      .lean();
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });

    // Build heatmap: last 52 weeks (365 days) from activityTimeline
    const heatmap = {};
    const now = new Date();
    for (const ev of (user.activityTimeline || [])) {
      const d = new Date(ev.date);
      if (now - d < 365 * 24 * 60 * 60 * 1000) {
        const key = d.toISOString().slice(0, 10);
        heatmap[key] = (heatmap[key] || 0) + 1;
      }
    }

    // Skill coverage for radar chart
    const skillCoverage = (user.teachSkills || []).slice(0, 8).map((s) => ({
      skill: s,
      level: user.verifiedSkills?.includes(s) ? 90 : 60,
      verified: user.verifiedSkills?.includes(s),
    }));

    // Reviews stats
    const reviews = user.reviews || [];
    const avgRating = reviews.length
      ? Math.round((reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.length) * 10) / 10
      : 0;

    // Monthly progress (last 6 months)
    const monthlyProgress = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const month = d.toLocaleString("ar-EG", { month: "short" });
      const year = d.getFullYear();
      const monthKey = `${year}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const count = (user.activityTimeline || []).filter((ev) => {
        const evDate = new Date(ev.date);
        return `${evDate.getFullYear()}-${String(evDate.getMonth() + 1).padStart(2, "0")}` === monthKey;
      }).length;
      monthlyProgress.push({ month, count });
    }

    res.json({
      heatmap,
      skillCoverage,
      monthlyProgress,
      stats: {
        learningHours: user.learningHours || 0,
        completedSessions: user.completedSessions || 0,
        dailyStreak: user.dailyStreak || 0,
        badges: (user.badges || []).length,
        gamifyPoints: user.gamifyPoints || 0,
        gamifyLevel: user.gamifyLevel || "عضو جديد",
        avgRating,
        reviewCount: reviews.length,
        verifiedSkills: (user.verifiedSkills || []).length,
        totalSkills: [...new Set([...(user.teachSkills || []), ...(user.learnSkills || [])])].length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب التحليلات" });
  }
});

// ═══════════════════════════════════════════════
// GAMIFICATION APIs
// ═══════════════════════════════════════════════

app.get("/api/gamification/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("gamifyPoints gamifyLevel badges dailyStreak lastActiveDate completedSessions learningHours verifiedSkills")
      .lean();
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });

    const g = computeGamification(user);
    const levelThresholds = [
      { level: "عضو جديد", minPoints: 0, maxPoints: 100, icon: "🌱" },
      { level: "متعلم نشيط", minPoints: 100, maxPoints: 300, icon: "🔥" },
      { level: "محترف", minPoints: 300, maxPoints: 700, icon: "⭐" },
      { level: "خبير", minPoints: 700, maxPoints: 1500, icon: "🏆" },
      { level: "أسطورة شارك", minPoints: 1500, maxPoints: Infinity, icon: "💎" },
    ];
    const currentLevel = levelThresholds.find((l) => g.points >= l.minPoints && g.points < l.maxPoints) || levelThresholds[0];
    const nextLevel = levelThresholds.find((l) => l.minPoints > g.points);
    const progressToNext = nextLevel
      ? Math.round(((g.points - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints)) * 100)
      : 100;

    // All badge definitions
    const allBadges = [
      { id: "first_session", name: "أول جلسة", icon: "🎯", description: "أتممت أول جلسة تعلم", earned: (user.completedSessions || 0) >= 1 },
      { id: "five_sessions", name: "خمس جلسات", icon: "🌟", description: "أتممت 5 جلسات تعلم", earned: (user.completedSessions || 0) >= 5 },
      { id: "verified", name: "مهارة موثقة", icon: "✅", description: "وثّقت مهارة باختبار", earned: (user.verifiedSkills || []).length > 0 },
      { id: "streak_7", name: "أسبوع متواصل", icon: "🔥", description: "سلسلة 7 أيام متواصلة", earned: (user.dailyStreak || 0) >= 7 },
      { id: "streak_30", name: "شهر متواصل", icon: "💫", description: "سلسلة 30 يوماً متواصلة", earned: (user.dailyStreak || 0) >= 30 },
      { id: "hours_10", name: "10 ساعات تعلم", icon: "⏰", description: "تجاوزت 10 ساعات تعلم", earned: (user.learningHours || 0) >= 10 },
      { id: "hours_100", name: "100 ساعة تعلم", icon: "🏅", description: "تجاوزت 100 ساعة تعلم", earned: (user.learningHours || 0) >= 100 },
    ];

    // Active challenges
    const challenges = [
      {
        id: "weekly_sessions", title: "3 جلسات هذا الأسبوع", icon: "📚", type: "weekly",
        xpReward: 50, current: Math.min(3, user.completedSessions || 0), target: 3,
        completed: (user.completedSessions || 0) >= 3,
      },
      {
        id: "verify_skill", title: "وثّق مهارة جديدة", icon: "✅", type: "monthly",
        xpReward: 100, current: Math.min(1, (user.verifiedSkills || []).length), target: 1,
        completed: (user.verifiedSkills || []).length >= 1,
      },
      {
        id: "streak_7", title: "حافظ على سلسلة 7 أيام", icon: "🔥", type: "weekly",
        xpReward: 75, current: Math.min(7, user.dailyStreak || 0), target: 7,
        completed: (user.dailyStreak || 0) >= 7,
      },
      {
        id: "hours_5", title: "تعلّم 5 ساعات هذا الشهر", icon: "⏰", type: "monthly",
        xpReward: 80, current: Math.min(5, user.learningHours || 0), target: 5,
        completed: (user.learningHours || 0) >= 5,
      },
    ];

    res.json({
      points: g.points,
      level: g.level,
      currentLevel,
      nextLevel: nextLevel || null,
      progressToNext,
      dailyStreak: user.dailyStreak || 0,
      badges: allBadges,
      earnedBadges: allBadges.filter((b) => b.earned),
      challenges,
    });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب ملف الإنجازات" });
  }
});

app.post("/api/gamification/claim-daily", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "مستخدم غير موجود" });
    const today = new Date().toISOString().slice(0, 10);
    if (user.lastActiveDate === today) {
      return res.json({ alreadyClaimed: true, streak: user.dailyStreak, message: "تم جمع مكافأة اليوم بالفعل!" });
    }
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const newStreak = user.lastActiveDate === yesterday ? (user.dailyStreak || 0) + 1 : 1;
    const xpReward = Math.min(50, 10 + newStreak * 2);
    user.dailyStreak = newStreak;
    user.lastActiveDate = today;
    user.gamifyPoints = (user.gamifyPoints || 0) + xpReward;
    user.activityTimeline.push({ type: "streak", title: "سلسلة يومية", detail: `اليوم ${newStreak} على التوالي`, date: new Date() });
    await user.save();
    res.json({ claimed: true, streak: newStreak, xpReward, message: `تهانينا! يوم ${newStreak} على التوالي 🔥` });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جمع المكافأة" });
  }
});

// ═══════════════════════════════════════════════
// CERTIFICATE VERIFICATION API
// ═══════════════════════════════════════════════

app.get("/api/certificates/verify/:certId", async (req, res) => {
  try {
    const { certId } = req.params;
    if (!certId || typeof certId !== "string" || certId.length < 8) {
      return res.status(400).json({ error: "معرف الشهادة غير صالح" });
    }
    // Search across all users' certificates
    const user = await User.findOne({
      "certificates.url": { $regex: certId },
    }).select("username1 username2 email certificates").lean();

    // Also check verifiedSkills test certificates
    const userByTestCert = await User.findOne({
      email: certId.split("_")[0],
    }).select("username1 username2 email verifiedSkills skillTestResults").lean();

    if (user) {
      const cert = user.certificates.find((c) => (c.url || "").includes(certId));
      return res.json({
        valid: true,
        certificate: {
          holderName: `${user.username1} ${user.username2}`,
          holderEmail: user.email,
          title: cert?.title || "شهادة إتمام",
          issuer: cert?.issuer || "منصة شارك",
          year: cert?.year || new Date().getFullYear(),
          certId,
        },
      });
    }

    if (userByTestCert) {
      const skillPart = certId.split("_")[1];
      if (skillPart && userByTestCert.verifiedSkills?.includes(skillPart)) {
        return res.json({
          valid: true,
          certificate: {
            holderName: `${userByTestCert.username1} ${userByTestCert.username2}`,
            holderEmail: userByTestCert.email,
            title: `شهادة توثيق مهارة: ${skillPart}`,
            issuer: "منصة شارك — اختبار مهارات",
            year: new Date().getFullYear(),
            certId,
          },
        });
      }
    }

    res.status(404).json({ valid: false, error: "الشهادة غير موجودة أو تم إلغاؤها" });
  } catch (err) {
    res.status(500).json({ error: "خطأ في التحقق من الشهادة" });
  }
});

// ═══════════════════════════════════════════════
// FEATURED USERS (for landing page)
// ═══════════════════════════════════════════════

app.get("/api/users/featured", async (req, res) => {
  try {
    const users = await User.find({
      status: "active",
      "verifiedSkills.0": { $exists: true },
    })
      .sort({ gamifyPoints: -1 })
      .limit(6)
      .select("username1 username2 avatar teachSkills verifiedSkills gamifyLevel gamifyPoints reviews completedSessions")
      .lean();

    const featured = users.map((u) => {
      const reviews = u.reviews || [];
      return {
        name: `${u.username1} ${u.username2}`,
        avatar: u.avatar || "",
        teachSkills: (u.teachSkills || []).slice(0, 3),
        verifiedSkills: (u.verifiedSkills || []).slice(0, 3),
        level: u.gamifyLevel || "عضو",
        points: u.gamifyPoints || 0,
        completedSessions: u.completedSessions || 0,
        avgRating: reviews.length
          ? Math.round((reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.length) * 10) / 10
          : 0,
        reviewCount: reviews.length,
      };
    });

    res.json({ featured });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب المدرسين المميزين" });
  }
});

// ═══════════════════════════════════════════════
// NOTIFICATION PREFERENCES
// ═══════════════════════════════════════════════

app.get("/api/notification-preferences", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("notificationPreferences").lean();
    // Default preferences if not set
    const defaults = {
      matches: true, sessions: true, community: true, challenges: true,
      aiUpdates: true, email: false, frequency: "instant",
    };
    res.json({ preferences: { ...defaults, ...(user?.notificationPreferences || {}) } });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب الإعدادات" });
  }
});

app.put("/api/notification-preferences", authMiddleware, async (req, res) => {
  try {
    const { preferences } = req.body;
    if (!preferences || typeof preferences !== "object") {
      return res.status(400).json({ error: "الإعدادات مطلوبة" });
    }
    const allowed = ["matches", "sessions", "community", "challenges", "aiUpdates", "email", "frequency"];
    const sanitized = {};
    for (const key of allowed) {
      if (preferences[key] !== undefined) sanitized[key] = preferences[key];
    }
    await User.findByIdAndUpdate(req.userId, { notificationPreferences: sanitized });
    res.json({ ok: true, preferences: sanitized });
  } catch (err) {
    res.status(500).json({ error: "خطأ في حفظ الإعدادات" });
  }
});

// ═══════════════════════════════════════════════
// ADMIN DASHBOARD ENDPOINTS
// ═══════════════════════════════════════════════

const adminMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "غير مصرح — يتطلب توكن الإدارة" });
    }
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password").lean();
    if (!user) return res.status(401).json({ error: "المستخدم غير موجود" });

    const isAdmin = ADMIN_ROLES.includes(user.role) || (user.email && user.email.toLowerCase() === "sharik@gmail.com");
    if (!isAdmin) {
      return res.status(403).json({ error: "غير مصرح — هذه الصفحة خاصة بالإدارة فقط" });
    }
    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    return res.status(401).json({ error: "توكن غير صالحة" });
  }
};

// 1. Admin Stats Endpoint
app.get("/api/admin/stats", adminMiddleware, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: { $ne: "banned" } });
    const bannedUsers = await User.countDocuments({ status: "banned" });
    const totalSessions = await Session.countDocuments();
    const totalMatches = await Match.countDocuments();
    const totalMessages = await Message.countDocuments();

    const users = await User.find().select("learnSkills teachSkills").lean();
    const learnSkillCounts = {};
    const teachSkillCounts = {};

    users.forEach(u => {
      (u.learnSkills || []).forEach(s => learnSkillCounts[s] = (learnSkillCounts[s] || 0) + 1);
      (u.teachSkills || []).forEach(s => teachSkillCounts[s] = (teachSkillCounts[s] || 0) + 1);
    });

    const topLearnSkills = Object.entries(learnSkillCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    const topTeachSkills = Object.entries(teachSkillCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));

    res.json({
      ok: true,
      stats: {
        totalUsers,
        activeUsers,
        bannedUsers,
        totalSessions,
        totalMatches,
        totalMessages,
        topLearnSkills,
        topTeachSkills,
      }
    });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب إحصائيات الإدارة" });
  }
});

// 2. Admin Users Directory Endpoint
app.get("/api/admin/users", adminMiddleware, async (req, res) => {
  try {
    const { q, role, status, limit = 100, skip = 0 } = req.query;
    const filter = {};

    if (q) {
      const regex = new RegExp(q.trim(), "i");
      filter.$or = [
        { username1: regex },
        { username2: regex },
        { email: regex },
        { learnSkills: regex },
        { teachSkills: regex }
      ];
    }
    if (role) filter.role = role;
    if (status) filter.status = status;

    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    const total = await User.countDocuments(filter);
    res.json({ ok: true, users, total });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب قائمة المستخدمين" });
  }
});

// 3. Admin Change User Status / Role
app.put("/api/admin/users/:id/status", adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, role, banReason } = req.body;

    const update = {};
    if (status) update.status = status;
    if (role) update.role = role;
    if (banReason !== undefined) update.banReason = banReason;

    const updatedUser = await User.findByIdAndUpdate(id, update, { new: true }).select("-password").lean();
    if (!updatedUser) return res.status(404).json({ error: "المستخدم غير موجود" });

    res.json({ ok: true, user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: "خطأ في تحديث حالة المستخدم" });
  }
});

// 4. Admin Messages Inspection Endpoint
app.get("/api/admin/messages", adminMiddleware, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    const messages = await Message.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ ok: true, messages });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب الرسائل" });
  }
});

// 5. Admin Reports Endpoint
app.get("/api/admin/reports", adminMiddleware, async (req, res) => {
  try {
    const reports = await Report.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ ok: true, reports });
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب البلاغات" });
  }
});

// ═══════════════════════════════════════════════
// API VERSION HEADERS
// ═══════════════════════════════════════════════
app.use("/api/", (req, res, next) => {
  res.setHeader("X-API-Version", "v1");
  next();
});

// ═══════════════════════════════════════════════
// MongoDB Connection & Server Start
// ═══════════════════════════════════════════════
initRedisAdapterIfEnabled();
// Start server first so Railway doesn't timeout
server.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Sharik server running on port ${port}`);
});

// الاتصال بـ MongoDB من متغيرات البيئة (.env) أو المضيف المحلي في حال عدم وجودها
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/sharik";
mongoose
  .connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: true,
  })
  .then(() => {
    console.log(`✅ Connected to MongoDB (${mongoose.connection.name} @ ${mongoose.connection.host})`);
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err.message);
  });
