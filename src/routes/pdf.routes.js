import express from 'express';

import upload from '../middleware/upload.middleware.js';
import { uploadPdf } from '../controllers/pdf.controller.js';
import { analyzeProductionPdf } from '../controllers/pdfAnalyzer.controller.js';
import { validateProductionPdf } from '../controllers/pdfValidation.controller.js';
import { cropProductionPdf } from '../controllers/pdfCrop.controller.js';
import { getOutputPdf, getSourcePdf } from '../controllers/pdfOutput.controller.js';
import { getJobHistory, getJobDetails, deleteJob } from '../controllers/history.controller.js';

const router = express.Router();

// Upload & History
router.post('/upload', upload.single('file'), uploadPdf);
router.get('/history', getJobHistory);
router.get('/job/:jobId', getJobDetails);
router.delete('/job/:jobId', deleteJob);

// Pipeline Stages
router.post("/:jobId/analyze", analyzeProductionPdf);
router.post("/:jobId/validate", validateProductionPdf);
router.post("/:jobId/crop", cropProductionPdf);
router.get("/:jobId/source", getSourcePdf);
router.get("/:jobId/output", getOutputPdf);
router.get("/:jobId/download", getOutputPdf);

export default router;
