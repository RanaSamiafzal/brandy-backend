import {v2 as cloudinary} from "cloudinary"
import fs from 'fs'

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

const uploadOnCloudinary = async (LocalFilePath) => {
    try {
        if (!LocalFilePath) return null;

        // upload file on cloudinary 
        const response = await cloudinary.uploader.upload(LocalFilePath, {
            resource_type: 'auto'
        })

        // file has been successfully uploaded 
        console.log('File has been uploaded successfully',
            response.url
         );

        // after saving the file into  cloudinary we get access to the file system and then unlink the file so 
        // it will deleted the file from the public/temp folder 
        fs.unlinkSync(LocalFilePath)

        // console.log(response);
        
        return response;

    } catch (error) {
        fs.unlinkSync(LocalFilePath)  // remove the locally saved temporary file as the upload operation got failed
        return null;
    }
}
export { uploadOnCloudinary }