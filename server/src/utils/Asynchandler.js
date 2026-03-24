// const asyncHandler =(requestHandler)=>{
//     return (req,res,next)=>{
//         Promise.resolve(requestHandler(req,res,next))
//         .catch((err)=>next(err))
//     }
// }
// export {asyncHandler}

import { validationStatus } from "./ValidationStatusCode.js"

const AsyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err))
    }
}

export { AsyncHandler }