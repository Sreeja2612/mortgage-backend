const express = require('express')
const cors = require('cors')

const app = express()

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  console.log("ROOT HIT")
  res.send("Server working 🚀")
})

app.get('/loans', (req, res) => {
  console.log("LOANS HIT")
  res.json([
    { id: 1, borrower: "John Doe", amount: 300000 },
    { id: 2, borrower: "Jane Smith", amount: 450000 }
  ])
})

app.listen(5001, () => {
  console.log("Server running on port 5001")
})