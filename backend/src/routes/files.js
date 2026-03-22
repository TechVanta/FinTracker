import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { initiateUpload, processFile, listFiles, deleteFile } from "../services/fileService.js";

const router = Router();

router.post("/upload", requireAuth, async (req, res) => {
  try {
    const { filename, content_type } = req.body;
    if (!filename || !content_type) {
      return res.status(400).json({ detail: "filename and content_type are required" });
    }
    const result = await initiateUpload(req.userId, filename, content_type);
    return res.status(201).json(result);
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

router.post("/:fileId/process", requireAuth, async (req, res) => {
  try {
    const result = await processFile(req.params.fileId, req.userId);
    return res.json(result);
  } catch (err) {
    console.error("Process error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

router.delete("/:fileId", requireAuth, async (req, res) => {
  try {
    const result = await deleteFile(req.params.fileId, req.userId);
    return res.json(result);
  } catch (err) {
    console.error("Delete file error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const files = await listFiles(req.userId);
    return res.json(files);
  } catch (err) {
    console.error("List files error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

export default router;
