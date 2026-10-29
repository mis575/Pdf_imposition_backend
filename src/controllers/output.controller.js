import mongoose from "mongoose";
import ProductionJob from "../models/productionJob.model.js";
import {
    downloadFileFromGridFS,
    deleteFileFromGridFS
} from "../services/gridfs.service.js";

const downloadOutputPdf = async (req, res) => {
    try {
        const { fileId } = req.params;
        const isDownload = req.query.download === "true";

        // -----------------------------------------
        // Validate ObjectId
        // -----------------------------------------
        if (!mongoose.Types.ObjectId.isValid(fileId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid file ID."
            });
        }

        const objId = new mongoose.Types.ObjectId(fileId);

        // -----------------------------------------
        // Find Associated Job
        // -----------------------------------------
        const job = await ProductionJob.findOne({
            $or: [
                { outputFileId: objId },
                { fileId: objId }
            ]
        });

        // -----------------------------------------
        // Check if file is COMPLETED
        // -----------------------------------------
        if (job && job.status !== "COMPLETED") {
            return res.status(400).json({
                success: false,
                message: `File processing is not completed yet (current status: ${job.status}). Only completed files can be downloaded.`
            });
        }

        // -----------------------------------------
        // Download from Storage / GridFS
        // -----------------------------------------
        const pdfBuffer = await downloadFileFromGridFS(fileId);

        if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Output PDF not found or is empty."
            });
        }

        // -----------------------------------------
        // Send PDF
        // -----------------------------------------
        const outputFileName = job
            ? `imposed_${job.originalFileName.replace(/\.pdf$/i, "")}.pdf`
            : "imposed-output.pdf";

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Length", pdfBuffer.length);
        res.setHeader(
            "Content-Disposition",
            `${isDownload ? "attachment" : "inline"}; filename="${outputFileName}"`
        );

        // -----------------------------------------
        // Auto-Delete from DB after download completes
        // -----------------------------------------
        if (isDownload && job) {
            res.on("finish", async () => {
                try {
                    console.log(`\n[AUTO-DELETE] Download completed for File #${fileId} (Job #${job._id}). Cleaning up DB...`);
                    
                    if (job.fileId) {
                        await deleteFileFromGridFS(job.fileId).catch(() => {});
                    }
                    if (job.outputFileId) {
                        await deleteFileFromGridFS(job.outputFileId).catch(() => {});
                    }
                    if (job.productionConfig?.crop?.outputFileId) {
                        await deleteFileFromGridFS(job.productionConfig.crop.outputFileId).catch(() => {});
                    }

                    await ProductionJob.findByIdAndDelete(job._id);
                    console.log(`[AUTO-DELETE] Job #${job._id} successfully deleted from DB.`);
                } catch (cleanupErr) {
                    console.error("[AUTO-DELETE ERROR]", cleanupErr.message);
                }
            });
        }

        return res.status(200).send(pdfBuffer);

    } catch (error) {
        console.error("Output PDF Download Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to download output PDF.",
            error: error?.message ?? "Unknown error."
        });
    }
};

export {
    downloadOutputPdf
};
