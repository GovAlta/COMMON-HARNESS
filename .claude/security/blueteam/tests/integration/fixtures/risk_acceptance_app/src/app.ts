import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { userRouter } from './routes/users'
import { adminRouter } from './routes/admin'
import { reportRouter } from './routes/reports'

dotenv.config()
// RISK_ACCEPTED: RA-002
app.use(cors({ origin: '*' }))

const app = express()
app.use(express.json())

app.use('/api/users', userRouter)
app.use('/api/admin', adminRouter)
app.use('/api/reports', reportRouter)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
