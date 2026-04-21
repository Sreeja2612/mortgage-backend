require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const multer = require('multer')
const fs = require('fs')

const app = express()
app.use(cors({
  origin: '*'
}))
app.use(express.json())

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const upload = multer({ dest: 'uploads/' })
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads')

app.get('/', (req, res) => {
  res.send('LoanFlow backend running')
})

app.get('/loans', async (req, res) => {
  try {
    const { role } = req.query
    let query = 'SELECT * FROM loans ORDER BY created_at DESC'
    let params = []
    if (role) {
      query = 'SELECT * FROM loans WHERE role = $1 ORDER BY created_at DESC'
      params = [role]
    }
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    console.error('GET /loans error:', err)
    res.status(500).json({ error: 'Failed to fetch loans' })
  }
})

app.post('/loans', async (req, res) => {
  try {
    const { borrower, amount, status, role } = req.body
    const result = await pool.query(
      'INSERT INTO loans (borrower, amount, status, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [borrower, amount, status, role || 'Broker']
    )
    console.log('New loan created:', result.rows[0])
    res.json(result.rows[0])
  } catch (err) {
    console.error('POST /loans error:', err)
    res.status(500).json({ error: 'Failed to create loan' })
  }
})

app.post('/extract-document', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const filePath = req.file.path
    const fileData = fs.readFileSync(filePath)
    const base64Data = fileData.toString('base64')
    const mimeType = req.file.mimetype

    console.log('Extracting:', req.file.originalname, mimeType)

    const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      },
      `You are a mortgage document processor. Extract information from this document and return ONLY a valid JSON object with exactly these fields:
{
  "borrower": "full name of the person",
  "amount": 450000,
  "employer": "employer name or empty string",
  "status": "Application"
}
Rules:
- amount must be a number only, no dollar sign or commas
- If you see annual income use that as amount
- If you see a loan amount use that as amount
- borrower must be full name only
- Return ONLY the JSON object, nothing else`
    ])

    fs.unlinkSync(filePath)

    const text = result.response.text().trim()
    console.log('Gemini response:', text)

    const clean = text.replace(/```json|```/g, '').trim()
    const extracted = JSON.parse(clean)
    res.json(extracted)

  } catch (err) {
    console.error('Extract error:', err)
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    res.status(500).json({ error: 'Failed to extract document' })
  }
})

app.listen(5001, () => {
  console.log('Server running on port 5001')
})



app.put('/loans/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    const result = await pool.query(
      'UPDATE loans SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    )
    console.log('Loan updated:', result.rows[0])
    res.json(result.rows[0])
  } catch (err) {
    console.error('PUT /loans error:', err)
    res.status(500).json({ error: 'Failed to update loan' })
  }
})

app.delete('/loans/:id', async (req, res) => {
  try {
    const { id } = req.params
    await pool.query('DELETE FROM loans WHERE id = $1', [id])
    console.log('Loan deleted:', id)
    res.json({ success: true })
  } catch (err) {
    console.error('DELETE /loans error:', err)
    res.status(500).json({ error: 'Failed to delete loan' })
  }
})