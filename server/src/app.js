import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser';
import passport from './config/passport.js'
import authRouter from './modules/auth/auth.routes.js'
import userRouter from './modules/user/user.routes.js'
import brandRouter from './modules/brand/brand.routes.js'
import influencerRouter from './modules/influencer/influencer.routes.js'
import campaignRouter from './modules/campaign/campaign.routes.js'
import collaborationRouter from './modules/collaboration/collaboration.routes.js'
import activityRouter from './modules/activity/activity.routes.js'
import { errorMiddleware } from './middleware/errorMiddleware.js';


const app = express()

// we use cors  for setting that which origin we will accept the req 
app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:3000", process.env.CORS_ORIGIN],
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
app.use(passport.initialize());

// routes declaration
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/users', userRouter)
app.use('/api/v1/brands', brandRouter)
app.use('/api/v1/influencers', influencerRouter)
app.use('/api/v1/campaigns', campaignRouter)
app.use('/api/v1/collaborations', collaborationRouter)
app.use('/api/v1/activities', activityRouter)

app.get('/api/v1/ping', (req, res) => res.json({ 
    status: 'ok', 
    server: 'brandy-backend-primary',
    timestamp: new Date().toISOString()
}))

// Error handling middleware
app.use(errorMiddleware);

export { app }
