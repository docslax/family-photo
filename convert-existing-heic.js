const fs = require('fs');
const path = require('path');
const convert = require('heic-convert');

const uploadsDir = path.join(__dirname, 'uploads');
const mediaJsonPath = path.join(__dirname, 'media.json');

const metadata = JSON.parse(fs.readFileSync(mediaJsonPath, 'utf-8'));

(async () => {
  for (const item of metadata) {
    const filePath = path.join(uploadsDir, item.filename);
    if (path.extname(item.filename).toLowerCase() === '.heic' && fs.existsSync(filePath)) {
      const jpgFilename = item.filename.replace(/\.heic$/i, '.jpg');
      const jpgPath = path.join(uploadsDir, jpgFilename);

      try {
        const inputBuffer = fs.readFileSync(filePath);
        const outputBuffer = await convert({
          buffer: inputBuffer,
          format: 'JPEG',
          quality: 1
        });

        fs.writeFileSync(jpgPath, outputBuffer);
        fs.unlinkSync(filePath);
        item.filename = jpgFilename;
        console.log(`Converted: ${item.filename}`);
      } catch (err) {
        console.error(`Failed to convert: ${item.filename}`, err);
      }
    }
  }

  fs.writeFileSync(mediaJsonPath, JSON.stringify(metadata, null, 2));
  console.log('✅ Done converting existing HEIC files.');
})();
