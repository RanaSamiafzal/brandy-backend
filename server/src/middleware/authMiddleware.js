import { ApiError } from "../utils/ApiError.js";
import { AsyncHandler } from "../utils/Asynchandler.js";
import { validationStatus } from "../utils/ValidationStatusCode.js";
import jwt from 'jsonwebtoken'
import User from './../modules/user/user.model.js';

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
 if(user.isBlocked){
    throw new ApiError(validationStatus.forbidden,'Your account has been blocked. Contact support.')
 }
 if(user.isDeactivated){
    throw new ApiError(validationStatus.forbidden,'Your account is deactivated. Please login to reactivate.')
 }
 req.user = user;
 next();
    } catch (error) {
        throw new ApiError(error.statusCode || validationStatus.unauthorized, error?.message || 'Invalid Access token')
    }
})
