import connectDB from "./config/db.js";
import dotenv from 'dotenv'
import { createServer } from "http";
import { Server } from "socket.io";
import User from "./modules/user/user.model.js";

dotenv.config({
    path:'.env'
})
import {app} from './app.js'
import initializeSocket from "./config/socket.js";

const port = process.env.PORT || 8000 ;

const httpServer = createServer(app);
initializeSocket(httpServer, app);

connectDB()
.then( ()=>{
    httpServer.listen(port,()=>{
        console.log(`Server is running on port : ${port}`);
    })
    httpServer.on('error',(error)=>{
        console.log(`ERROR : ${error}`);
        throw error
    })
})
.catch( (err)=> {
    console.log("MONGODB Connection failed !!! ",err);

} )