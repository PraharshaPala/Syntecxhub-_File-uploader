const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFSBucket, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(express.json());

// 1. DATABASE CONNECTION
let gridFSBucket;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");
    const db = mongoose.connection.db;
    gridFSBucket = new GridFSBucket(db, { bucketName: "uploads" });
  })
  .catch(err => console.log("DB Connection Error: ", err));

// 2. MULTER CONFIGURATION
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 3. HOME ROUTE (Displays Upload Form, Retrieves Files List, & Handles Deletion)
app.get('/', async (req, res) => {
  try {
    // Retrieve all files currently stored in GridFS
    const files = await gridFSBucket.find().toArray();
    
    // Generate HTML for the file list with Download and Delete actions
    let fileListHTML = files.length === 0 ? '<p>No files uploaded yet.</p>' : '<ul style="list-style: none; padding: 0;">';
    
    files.forEach(file => {
      fileListHTML += `
        <li style="background: #f4f4f4; margin: 10px 0; padding: 15px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: bold;">${file.filename}</span>
          <div>
            <a href="/file/${file._id}" target="_blank" style="background: #007bff; color: white; padding: 5px 10px; text-decoration: none; border-radius: 3px; margin-right: 10px;">View/Download</a>
            <button onclick="deleteFile('${file._id}')" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">Delete</button>
          </div>
        </li>
      `;
    });
    if (files.length > 0) fileListHTML += '</ul>';

    // Return complete UI page
    res.send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="text-align: center;">File Management Panel</h2>
          
          <div style="border: 2px dashed #ccc; padding: 20px; text-align: center; margin-bottom: 30px; border-radius: 8px;">
            <form action="/upload" method="POST" enctype="multipart/form-data">
              <input type="file" name="file" required style="margin-bottom: 15px;" />
              <br />
              <button type="submit" style="background: #28a745; color: white; border: none; padding: 10px 25px; font-size: 16px; border-radius: 5px; cursor: pointer;">Upload File</button>
            </form>
          </div>

          <h3>Stored Files Inventory</h3>
          ${fileListHTML}

          <script>
            function deleteFile(id) {
              if (confirm('Are you sure you want to delete this file?')) {
                fetch('/file/' + id, { method: 'DELETE' })
                  .then(res => res.json())
                  .then(data => {
                     alert(data.message || data.error);
                     window.location.reload(); // Refresh screen to show changes
                  });
              }
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Error reading file database.");
  }
});

// 4. UPLOAD ROUTE
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file selected.');

  const uploadStream = gridFSBucket.openUploadStream(req.file.originalname);
  uploadStream.end(req.file.buffer);

  uploadStream.on('finish', () => {
    res.send('<script>alert("Uploaded Successfully!"); window.location="/";</script>');
  });
});

// 5. RETRIEVE ROUTE (Downloads / displays the raw file onto the screen)
app.get('/file/:id', (req, res) => {
  try {
    const _id = new ObjectId(req.params.id);
    const downloadStream = gridFSBucket.openDownloadStream(_id);
    
    downloadStream.on('data', (chunk) => res.write(chunk));
    downloadStream.on('error', () => res.status(404).json({ error: "File not found" }));
    downloadStream.on('end', () => res.end());
  } catch (err) {
    res.status(400).json({ error: "Invalid File ID" });
  }
});

// 6. DELETE ROUTE (Removes the file blocks from MongoDB)
app.delete('/file/:id', async (req, res) => {
  try {
    const _id = new ObjectId(req.params.id);
    await gridFSBucket.delete(_id);
    res.json({ message: "File deleted successfully!" });
  } catch (err) {
    res.status(404).json({ error: "File not found or already deleted" });
  }
});

// 7. SERVER START
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on port 5000"));