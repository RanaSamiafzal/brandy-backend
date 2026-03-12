// const asyncHandler =(requestHandler)=>{
//     return (req,res,next)=>{
//         Promise.resolve(requestHandler(req,res,next))
//         .catch((err)=>next(err))
//     }
// }
// export {asyncHandler}

import { validationStatus } from "./ValidationStatusCode.js"

const AsyncHandler = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next)
    } catch (error) {
        res.status(validationStatus.internalError).json({
            success: false,
            message: error.message
        })
    }
}

export { AsyncHandler }