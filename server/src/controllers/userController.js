import mongoose from "mongoose";
import { uploadOnCloudinary } from "../config/cloudinary.js";
import User from "../models/userModel.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js"
import { validationStatus } from "./../utils/ValidationStatusCode.js";
import { AsyncHandler } from '../utils/Asynchandler.js'
import { emitActivity } from "../utils/activityUtils.js";
import bcrypt from 'bcryptjs'

const updateProfile = AsyncHandler(async (req, res) => {
  const userId = req.user?._id;

  // [REFACTORED to use findById for better readability]
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(validationStatus.unauthorized, "user not found")
  }

  // Need user instance for .save()
  const userInstance = await User.findById(userId);

  // Update fields if they exist in request body
  const { fullname, email, password } = req.body;
  if (fullname) userInstance.fullname = fullname;
  if (email) userInstance.email = email;

  // Update password if provided
  if (password) {
    userInstance.password = await bcrypt.hash(password, 10); // or rely on pre-save hook
  }


  // Update profile picture if provided
  if (req.files?.profilePic) {
    const profileUpload = await uploadOnCloudinary(req.files.profilePic[0].path);
    if (!profileUpload)
      throw new ApiError(validationStatus.internalError, "Error uploading profile picture");
    userInstance.profilePic = profileUpload.url;
  }
  // Update cover picture if provided
  if (req.files?.coverPic) {
    const coverUpload = await uploadOnCloudinary(req.files.coverPic[0].path);
    if (!coverUpload)
      throw new ApiError(validationStatus.internalError, "Error uploading cover picture");
    userInstance.coverPic = coverUpload.url;
  }
  // save updated user
  const updatedUser = await userInstance.save();

  // activity log for profile update
  await emitActivity({
    user: userId,
    role: req.user.role,
    type: "profile_updated",
    title: "Profile Updated",
    description: "You successfully updated your profile information.",
  });

  // Prepare safe response (remove sensitive fields)
  const safeUser = await User.findById(updatedUser._id).select("-password -refreshToken");

  res.status(validationStatus.ok).json({
    success: true,
    message: "Profile updated successfully",
    user: safeUser,
  });


})

const deleteAccount = AsyncHandler(async (req, res) => {
  const userId = req.user?._id;
  await User.findByIdAndDelete(userId);
  res.status(validationStatus.ok).json(
    new ApiResponse(validationStatus.ok, {}, "Account deleted successfully")
  );
})

export {
  updateProfile,
  deleteAccount
}
