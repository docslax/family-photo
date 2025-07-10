const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const uploadsDir = path.join(__dirname, 'uploads');
const mediaJsonPath = path.join(__dirname, 'media.json');
const metadata = JSON.parse(fs.readFileSync(mediaJsonPath, 'utf-8'));

(async () => {
  for (const item of metadata) {
    const filePath = path.join(uploadsDir, item.filename);
    const ext = path.extname(item.filename).toLowerCase();

    if (ext === '.mov' && fs.existsSync(filePath)) {
      const mp4Filename = item.filename.replace(/\.mov$/i, '.mp4');
      const mp4Path = path.join(uploadsDir, mp4Filename);

      try {
        console.log(`🎥 Converting ${item.filename} to ${mp4Filename}...`);
        execSync(`ffmpeg -i "${filePath}" -vcodec libx264 -acodec aac "${mp4Path}"`);
        fs.unlinkSync(filePath);
        item.filename = mp4Filename;
        console.log(`✅ Converted: ${mp4Filename}`);
      } catch (err) {
        console.error(`❌ Failed to convert ${item.filename}:`, err.message);
      }
    }
  }

  fs.writeFileSync(mediaJsonPath, JSON.stringify(metadata, null, 2));
  console.log('✅ Done converting .mov files.');
})();
