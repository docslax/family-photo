require("dotenv").config();

const cookieParser = require("cookie-parser");
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const expressLayouts = require("express-ejs-layouts");
const convertHeic = require('heic-convert');

const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD;
const app = express();
const PORT = 3030;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout");

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));
app.use(express.urlencoded({ extended: true }));

// Middleware to get client IP
app.set('trust proxy', true); // important if behind proxy
const getClientIp = req =>
  req.headers['x-forwarded-for']?.split(',')[0].trim() || req.connection.remoteAddress;
app.use(express.json());

app.use(cookieParser());

const reactionsPath = path.join(__dirname, "reactions.json");
const mediaJsonPath = path.join(__dirname, "media.json");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (_, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

function loadMediaMetadata() {
  try {
    return JSON.parse(fs.readFileSync(mediaJsonPath, "utf-8"));
  } catch {
    return [];
  }
}

function saveMediaMetadata(data) {
  fs.writeFileSync(mediaJsonPath, JSON.stringify(data, null, 2));
}

function requireUploadAuth(req, res, next) {
  if (req.cookies.uploadAuth === "true") {
    return next(); // already logged in
  }
  res.redirect("/upload-auth");
}

app.use((req, res, next) => {
  const host = req.headers.host || '';
  const isDirectPort = host === 'hyperzsoft.net:3030';

  console.log(`🔁 Redirecting ${host}${req.url} → https://gallery.hyperzsoft.net${req.url}`);

  // Redirect only public access via hyperzsoft.net:3030
  if (isDirectPort) {
    return res.redirect(301, `https://gallery.hyperzsoft.net${req.url}`);
  }

  next();
});

// Routes
app.get("/", (req, res) => {
  const metadata = loadMediaMetadata();
  const media = metadata.map((entry) => {
    const ext = path.extname(entry.filename).toLowerCase();
    return {
      ...entry,
      type: /\.(mp4|webm|ogg)$/i.test(ext) ? "video" : "image",
    };
  });

  const reactions = fs.existsSync(reactionsPath)
  ? JSON.parse(fs.readFileSync(reactionsPath, "utf8"))
  : {};

  res.render("index", { media, reactions });
});

app.get("/upload", requireUploadAuth, (req, res) => {
  res.render("upload"); // your actual upload form
});

app.get("/upload-auth", (req, res) => {
  res.render("upload-password", { error: null });
});

app.post("/upload-auth", (req, res) => {
  const { password } = req.body;
  if (password === UPLOAD_PASSWORD) {
    res.cookie("uploadAuth", "true", { maxAge: 7 * 24 * 60 * 60 * 1000 }); // 7 days
    res.redirect("/upload");
  } else {
    res.render("upload-password", { error: "Incorrect password." });
  }
});

app.post('/upload', requireUploadAuth, upload.array('media', 10), async (req, res) => {
  const uploaded = req.files;
  let descriptions = req.body.description;

  if (!Array.isArray(descriptions)) {
    descriptions = [descriptions];
  }

  const metadata = loadMediaMetadata();

  for (let i = 0; i < uploaded.length; i++) {
    const file = uploaded[i];
    const ext = path.extname(file.originalname).toLowerCase();
    const filePath = path.join('uploads', file.filename);

    let finalFilename = file.filename;

    if (ext === '.heic') {
      const jpgFilename = file.filename.replace(/\.heic$/i, '.jpg');
      const jpgPath = path.join('uploads', jpgFilename);

      try {
        const inputBuffer = fs.readFileSync(filePath);
        const outputBuffer = await convertHeic({
          buffer: inputBuffer,
          format: 'JPEG',
          quality: 1
        });

        fs.writeFileSync(jpgPath, outputBuffer);
        fs.unlinkSync(filePath); // delete .heic only if conversion succeeds
        finalFilename = jpgFilename;
      } catch (err) {
        console.warn(`⚠️ HEIC conversion failed for ${file.filename}, keeping original.`);
        // keep original .heic and continue using that as the filename
      }
    }

    metadata.push({
      filename: finalFilename,
      description: descriptions[i] || ''
    });
  }

  saveMediaMetadata(metadata);
  res.redirect('/');
});

app.post("/react", (req, res) => {
  const { filename, emoji, uuid } = req.body;
  const ip = getClientIp(req);

  if (!filename || !emoji || !uuid) {
    return res.status(400).json({ error: "Missing data" });
  }

  let reactions = {};
  if (fs.existsSync(reactionsPath)) {
    reactions = JSON.parse(fs.readFileSync(reactionsPath, "utf8"));
  }

  if (!reactions[filename]) reactions[filename] = {};
  if (!reactions[filename][emoji]) {
    reactions[filename][emoji] = { count: 0, users: [] };
  }

  const alreadyReacted = reactions[filename][emoji].users.some(
    (u) => u.ip === ip && u.uuid === uuid
  );

  if (!alreadyReacted) {
    reactions[filename][emoji].count += 1;
    reactions[filename][emoji].users.push({ ip, uuid });
    fs.writeFileSync(reactionsPath, JSON.stringify(reactions, null, 2));
  }

  res.json({ count: reactions[filename][emoji].count });
});

app.listen(3030, '0.0.0.0', () => {
  console.log("Server listening on 0.0.0.0:3030");
});
