class ApiResponse {
    constructor(
       statusCode,
       data,
       message='success',
    ){
        this.statusCode=statusCode,
        this.data=data,
        this.message=message
    }
}

export {ApiResponse}

// WHY ? create this file 

// so we use this ApiResponse file for  return the response properly  
// like : res.return(400).json({message: error.message , success : false})
// so we will standardized this response  return by creating this ApiResponse