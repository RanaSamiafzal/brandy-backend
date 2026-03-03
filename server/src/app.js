import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser';


const app = express()

// we use cors  for setting that which origin we will accept the req 
app.use(cors({
    origin: process.env.CORS_ORIGIN,
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
import router from './routes/userRoute.js'
import brandRouter from './routes/brandRoute.js'


// routes declaration creating api

app.use('/api/v1/users',router)
app.use('/api/v1/brands',brandRouter)

export {app}

