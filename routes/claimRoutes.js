const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfjsLib = require('pdfjs-dist');
const pool = require('../config/db');
const { GoogleGenAI } = require("@google/genai");

const router = express.Router();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const storage = multer.diskStorage({
    destination: (req, file, cb) => { 
        if (!fs.existsSync('uploads/')) fs.mkdirSync('uploads/');
        cb(null, 'uploads/'); 
    },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

router.post('/upload', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        const dataBuffer = new Uint8Array(fs.readFileSync(req.file.path));
        const loadingTask = pdfjsLib.getDocument(dataBuffer);
        const pdf = await loadingTask.promise;
        
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + "\n";
        }

        const cleanedFullText = fullText.replace(/\0/g, '');
        const lines = cleanedFullText.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 30);

        try {
            for (let claim of lines) {
                await pool.query(
                    'INSERT INTO claims (claim_text, user_id, status) VALUES ($1, $2, $3)',
                    [claim, 1, 'pending']
                );
            }
            console.log("✅ Claims saved to DB!");
        } catch (dbErr) {
            console.error("❌ DB Save Error:", dbErr.message);
        }

        res.json({ message: "Success!", text: cleanedFullText, claims: lines });

    } catch (err) {
        console.error("❌ Extraction Error:", err);
        res.status(500).json({ error: "Extraction fail: " + err.message });
    }
});

// --- UPDATED VERIFY ROUTE ---
router.post('/verify', async (req, res) => {
    const { claimText } = req.body;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `You are an expert fact-checker for an assignment evaluation.
            
            Statement: "${claimText}". 
            
            Your Task:
            1. Verify if this statement/stat is true based on latest web data.
            2. If it is accurate, set status as "Verified".
            3. If it is slightly wrong or outdated, set status as "Inaccurate".
            4. If it is completely false, set status as "False".
            5. In the "explanation" field, ALWAYS provide the current/real fact if the claim is wrong. If it's correct, explain why.

            Return ONLY a JSON object:
            {
              "status": "Verified" or "Inaccurate" or "False",
              "explanation": "Provide the real, updated facts here. Be specific with numbers/dates."
            }
            Do not use markdown. Just raw JSON.`,
        });

        const aiText = response.text;
        console.log("AI Raw Response:", aiText);

        const cleanedJson = aiText.replace(/```json|```/g, "").trim();
        const factCheckResult = JSON.parse(cleanedJson);

        try {
            await pool.query(
                'UPDATE claims SET status = $1, explanation = $2 WHERE claim_text = $3',
                [factCheckResult.status, factCheckResult.explanation, claimText]
            );
            console.log("✅ Claim status updated in DB!");
        } catch (dbErr) {
            console.error("❌ DB Update Error:", dbErr.message);
        }

        res.json(factCheckResult);

    } catch (err) {
        console.error("❌ Gemini 3 Error:", err.message);
        res.status(500).json({ 
            error: "AI verification failed", 
            details: err.message,
            status: "Error",
            explanation: "Could not process AI response."
        });
    }
});

module.exports = router;