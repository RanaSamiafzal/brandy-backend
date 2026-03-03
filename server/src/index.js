import connectDB from "./config/db.js";
import dotenv from 'dotenv'

dotenv.config({
    path:'.env'
})
import {app} from './app.js'

const port = process.env.PORT || 8000 ;
connectDB()
.then( ()=>{
    app.listen(port,()=>{
        console.log(`Server is running on port : ${port}`);
    })
    app.on('error',(error)=>{
        console.log(`ERROR : ${error}`);
        throw error
    })
})
.catch( (err)=> {
    console.log("MONGODB Connection failed !!! ",err);

} )