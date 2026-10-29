import mongoose from "mongoose";
import ProductionJob from "../models/productionJob.model.js";
import {
    downloadFileFromGridFS,
    deleteFileFromGridFS
} from "../services/gridfs.service.js";

const getOutputPdf = async (req, res) => {
    try {
        const { jobId } = req.params;
        const isDownload = req.query.download === "true" || req.path.endsWith("/download");

        console.log(
            `\n[OUTPUT] Request received for job: ${jobId} (Mode: ${isDownload ? "DOWNLOAD & AUTO-DELETE" : "INLINE PREVIEW"})`
        );

        /*
        |--------------------------------------------------------------------------
        | Validate Job ID
        |--------------------------------------------------------------------------
        */
        if (!mongoose.Types.ObjectId.isValid(jobId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid job ID."
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Find Job
        |--------------------------------------------------------------------------
        */
        const job = await ProductionJob.findById(jobId);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Production job not found."
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Check if file processing is COMPLETED
        |--------------------------------------------------------------------------
        */
        if (job.status !== "COMPLETED") {
            return res.status(400).json({
                success: false,
                message: `File processing is not completed yet (current status: ${job.status}). Only completed files can be downloaded.`
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Check output file exists
        |--------------------------------------------------------------------------
        */
        if (!job.outputFileId) {
            return res.status(404).json({
                success: false,
                message: "Output PDF has not been generated yet."
            });
        }

        console.log("[OUTPUT] Output fileId:", job.outputFileId.toString());

        /*
        |--------------------------------------------------------------------------
        | Download from GridFS / Local Storage
        |--------------------------------------------------------------------------
        */
        const pdfBuffer = await downloadFileFromGridFS(job.outputFileId);

        if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Output PDF content is empty or not found."
            });
        }

        console.log("[OUTPUT] Downloaded:", pdfBuffer.length, "bytes");

        /*
        |--------------------------------------------------------------------------
        | Send PDF (Attachment for Download, Inline for Preview)
        |--------------------------------------------------------------------------
        */
        const outputFileName = `imposed_${job.originalFileName.replace(/\.pdf$/i, "")}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Length", pdfBuffer.length);
        res.setHeader(
            "Content-Disposition",
            `${isDownload ? "attachment" : "inline"}; filename="${outputFileName}"`
        );

        // --------------------------------------------------------------------------
        // If downloaded: automatically delete file and job from DB after transfer
        // --------------------------------------------------------------------------
        if (isDownload) {
            res.on("finish", async () => {
                try {
                    console.log(`\n[AUTO-DELETE] Download completed for Job #${jobId}. Automatically cleaning up database record and storage files...`);
                    
                    if (job.fileId) {
                        await deleteFileFromGridFS(job.fileId).catch(() => {});
                    }
                    if (job.outputFileId) {
                        await deleteFileFromGridFS(job.outputFileId).catch(() => {});
                    }
                    if (job.productionConfig?.crop?.outputFileId) {
                        await deleteFileFromGridFS(job.productionConfig.crop.outputFileId).catch(() => {});
                    }

                    await ProductionJob.findByIdAndDelete(jobId);
                    console.log(`[AUTO-DELETE] Job #${jobId} and its associated files successfully deleted from DB.`);
                } catch (cleanupErr) {
                    console.error(`[AUTO-DELETE ERROR] Failed to clean up job #${jobId}:`, cleanupErr.message);
                }
            });
        }

        return res.send(pdfBuffer);

    } catch (error) {
        console.error("[OUTPUT] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve output PDF.",
            error: error.message
        });
    }
};

const getSourcePdf = async (req, res) => {
    try {
        const { jobId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(jobId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid job ID."
            });
        }

        const job = await ProductionJob.findById(jobId);
        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Production job not found."
            });
        }

        // Use cropped output if available, otherwise original uploaded file
        const targetFileId = job.productionConfig?.crop?.outputFileId || job.fileId;
        if (!targetFileId) {
            return res.status(404).json({
                success: false,
                message: "PDF file not found for this job."
            });
        }

        const pdfBuffer = await downloadFileFromGridFS(targetFileId);
        if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
            return res.status(404).json({
                success: false,
                message: "PDF content is empty or not found."
            });
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Length", pdfBuffer.length);
        res.setHeader(
            "Content-Disposition",
            `inline; filename="${job.originalFileName}"`
        );

        return res.send(pdfBuffer);
    } catch (error) {
        console.error("[SOURCE PDF] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve source PDF.",
            error: error.message
        });
    }
};

export {
    getOutputPdf,
    getSourcePdf
};
