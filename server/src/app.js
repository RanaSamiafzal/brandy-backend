import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser';


const app = express()

// we use cors  for setting that which origin we will accept the req 
app.use(cors({
    origin: ["http://localhost:5173", process.env.CORS_ORIGIN],
    credentials: true

}))

// for accept jason here but set the limit of accepting json
app.use(express.json({ limit: '16kb' }))

// here we use urlencoded for receiving data from url 
app.use(express.urlencoded({
    extended: true,
    limit: '16kb'
})) // use  extended for accepting nested object

app.use(express.static('public'))
// use static for storing the files or pdf pr images in our server  and 
// that is available  for everyone  
// and set  folder reference of public/temp

app.use(cookieParser())
import passport from './config/passport.js'
app.use(passport.initialize());

// import routes 
import authRouter from './routes/authRoutes.js'
import userRouter from './routes/userRoutes.js'
import brandRouter from './routes/brandRoutes.js'
import influencerRouter from './routes/influencerRoutes.js'
import campaignRouter from './routes/campaignRoutes.js'
import collaborationRequestRouter from './routes/collaborationRequestRoutes.js'
import collaborationRouter from './routes/collaborationRoutes.js'

// routes declaration
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/users', userRouter)
app.use('/api/v1/brands', brandRouter)
app.use('/api/v1/influencers', influencerRouter)
app.use('/api/v1/campaigns', campaignRouter)
app.use('/api/v1/collaboration-requests', collaborationRequestRouter)
app.use('/api/v1/collaborations', collaborationRouter)

export { app }
