import nodemailer from "nodemailer";
import { ApiError } from "./ApiError.js";
import { validationStatus } from "./ValidationStatusCode.js";


const transporter=nodemailer.createTransport({
    host:process.env.EMAIL_HOST,
    port:process.env.EMAIL_PORT,
    secure:false,
    auth:{
        user:process.env.EMAIL_USER,
        pass:process.env.EMAIL_PASS,
    }
})

const sendEmail=async({to,subject,html})=>{
    try{
        await transporter.sendMail({
            from:`Brandly support <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        });
    }catch(error){
        console.log("Email error:",error.message);
        throw new ApiError(
            validationStatus.internalError,"Email could notbe sent"
        )
    }
};

export {sendEmail}