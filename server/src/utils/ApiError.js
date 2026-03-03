class ApiError extends Error {
    constructor(
        statusCode,
        message = "Something went wrong",
        errors = [],
        stack = ""
    ){
        super(message)
        this.statusCode = statusCode 
        this.data = null 
        this.message = message
        this.success = false
        this.errors = errors
     
        if(stack){
            this.stack = stack
        } else {
            Error.captureStackTrace(this,this.constructor)
        }

    }
}

export {ApiError}


// WHY ? crate this file

// so we use this ApiError file for  return the  error properly  
// like : res.return(400).json({message: error.message , success : false})
// so we will standardized this error  return by creating this ApiError