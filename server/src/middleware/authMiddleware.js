import { ApiError } from "../utils/ApiError.js";
import { AsyncHandler } from "../utils/Asynchandler.js";
import { validationStatus } from "../utils/ValidationStatusCode.js";
import jwt from 'jsonwebtoken'
import User from './../models/userModel.js';

export const verifyJwt=AsyncHandler(async(req,res,next)=>{
    try {
        // get token from cookies
        const token=req.cookies?.accessToken || req.header('Authorization')?.replace('Bearer ','')
        if (!token){
            throw new ApiError(validationStatus.unauthorized,'unauthorized request')
        }

    // DECODE the token to verify to verify if from secret key 
    const decodeToken=jwt.verify(token,process.env.ACCESS_TOKEN_SECRET)
 const user=await User.findById(decodeToken?._id).select('-password -refreshToken')
 if(!user){
    throw new ApiError(validationStatus.unauthorized,'invalid access token')
 }
 req.user = user;
 next();
    } catch (error) {
        throw new ApiError(validationStatus.unauthorized,error?.message || 'Invalid Access token')
    }
})
